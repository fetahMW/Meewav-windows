#include "diagnostics/Watchdog.h"

#include <utility>

namespace meewav::audio {

Watchdog::Watchdog(const std::chrono::milliseconds checkInterval,
                   const std::chrono::milliseconds timeout, TimeoutHandler onTimeout)
    : checkInterval_(checkInterval), timeout_(timeout), onTimeout_(std::move(onTimeout)) {}

Watchdog::~Watchdog() { stop(); }

void Watchdog::start() {
  stop();
  beat();
  timedOut_.store(false, std::memory_order_release);
  thread_ = std::jthread([this](const std::stop_token token) { run(token); });
}

void Watchdog::stop() noexcept {
  if (thread_.joinable()) {
    thread_.request_stop();
    thread_.join();
  }
}

void Watchdog::beat() noexcept {
  lastHeartbeatTicks_.store(nowTicks(), std::memory_order_relaxed);
  timedOut_.store(false, std::memory_order_release);
}

std::int64_t Watchdog::nowTicks() noexcept {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

void Watchdog::run(const std::stop_token stopToken) {
  while (!stopToken.stop_requested()) {
    std::this_thread::sleep_for(checkInterval_);
    const auto elapsed = nowTicks() - lastHeartbeatTicks_.load(std::memory_order_relaxed);
    if (elapsed > timeout_.count() && !timedOut_.exchange(true, std::memory_order_acq_rel) &&
        onTimeout_) {
      onTimeout_();
    }
  }
}

}  // namespace meewav::audio
