#pragma once

#include "audio/AudioTypes.h"

#include <atomic>

namespace meewav::audio {

class SafetyLimiter final : public IAudioProcessor {
 public:
  void prepare(double sampleRate, std::uint32_t maximumFrames,
               std::uint32_t channels) override;
  void process(AudioBlock block) noexcept override;
  void reset() noexcept override;
  [[nodiscard]] std::uint32_t latencySamples() const noexcept override { return 0; }

  void setCeilingDb(float value) noexcept;
  [[nodiscard]] float lastGainReductionDb() const noexcept;

 private:
  std::atomic<float> ceilingLinear_{0.8912509F};  // -1 dBFS
  std::atomic<float> lastGainReductionDb_{0.0F};
  float envelopeGain_{1.0F};
  float releaseCoefficient_{0.0F};
};

}  // namespace meewav::audio
