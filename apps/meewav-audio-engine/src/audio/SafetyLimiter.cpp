#include "audio/SafetyLimiter.h"

#include <algorithm>
#include <cmath>

namespace meewav::audio {

void SafetyLimiter::prepare(const double sampleRate, std::uint32_t, std::uint32_t) {
  // Instant attack prevents overs while a short release avoids the flat-topped
  // waveform produced by the previous per-sample hard clamp.
  constexpr double kReleaseSeconds = 0.050;
  releaseCoefficient_ = sampleRate > 0.0
                            ? static_cast<float>(std::exp(-1.0 / (sampleRate * kReleaseSeconds)))
                            : 0.0F;
  reset();
}

void SafetyLimiter::process(const AudioBlock block) noexcept {
  const float ceiling = ceilingLinear_.load(std::memory_order_relaxed);
  float minimumGain = 1.0F;

  for (std::size_t frame = 0; frame < block.frameCount; ++frame) {
    float linkedPeak = 0.0F;
    for (std::size_t channel = 0; channel < block.channelCount; ++channel) {
      auto* data = block.channels == nullptr ? nullptr : block.channels[channel];
      if (data == nullptr) {
        continue;
      }
      if (!std::isfinite(data[frame])) {
        data[frame] = 0.0F;
      }
      linkedPeak = std::max(linkedPeak, std::abs(data[frame]));
    }

    const float requiredGain = linkedPeak > ceiling && linkedPeak > 0.0F
                                   ? ceiling / linkedPeak
                                   : 1.0F;
    if (requiredGain < envelopeGain_) {
      envelopeGain_ = requiredGain;
    } else {
      envelopeGain_ = requiredGain +
                      (releaseCoefficient_ * (envelopeGain_ - requiredGain));
    }
    minimumGain = std::min(minimumGain, envelopeGain_);

    for (std::size_t channel = 0; channel < block.channelCount; ++channel) {
      auto* data = block.channels == nullptr ? nullptr : block.channels[channel];
      if (data != nullptr) {
        data[frame] *= envelopeGain_;
      }
    }
  }

  const float maximumReduction = minimumGain > 0.0F
                                     ? -20.0F * std::log10(minimumGain)
                                     : 120.0F;
  lastGainReductionDb_.store(maximumReduction, std::memory_order_relaxed);
}

void SafetyLimiter::reset() noexcept {
  envelopeGain_ = 1.0F;
  lastGainReductionDb_.store(0.0F, std::memory_order_relaxed);
}

void SafetyLimiter::setCeilingDb(const float value) noexcept {
  const float safeValue = std::clamp(value, -12.0F, -0.1F);
  ceilingLinear_.store(std::pow(10.0F, safeValue / 20.0F), std::memory_order_relaxed);
}

float SafetyLimiter::lastGainReductionDb() const noexcept {
  return lastGainReductionDb_.load(std::memory_order_relaxed);
}

}  // namespace meewav::audio
