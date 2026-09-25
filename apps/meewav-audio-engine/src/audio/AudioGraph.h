#pragma once

#include "audio/AudioTypes.h"
#include "audio/SafetyLimiter.h"
#include "core/Status.h"

#include <array>
#include <atomic>
#include <memory>

namespace meewav::audio {

enum class GraphSlot : std::size_t {
  vocalTuning = 0,
  compressor = 1,
  reverb = 2,
  count = 3,
};

class AudioGraph final {
 public:
  AudioGraph();

  Status setProcessor(GraphSlot slot, std::unique_ptr<IAudioProcessor> processor);
  Status clearProcessor(GraphSlot slot);
  Status prepare(double sampleRate, std::uint32_t maximumFrames, std::uint32_t channels);
  void process(AudioBlock block) noexcept;
  void reset() noexcept;

  void setInputGainDb(float value) noexcept;
  void setMasterGainDb(float value) noexcept;
  [[nodiscard]] std::uint32_t latencySamples() const noexcept;
  [[nodiscard]] float limiterReductionDb() const noexcept;

 private:
  static float dbToLinear(float value) noexcept;
  static void applyGain(AudioBlock block, float gain) noexcept;

  std::array<std::unique_ptr<IAudioProcessor>, static_cast<std::size_t>(GraphSlot::count)>
      processors_{};
  SafetyLimiter limiter_{};
  std::atomic<float> inputGainLinear_{1.0F};
  std::atomic<float> masterGainLinear_{1.0F};
  bool prepared_{false};
  double sampleRate_{48'000.0};
  std::uint32_t maximumFrames_{128};
  std::uint32_t channels_{1};
};

}  // namespace meewav::audio
