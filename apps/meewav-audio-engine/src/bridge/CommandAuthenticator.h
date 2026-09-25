#pragma once

#include "bridge/ControlServer.h"
#include "core/Status.h"
#include "security/OriginPolicy.h"

#include <chrono>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <unordered_map>

namespace meewav::audio {

class ICommandCrypto {
 public:
  virtual ~ICommandCrypto() = default;
  virtual Status sha256Hex(std::string_view input, std::string& digestHex) = 0;
  virtual Status verifyHmacSha256Base64Url(std::string_view encodedSecret,
                                           std::string_view canonicalMessage,
                                           std::string_view encodedSignature) = 0;
};

class UnavailableCommandCrypto final : public ICommandCrypto {
 public:
  Status sha256Hex(std::string_view input, std::string& digestHex) override;
  Status verifyHmacSha256Base64Url(std::string_view encodedSecret,
                                   std::string_view canonicalMessage,
                                   std::string_view encodedSignature) override;
};

using CommandAuthClock =
    std::function<std::chrono::system_clock::time_point()>;

struct CommandSessionConfiguration final {
  std::string sessionId;
  // Unpadded base64url bytes, identical to the secret imported by the Web client.
  std::string encodedSessionSecret;
  std::string exactOrigin;
  std::chrono::system_clock::time_point expiresAt;
  std::chrono::milliseconds maximumClockSkew{30'000};
  std::size_t maximumTrackedNonces{4'096};
};

class SessionCommandAuthenticator final : public ICommandAuthenticator {
 public:
  SessionCommandAuthenticator(OriginPolicy originPolicy,
                              CommandSessionConfiguration configuration,
                              std::unique_ptr<ICommandCrypto> crypto,
                              CommandAuthClock clock = {});
  ~SessionCommandAuthenticator() override;

  SessionCommandAuthenticator(const SessionCommandAuthenticator&) = delete;
  SessionCommandAuthenticator& operator=(const SessionCommandAuthenticator&) = delete;

  Status authorize(const ControlRequest& request) override;

 private:
  [[nodiscard]] bool configurationIsValid() const noexcept;
  void removeExpiredNoncesLocked(std::chrono::system_clock::time_point now);

  OriginPolicy originPolicy_;
  CommandSessionConfiguration configuration_;
  std::unique_ptr<ICommandCrypto> crypto_;
  CommandAuthClock clock_;
  std::mutex nonceMutex_;
  std::unordered_map<std::string, std::chrono::system_clock::time_point> usedNonces_;
};

}  // namespace meewav::audio
