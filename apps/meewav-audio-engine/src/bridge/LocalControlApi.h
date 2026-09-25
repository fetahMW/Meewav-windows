#pragma once

#include "bridge/ControlServer.h"
#include "core/Status.h"
#include "diagnostics/Diagnostics.h"
#include "security/OriginPolicy.h"

#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <string_view>

namespace meewav::audio {

enum class ControlWatchdogState { not_started, healthy, timed_out };
enum class SafeFallbackAction {
  keep_browser_microphone,
  stop_native_path_require_user_choice,
};

struct LocalControlRuntimeSnapshot final {
  bool chainBypassed{true};
  std::uint64_t chainRevision{1};
  bool processingBackendAvailable{false};
  ControlWatchdogState watchdog{ControlWatchdogState::not_started};
  std::uint64_t watchdogTimeoutCount{0};
  SafeFallbackAction fallback{SafeFallbackAction::keep_browser_microphone};
};

class LocalControlRuntimeState final {
 public:
  explicit LocalControlRuntimeState(bool processingBackendAvailable = false);

  Status setBypassed(bool bypassed);
  void markWatchdogHealthy() noexcept;
  void markWatchdogTimedOut() noexcept;
  [[nodiscard]] LocalControlRuntimeSnapshot snapshot() const noexcept;

 private:
  mutable std::mutex mutex_;
  LocalControlRuntimeSnapshot state_;
};

class LocalControlApi final {
 public:
  LocalControlApi(OriginPolicy originPolicy, std::string engineVersion,
                  std::string sessionId, Diagnostics& diagnostics,
                  LocalControlRuntimeState& runtimeState);

  ControlResponse handle(const ControlRequest& request);

 private:
  ControlResponse handleOptions(const ControlRequest& request) const;
  ControlResponse success(const ControlRequest& request, std::string dataJson) const;
  ControlResponse failure(const ControlRequest& request, int httpStatus,
                          std::string code, std::string message) const;
  [[nodiscard]] bool requestIdIsSafe(std::string_view requestId) const noexcept;

  OriginPolicy originPolicy_;
  std::string engineVersion_;
  std::string sessionId_;
  Diagnostics& diagnostics_;
  LocalControlRuntimeState& runtimeState_;
  std::chrono::steady_clock::time_point startedAt_;
};

}  // namespace meewav::audio
