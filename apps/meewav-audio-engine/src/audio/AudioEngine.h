#pragma once

#include "audio/AudioDeviceManager.h"
#include "audio/AudioGraph.h"
#include "audio/AudioMeter.h"
#include "audio/AudioTypes.h"
#include "core/Status.h"

#include <atomic>
#include <memory>

namespace meewav::audio {

struct EngineMeterSnapshot final {
  MeterSnapshot input;
  MeterSnapshot output;
};

class AudioEngine final {
 public:
  explicit AudioEngine(std::unique_ptr<IAudioDeviceBackend> backend);
  ~AudioEngine();

  AudioEngine(const AudioEngine&) = delete;
  AudioEngine& operator=(const AudioEngine&) = delete;

  Status configure(const AudioConfiguration& configuration);
  Status start();
  void stop() noexcept;
  [[nodiscard]] bool isRunning() const noexcept;
  [[nodiscard]] EngineMeterSnapshot meters() const noexcept;
  [[nodiscard]] double estimatedMonitoringLatencyMs() const noexcept;

  AudioGraph& graph() noexcept { return graph_; }
  const AudioGraph& graph() const noexcept { return graph_; }

  // Used by a future native-to-browser bridge. The caller owns the buffer.
  void processExternalBlock(AudioBlock block) noexcept;

 private:
  void processDeviceBlock(AudioBlock block) noexcept;

  AudioDeviceManager deviceManager_;
  AudioConfiguration configuration_{};
  AudioGraph graph_{};
  AudioMeter inputMeter_{};
  AudioMeter outputMeter_{};
  std::atomic<bool> configured_{false};
  std::atomic<bool> running_{false};
};

}  // namespace meewav::audio
