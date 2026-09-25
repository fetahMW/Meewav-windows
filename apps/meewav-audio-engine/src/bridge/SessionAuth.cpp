#include "bridge/SessionAuth.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstddef>
#include <string>
#include <utility>

namespace meewav::audio {
namespace {

constexpr std::size_t kMaximumPendingPairings = 32;
constexpr std::size_t kMaximumActiveSessions = 16;
constexpr auto kLocalSessionTtl = std::chrono::hours(8);

void eraseSensitiveString(std::string& value) noexcept {
  if (!value.empty()) {
    volatile char* bytes = value.data();
    for (std::size_t index = 0; index < value.size(); ++index) {
      bytes[index] = 0;
    }
  }
  value.clear();
}

class SensitiveStringGuard final {
 public:
  explicit SensitiveStringGuard(std::string& value) : value_(value) {}
  ~SensitiveStringGuard() { eraseSensitiveString(value_); }

  SensitiveStringGuard(const SensitiveStringGuard&) = delete;
  SensitiveStringGuard& operator=(const SensitiveStringGuard&) = delete;

 private:
  std::string& value_;
};

bool isBase64UrlToken(const std::string& value, const std::size_t minimumLength,
                      const std::size_t maximumLength) {
  return value.size() >= minimumLength && value.size() <= maximumLength &&
         std::ranges::all_of(value, [](const unsigned char character) {
           return std::isalnum(character) != 0 || character == '-' || character == '_';
         });
}

std::string ticketProofMessage(const std::string& pairingId, const std::string& clientNonce,
                               const std::string& browserOrigin, const std::string& sessionId,
                               const std::string& sessionSecret) {
  return pairingId + '\n' + clientNonce + '\n' + browserOrigin + '\n' + sessionId + '\n' +
         sessionSecret;
}

}  // namespace

Status RejectAllPairingTicketConsumer::consume(const PairingTicketConsumption&,
                                               VerifiedPairingTicket&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No HTTPS one-use pairing-ticket consumer is configured.");
}

Status UnavailableSessionIdGenerator::generate(std::string&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No cryptographically secure session ID generator is configured.");
}

Status UnavailableSessionSecretGenerator::generate(std::string&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No cryptographically secure session secret generator is configured.");
}

Status UnavailableTicketProofGenerator::generate(const std::string&, const std::string&,
                                                  std::string&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No HMAC-SHA-256 ticket-proof generator is configured.");
}

SessionAuth::SessionAuth(OriginPolicy originPolicy,
                         std::unique_ptr<IPairingTicketConsumer> ticketConsumer,
                         std::unique_ptr<ISessionIdGenerator> sessionIdGenerator,
                         std::unique_ptr<ISessionSecretGenerator> secretGenerator,
                         std::unique_ptr<ITicketProofGenerator> ticketProofGenerator)
    : originPolicy_(std::move(originPolicy)),
      ticketConsumer_(ticketConsumer ? std::move(ticketConsumer)
                                     : std::make_unique<RejectAllPairingTicketConsumer>()),
      sessionIdGenerator_(sessionIdGenerator
                              ? std::move(sessionIdGenerator)
                              : std::make_unique<UnavailableSessionIdGenerator>()),
      secretGenerator_(secretGenerator ? std::move(secretGenerator)
                                       : std::make_unique<UnavailableSessionSecretGenerator>()),
      ticketProofGenerator_(ticketProofGenerator
                                 ? std::move(ticketProofGenerator)
                                 : std::make_unique<UnavailableTicketProofGenerator>()) {}

SessionAuth::~SessionAuth() {
  std::scoped_lock lock(stateMutex_);
  for (auto& [pairingId, pending] : pendingPairings_) {
    (void)pairingId;
    eraseSensitiveString(pending.opaqueTicket);
  }
  for (auto& [sessionId, active] : activeSessions_) {
    (void)sessionId;
    eraseSensitiveString(active.secret);
    eraseSensitiveString(active.ticketProof);
  }
  pendingPairings_.clear();
  activeSessions_.clear();
}

Status SessionAuth::consumePairingTicket(const std::string& pairingId,
                                         const std::string& opaqueTicket,
                                         const std::string& clientNonce,
                                         const std::string& browserOrigin) {
  if (!originPolicy_.allows(browserOrigin)) {
    return Status::failure(StatusCode::forbidden_origin, "Browser origin is not allowlisted.");
  }
  if (pairingId.size() < 8 || pairingId.size() > 128 || opaqueTicket.size() < 64 ||
      opaqueTicket.size() > 8'192 || clientNonce.size() < 32 || clientNonce.size() > 128) {
    return Status::failure(StatusCode::invalid_argument,
                           "Pairing ID, ticket or client nonce is invalid.");
  }

  VerifiedPairingTicket claims;
  const auto consumptionStatus = ticketConsumer_->consume(
      PairingTicketConsumption{pairingId, opaqueTicket, clientNonce}, claims);
  if (!consumptionStatus.isOk()) {
    return consumptionStatus;
  }
  const auto now = std::chrono::system_clock::now();
  if (claims.pairingId != pairingId || claims.subjectUserId.empty() || claims.roomId.empty() ||
      (claims.roomRole != "host" && claims.roomRole != "guest") ||
      claims.clientNonce != clientNonce || claims.webOrigin != browserOrigin ||
      claims.expiresAt <= now) {
    return Status::failure(StatusCode::unauthorized,
                           "Consumed pairing-ticket claims are invalid or expired.");
  }

  std::scoped_lock lock(stateMutex_);
  removeExpiredStateLocked(now);
  if (pendingPairings_.size() >= kMaximumPendingPairings) {
    return Status::failure(StatusCode::timeout,
                           "Too many pending local pairing attempts.");
  }
  if (pendingPairings_.contains(pairingId) || hasActivePairingIdLocked(pairingId)) {
    return Status::failure(StatusCode::unauthorized,
                           "Pairing ID has already been consumed locally.");
  }
  pendingPairings_.emplace(pairingId,
                           PendingPairing{std::move(claims), clientNonce, browserOrigin,
                                          opaqueTicket});
  return Status::success();
}

Status SessionAuth::completePairing(const std::string& pairingId,
                                    const std::string& clientNonce,
                                    const std::string& browserOrigin,
                                    LocalSession& session) {
  session = {};
  if (!originPolicy_.allows(browserOrigin)) {
    return Status::failure(StatusCode::forbidden_origin, "Browser origin is not allowlisted.");
  }

  PendingPairing pending;
  {
    std::scoped_lock lock(stateMutex_);
    const auto now = std::chrono::system_clock::now();
    removeExpiredStateLocked(now);
    if (activeSessions_.size() >= kMaximumActiveSessions) {
      return Status::failure(StatusCode::timeout,
                             "Too many active local audio sessions.");
    }
    const auto iterator = pendingPairings_.find(pairingId);
    if (iterator == pendingPairings_.end() || iterator->second.clientNonce != clientNonce ||
        iterator->second.browserOrigin != browserOrigin) {
      return Status::failure(StatusCode::unauthorized,
                             "No matching consumed pairing ticket exists.");
    }
    pending = std::move(iterator->second);
    pendingPairings_.erase(iterator);
  }
  SensitiveStringGuard ticketGuard(pending.opaqueTicket);

  std::string sessionId;
  const auto sessionIdStatus = sessionIdGenerator_->generate(sessionId);
  if (!sessionIdStatus.isOk()) {
    return sessionIdStatus;
  }
  SensitiveStringGuard sessionIdGuard(sessionId);
  if (!isBase64UrlToken(sessionId, 22, 128) || sessionId == pairingId) {
    return Status::failure(StatusCode::internal_error,
                           "Generated local session ID is invalid or not independent.");
  }

  std::string secret;
  const auto secretStatus = secretGenerator_->generate(secret);
  if (!secretStatus.isOk()) {
    return secretStatus;
  }
  SensitiveStringGuard secretGuard(secret);
  if (!isBase64UrlToken(secret, 43, 512) || secret == sessionId || secret == pairingId) {
    return Status::failure(StatusCode::internal_error,
                            "Generated local session secret is invalid or not independent.");
  }

  std::string ticketProof;
  const auto proofStatus = ticketProofGenerator_->generate(
      pending.opaqueTicket,
      ticketProofMessage(pairingId, clientNonce, browserOrigin, sessionId, secret), ticketProof);
  if (!proofStatus.isOk()) {
    return proofStatus;
  }
  SensitiveStringGuard ticketProofGuard(ticketProof);
  if (!isBase64UrlToken(ticketProof, 43, 512)) {
    return Status::failure(StatusCode::internal_error,
                           "Generated pairing-ticket proof is invalid.");
  }

  const auto sessionExpiresAt = std::chrono::system_clock::now() + kLocalSessionTtl;
  if (pending.claims.expiresAt <= std::chrono::system_clock::now()) {
    return Status::failure(StatusCode::unauthorized,
                           "Pairing ticket expired while completing the local handshake.");
  }

  LocalSession completed{pairingId,
                         sessionId,
                         pending.claims.subjectUserId,
                         pending.claims.roomId,
                         pending.claims.roomRole,
                         browserOrigin,
                         secret,
                         std::move(ticketProof),
                         sessionExpiresAt};
  SensitiveStringGuard completedSecretGuard(completed.secret);

  {
    std::scoped_lock lock(stateMutex_);
    removeExpiredStateLocked(std::chrono::system_clock::now());
    if (activeSessions_.size() >= kMaximumActiveSessions ||
        activeSessions_.contains(completed.sessionId) ||
        hasActivePairingIdLocked(completed.pairingId)) {
      return Status::failure(StatusCode::unauthorized,
                             "Local session capacity or identifier collision detected.");
    }
    activeSessions_.emplace(completed.sessionId, completed);
  }
  session = std::move(completed);
  return Status::success();
}

Status SessionAuth::closeSession(const std::string& sessionId) {
  std::scoped_lock lock(stateMutex_);
  removeExpiredStateLocked(std::chrono::system_clock::now());
  const auto session = activeSessions_.find(sessionId);
  if (session != activeSessions_.end()) {
    eraseSensitiveString(session->second.secret);
    eraseSensitiveString(session->second.ticketProof);
    activeSessions_.erase(session);
  }
  return Status::success();
}

void SessionAuth::removeExpiredStateLocked(const std::chrono::system_clock::time_point now) {
  for (auto iterator = pendingPairings_.begin(); iterator != pendingPairings_.end();) {
    if (iterator->second.claims.expiresAt > now) {
      ++iterator;
      continue;
    }
    eraseSensitiveString(iterator->second.opaqueTicket);
    iterator = pendingPairings_.erase(iterator);
  }
  for (auto iterator = activeSessions_.begin(); iterator != activeSessions_.end();) {
    if (iterator->second.expiresAt > now) {
      ++iterator;
      continue;
    }
    eraseSensitiveString(iterator->second.secret);
    eraseSensitiveString(iterator->second.ticketProof);
    iterator = activeSessions_.erase(iterator);
  }
}

bool SessionAuth::hasActivePairingIdLocked(const std::string& pairingId) const {
  return std::ranges::any_of(activeSessions_, [&](const auto& item) {
    return item.second.pairingId == pairingId;
  });
}

}  // namespace meewav::audio
