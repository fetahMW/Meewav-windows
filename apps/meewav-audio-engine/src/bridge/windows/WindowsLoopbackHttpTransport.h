#pragma once

#include "bridge/ControlServer.h"

#include <cstdint>
#include <memory>

namespace meewav::audio {

// Bounded HTTP/1.1 transport for the internal Windows control POC. It binds only
// 127.0.0.1, accepts one request per connection and never upgrades to WebSocket.
class WindowsLoopbackHttpTransport final : public IControlTransport {
 public:
  WindowsLoopbackHttpTransport();
  ~WindowsLoopbackHttpTransport() override;

  WindowsLoopbackHttpTransport(const WindowsLoopbackHttpTransport&) = delete;
  WindowsLoopbackHttpTransport& operator=(const WindowsLoopbackHttpTransport&) = delete;

  Status listen(const std::string& bindAddress, std::uint16_t port,
                ControlHandler handler) override;
  void stop() noexcept override;
  [[nodiscard]] std::uint16_t boundPort() const noexcept;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace meewav::audio
