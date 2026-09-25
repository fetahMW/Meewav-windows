#pragma once

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>

namespace meewav::audio {

struct RealtimeLevelWindowSnapshot final {
  std::uint64_t sampleCount{0};
  double peakLinear{0.0};
  double rmsLinear{0.0};
};

// A deliberately small, allocation-free meter for the live WASAPI path.
// The realtime writer only performs local arithmetic plus three lock-free
// atomic updates per block. A diagnostics thread may consume the current
// window without touching the audio devices or plugin graph.
class RealtimeLevelWindow final {
 public:
  void add(const float* samples, const std::uint32_t sampleCount) noexcept {
    if (samples == nullptr || sampleCount == 0) {
      return;
    }

    std::uint64_t squaredSum = 0;
    std::uint32_t peak = 0;
    for (std::uint32_t index = 0; index < sampleCount; ++index) {
      const auto sample = std::isfinite(samples[index])
                              ? std::min(std::abs(samples[index]), 1.0F)
                              : 0.0F;
      const auto quantized =
          static_cast<std::uint32_t>(sample * static_cast<float>(kAmplitudeScale));
      peak = std::max(peak, quantized);
      squaredSum += static_cast<std::uint64_t>(quantized) * quantized;
    }

    sampleCount_.fetch_add(sampleCount, std::memory_order_relaxed);
    squaredSum_.fetch_add(squaredSum, std::memory_order_relaxed);
    auto observedPeak = peak_.load(std::memory_order_relaxed);
    while (observedPeak < peak &&
           !peak_.compare_exchange_weak(observedPeak, peak, std::memory_order_relaxed,
                                        std::memory_order_relaxed)) {
    }
  }

  [[nodiscard]] RealtimeLevelWindowSnapshot consume() noexcept {
    const auto sampleCount = sampleCount_.exchange(0, std::memory_order_acq_rel);
    const auto squaredSum = squaredSum_.exchange(0, std::memory_order_acq_rel);
    const auto peak = peak_.exchange(0, std::memory_order_acq_rel);
    if (sampleCount == 0) {
      return {};
    }

    const auto scale = static_cast<double>(kAmplitudeScale);
    return RealtimeLevelWindowSnapshot{
        sampleCount,
        static_cast<double>(peak) / scale,
        std::sqrt(static_cast<double>(squaredSum) / static_cast<double>(sampleCount)) / scale};
  }

  void reset() noexcept {
    sampleCount_.store(0, std::memory_order_relaxed);
    squaredSum_.store(0, std::memory_order_relaxed);
    peak_.store(0, std::memory_order_relaxed);
  }

 private:
  static constexpr std::uint32_t kAmplitudeScale = 32'767;

  std::atomic<std::uint64_t> sampleCount_{0};
  std::atomic<std::uint64_t> squaredSum_{0};
  std::atomic<std::uint32_t> peak_{0};
};

[[nodiscard]] inline double linearLevelToDbfs(const double linear) noexcept {
  constexpr double kMeterFloorDbfs = -120.0;
  if (!std::isfinite(linear) || linear <= 0.0) {
    return kMeterFloorDbfs;
  }
  return std::max(kMeterFloorDbfs, 20.0 * std::log10(std::min(linear, 1.0)));
}

}  // namespace meewav::audio
