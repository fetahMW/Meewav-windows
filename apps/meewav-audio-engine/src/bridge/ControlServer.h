#pragma once

#include "bridge/SessionAuth.h"
#include "core/Status.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace meewav::audio {

struct ControlRequest final {
  std::string method;
  std::string route;
  std::string origin;
  std::string requestId;
  std::string sessionId;
  std::string timestampMilliseconds;
  std::string nonce;
  std::string signature;
  std::string body;
};

struct ControlResponse final {
  int httpStatus{503};
  std::string body;
  std::vector<std::pair<std::string, std::string>> headers;
};

using ControlHandler = std::function<ControlResponse(const ControlRequest&)>;

class ICommandAuthenticator {
 public:
  virtual ~ICommandAuthenticator() = default;
  virtual Status authorize(const ControlRequest& request) = 0;
};

class RejectAllCommandAuthenticator final : public ICommandAuthenticator {
 public:
  Status authorize(const ControlRequest& request) override;
};

class IControlTransport {
 public:
  virtual ~IControlTransport() = default;
  virtual Status listen(const std::string& bindAddress, std::uint16_t port,
                        ControlHandler handler) = 0;
  virtual void stop() noexcept = 0;
};

class UnavailableControlTransport final : public IControlTransport {
 public:
  Status listen(const std::string& bindAddress, std::uint16_t port,
                ControlHandler handler) override;
  void stop() noexcept override {}
};

class ControlServer final {
 public:
  explicit ControlServer(std::unique_ptr<IControlTransport> transport,
                         std::unique_ptr<ICommandAuthenticator> authenticator = nullptr);
  ~ControlServer();

  Status start(const std::string& bindAddress, std::uint16_t port, ControlHandler handler);
  void stop() noexcept;

  static bool isExplicitLoopbackAddress(const std::string& address) noexcept;
  static bool isHandshakeRequest(const ControlRequest& request) noexcept;

 private:
  std::unique_ptr<IControlTransport> transport_;
  std::unique_ptr<ICommandAuthenticator> authenticator_;
};

}  // namespace meewav::audio
