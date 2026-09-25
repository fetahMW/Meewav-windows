#pragma once

#include <cstdint>
#include <string_view>

namespace meewav::audio {

// Values reported by IAudioClient3::GetSharedModeEnginePeriod. Kept free of
// Windows types so the selection contract can be tested on every build host.
struct WasapiSharedPeriodRange final {
  std::uint32_t defaultFrames{0};
  std::uint32_t fundamentalFrames{0};
  std::uint32_t minimumFrames{0};
  std::uint32_t maximumFrames{0};
};

// Returns the smallest period that Windows says this endpoint supports. A
// malformed range is rejected so callers can safely fall back to ordinary
// shared-mode initialization instead of passing an invalid period to WASAPI.
[[nodiscard]] constexpr std::uint32_t chooseMinimumSharedPeriodFrames(
    const WasapiSharedPeriodRange& range) noexcept {
  if (range.defaultFrames == 0 || range.fundamentalFrames == 0 ||
      range.minimumFrames == 0 || range.maximumFrames == 0 ||
      range.minimumFrames > range.maximumFrames ||
      range.defaultFrames < range.minimumFrames ||
      range.defaultFrames > range.maximumFrames ||
      (range.minimumFrames % range.fundamentalFrames) != 0 ||
      (range.maximumFrames % range.fundamentalFrames) != 0 ||
      (range.defaultFrames % range.fundamentalFrames) != 0) {
    return 0;
  }
  return range.minimumFrames;
}

// Stable, machine-readable tokens used by the live POC diagnostics. Keeping
// this mapping platform-free makes it possible to assert that a legacy shared
// fallback can never be mistaken for the IAudioClient3 low-latency path.
[[nodiscard]] constexpr std::string_view wasapiSharedModeDiagnosticToken(
    const bool lowLatencySharedMode) noexcept {
  return lowLatencySharedMode ? "low-latency-shared" : "legacy-shared";
}

}  // namespace meewav::audio
