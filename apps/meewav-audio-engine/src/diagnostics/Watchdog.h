#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <thread>

namespace meewav::audio {

class Watchdog final {
 public:
  using TimeoutHandler = std::function<void()>;

  Watchdog(std::chrono::milliseconds checkInterval, std::chrono::milliseconds timeout,
           TimeoutHandler onTimeout);
  ~Watchdog();

  Watchdog(const Watchdog&) = delete;
  Watchdog& operator=(const Watchdog&) = delete;

  void start();
  void stop() noexcept;
  void beat() noexcept;

 private:
  static std::int64_t nowTicks() noexcept;
  void run(std::stop_token stopToken);

  std::chrono::milliseconds checkInterval_;
  std::chrono::milliseconds timeout_;
  TimeoutHandler onTimeout_;
  std::atomic<std::int64_t> lastHeartbeatTicks_{0};
  std::atomic<bool> timedOut_{false};
  std::jthread thread_;
};

}  // namespace meewav::audio
