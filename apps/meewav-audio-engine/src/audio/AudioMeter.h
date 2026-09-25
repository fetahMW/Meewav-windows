#pragma once

#include "audio/AudioTypes.h"

#include <atomic>

namespace meewav::audio {

struct MeterSnapshot final {
  float peak{0.0F};
  float rms{0.0F};
  float gainReductionDb{0.0F};
};

class AudioMeter final {
 public:
  void consume(AudioBlock block) noexcept;
  void setGainReductionDb(float value) noexcept;
  [[nodiscard]] MeterSnapshot snapshot() const noexcept;
  void reset() noexcept;

 private:
  std::atomic<float> peak_{0.0F};
  std::atomic<float> rms_{0.0F};
  std::atomic<float> gainReductionDb_{0.0F};
};

}  // namespace meewav::audio
