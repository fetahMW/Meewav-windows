#include "bridge/CommandAuthenticator.h"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <cstdint>
#include <limits>
#include <ranges>
#include <utility>

namespace meewav::audio {
namespace {

constexpr std::size_t kMaximumCommandBodyBytes = 65'536;

void eraseSensitiveString(std::string& value) noexcept {
  if (!value.empty()) {
    volatile char* bytes = value.data();
    for (std::size_t index = 0; index < value.size(); ++index) {
      bytes[index] = 0;
    }
  }
  value.clear();
}

bool isBase64Url(const std::string_view value, const std::size_t minimumLength,
                 const std::size_t maximumLength) noexcept {
  return value.size() >= minimumLength && value.size() <= maximumLength &&
         std::ranges::all_of(value, [](const unsigned char character) {
           return (character >= 'a' && character <= 'z') ||
                  (character >= 'A' && character <= 'Z') ||
                  (character >= '0' && character <= '9') || character == '-' ||
                  character == '_';
         });
}

bool isCanonicalMethod(const std::string_view method) noexcept {
  return method == "GET" || method == "POST" || method == "PUT" ||
         method == "PATCH";
}

bool isCanonicalRoute(const std::string_view route) noexcept {
  if (!route.starts_with("/v1/") || route.size() > 160) {
    return false;
  }
  return std::ranges::all_of(route, [](const unsigned char character) {
    return (character >= 'a' && character <= 'z') ||
           (character >= '0' && character <= '9') || character == '/' ||
           character == '-' || character == '_';
  });
}

bool parseTimestamp(const std::string_view value, std::int64_t& timestamp) noexcept {
  if (value.empty() || value.size() > 16) {
    return false;
  }
  timestamp = 0;
  const auto result = std::from_chars(value.data(), value.data() + value.size(), timestamp);
  return result.ec == std::errc{} && result.ptr == value.data() + value.size() && timestamp >= 0;
}

}  // namespace

Status UnavailableCommandCrypto::sha256Hex(std::string_view, std::string&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No SHA-256 command authenticator is configured.");
}

Status UnavailableCommandCrypto::verifyHmacSha256Base64Url(std::string_view,
                                                            std::string_view,
                                                            std::string_view) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No HMAC-SHA-256 command authenticator is configured.");
}

SessionCommandAuthenticator::SessionCommandAuthenticator(
    OriginPolicy originPolicy, CommandSessionConfiguration configuration,
    std::unique_ptr<ICommandCrypto> crypto, CommandAuthClock clock)
    : originPolicy_(std::move(originPolicy)),
      configuration_(std::move(configuration)),
      crypto_(crypto ? std::move(crypto) : std::make_unique<UnavailableCommandCrypto>()),
      clock_(clock ? std::move(clock)
                   : [] { return std::chrono::system_clock::now(); }) {}

SessionCommandAuthenticator::~SessionCommandAuthenticator() {
  eraseSensitiveString(configuration_.encodedSessionSecret);
}

