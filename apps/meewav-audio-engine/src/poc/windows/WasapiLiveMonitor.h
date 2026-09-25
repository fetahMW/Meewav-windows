#pragma once

#include "core/Status.h"
#include "plugins/vst3/Vst3LiveProcessor.h"

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>

namespace meewav::audio {

struct WasapiLiveConfiguration final {
  double sampleRate{48'000.0};
  std::uint32_t maximumPluginFrames{1'024};
  std::uint32_t ringBufferFrames{4'096};
  bool headphonesExplicitlyConfirmed{false};
};

struct WasapiLiveSnapshot final {
  std::string captureDeviceName;
  std::string renderDeviceName;
  std::uint32_t captureBufferFrames{0};
  std::uint32_t renderBufferFrames{0};
  std::uint32_t capturePeriodFrames{0};
  std::uint32_t renderPeriodFrames{0};
  bool captureLowLatencySharedMode{false};
  bool renderLowLatencySharedMode{false};
  std::string captureInitializationDetail;
  std::string renderInitializationDetail;
  double captureLatencyMs{0.0};
  double renderLatencyMs{0.0};
  double pluginLatencyMs{0.0};
  std::uint64_t captureDiscontinuities{0};
  std::uint64_t renderUnderruns{0};
  std::uint64_t ringOverruns{0};
};

// One consumed diagnostics window. Frame counters and levels are updated by
// the audio thread through lock-free atomics and may safely be read by a
// separate stdout/diagnostics thread.
struct WasapiLiveTelemetry final {
  std::uint64_t capturedFrames{0};
  std::uint64_t processedFrames{0};
  std::uint64_t renderRequestedFrames{0};
  std::uint64_t renderSuppliedFrames{0};
  double inputPeakDbfs{-120.0};
  double inputRmsDbfs{-120.0};
  double outputPeakDbfs{-120.0};
  double outputRmsDbfs{-120.0};
};

// Event-driven shared-mode WASAPI monitoring POC. It has one route only:
// capture -> VST3 -> limiter -> render. A processing error produces silence and terminates;
// the raw microphone is never copied to the render endpoint.
class WasapiLiveMonitor final {
 public:
  WasapiLiveMonitor();
  ~WasapiLiveMonitor();

  WasapiLiveMonitor(const WasapiLiveMonitor&) = delete;
  WasapiLiveMonitor& operator=(const WasapiLiveMonitor&) = delete;

  Status open(Vst3LiveProcessor& processor, const WasapiLiveConfiguration& configuration);
  // Starts both WASAPI streams. A successful return is the earliest point at
  // which a controller may truthfully advertise an audio-ready session.
  Status start();
  Status run(const std::atomic_bool& stopRequested);
  void close() noexcept;

  [[nodiscard]] const WasapiLiveSnapshot& snapshot() const noexcept;
  [[nodiscard]] WasapiLiveTelemetry consumeTelemetry() noexcept;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace meewav::audio
