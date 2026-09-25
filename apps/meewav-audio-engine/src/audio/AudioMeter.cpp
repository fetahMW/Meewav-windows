#include "audio/AudioMeter.h"

#include <algorithm>
#include <cmath>

namespace meewav::audio {

void AudioMeter::consume(const AudioBlock block) noexcept {
  if (block.channels == nullptr || block.channelCount == 0 || block.frameCount == 0) {
    return;
  }

  float peak = 0.0F;
  double sumSquares = 0.0;
  std::size_t samples = 0;

  for (std::size_t channel = 0; channel < block.channelCount; ++channel) {
    const auto* data = block.channels[channel];
    if (data == nullptr) {
      continue;
    }
    for (std::size_t frame = 0; frame < block.frameCount; ++frame) {
      const float magnitude = std::abs(data[frame]);
      peak = std::max(peak, magnitude);
      sumSquares += static_cast<double>(data[frame]) * static_cast<double>(data[frame]);
      ++samples;
    }
  }

  if (samples == 0) {
    return;
  }

  peak_.store(peak, std::memory_order_relaxed);
  rms_.store(static_cast<float>(std::sqrt(sumSquares / static_cast<double>(samples))),
             std::memory_order_relaxed);
}

void AudioMeter::setGainReductionDb(const float value) noexcept {
  gainReductionDb_.store(value, std::memory_order_relaxed);
}

MeterSnapshot AudioMeter::snapshot() const noexcept {
  return MeterSnapshot{
      peak_.load(std::memory_order_relaxed),
      rms_.load(std::memory_order_relaxed),
      gainReductionDb_.load(std::memory_order_relaxed),
  };
}

void AudioMeter::reset() noexcept {
  peak_.store(0.0F, std::memory_order_relaxed);
  rms_.store(0.0F, std::memory_order_relaxed);
  gainReductionDb_.store(0.0F, std::memory_order_relaxed);
}

}  // namespace meewav::audio