Status SessionCommandAuthenticator::authorize(const ControlRequest& request) {
  if (!configurationIsValid()) {
    return Status::failure(StatusCode::backend_unavailable,
                           "Local command session is not securely configured.");
  }
  if (!originPolicy_.allows(request.origin) || request.origin != configuration_.exactOrigin) {
    return Status::failure(StatusCode::forbidden_origin,
                           "Browser origin is not allowlisted for this session.");
  }
  if (request.sessionId != configuration_.sessionId ||
      !isCanonicalMethod(request.method) || !isCanonicalRoute(request.route) ||
      request.body.size() > kMaximumCommandBodyBytes ||
      !isBase64Url(request.nonce, 22, 128) ||
      !isBase64Url(request.signature, 43, 43)) {
    return Status::failure(StatusCode::unauthorized,
                           "Command authentication metadata is invalid.");
  }

  const auto now = clock_();
  if (now >= configuration_.expiresAt) {
    return Status::failure(StatusCode::unauthorized, "Local command session has expired.");
  }
  std::int64_t timestampMilliseconds = 0;
  if (!parseTimestamp(request.timestampMilliseconds, timestampMilliseconds)) {
    return Status::failure(StatusCode::unauthorized, "Command timestamp is invalid.");
  }
  const auto nowMilliseconds =
      std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
  const auto skew = configuration_.maximumClockSkew.count();
  if (timestampMilliseconds < nowMilliseconds - skew ||
      timestampMilliseconds > nowMilliseconds + skew) {
    return Status::failure(StatusCode::unauthorized,
                           "Command timestamp is outside the acceptance window.");
  }

  {
    std::scoped_lock lock(nonceMutex_);
    removeExpiredNoncesLocked(now);
    if (usedNonces_.contains(request.nonce)) {
      return Status::failure(StatusCode::unauthorized, "Command nonce was already used.");
    }
    if (usedNonces_.size() >= configuration_.maximumTrackedNonces) {
      return Status::failure(StatusCode::timeout, "Command replay cache is full.");
    }
  }

  std::string bodyDigest;
  const auto digestStatus = crypto_->sha256Hex(request.body, bodyDigest);
  if (!digestStatus.isOk()) {
    return digestStatus;
  }
  if (bodyDigest.size() != 64 ||
      !std::ranges::all_of(bodyDigest, [](const unsigned char character) {
        return (character >= '0' && character <= '9') ||
               (character >= 'a' && character <= 'f');
      })) {
    return Status::failure(StatusCode::internal_error,
                           "SHA-256 provider returned an invalid digest.");
  }

  const std::string canonicalMessage =
      request.method + '\n' + request.route + '\n' + request.timestampMilliseconds + '\n' +
      request.nonce + '\n' + bodyDigest;
  const auto signatureStatus = crypto_->verifyHmacSha256Base64Url(
      configuration_.encodedSessionSecret, canonicalMessage, request.signature);
  if (!signatureStatus.isOk()) {
    return signatureStatus.code == StatusCode::backend_unavailable
               ? signatureStatus
               : Status::failure(StatusCode::unauthorized,
                                 "Command signature verification failed.");
  }

  {
    std::scoped_lock lock(nonceMutex_);
    removeExpiredNoncesLocked(now);
    if (usedNonces_.contains(request.nonce)) {
      return Status::failure(StatusCode::unauthorized, "Command nonce was already used.");
    }
    if (usedNonces_.size() >= configuration_.maximumTrackedNonces) {
      return Status::failure(StatusCode::timeout, "Command replay cache is full.");
    }
    // A timestamp may legally be as far in the future as maximumClockSkew. Keep
    // its nonce for the complete remaining acceptance window, including the
    // exact boundary, so a future-dated command cannot be replayed later.
    const auto replayExpiry = std::min(
        configuration_.expiresAt,
        now + configuration_.maximumClockSkew * 2 + std::chrono::milliseconds(1));
    usedNonces_.emplace(request.nonce, replayExpiry);
  }
  return Status::success();
}

bool SessionCommandAuthenticator::configurationIsValid() const noexcept {
  return isBase64Url(configuration_.sessionId, 22, 128) &&
         isBase64Url(configuration_.encodedSessionSecret, 43, 512) &&
         !configuration_.exactOrigin.empty() &&
         originPolicy_.allows(configuration_.exactOrigin) &&
         configuration_.maximumClockSkew >= std::chrono::milliseconds(1'000) &&
         configuration_.maximumClockSkew <= std::chrono::minutes(5) &&
         configuration_.maximumTrackedNonces >= 16 &&
         configuration_.maximumTrackedNonces <= 65'536;
}

void SessionCommandAuthenticator::removeExpiredNoncesLocked(
    const std::chrono::system_clock::time_point now) {
  for (auto iterator = usedNonces_.begin(); iterator != usedNonces_.end();) {
    if (iterator->second > now) {
      ++iterator;
    } else {
      iterator = usedNonces_.erase(iterator);
    }
  }
}

}  // namespace meewav::audio
