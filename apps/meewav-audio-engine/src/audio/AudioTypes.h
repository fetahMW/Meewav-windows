#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace meewav::audio {

struct AudioBlock final {
  float* const* channels{nullptr};
  std::size_t channelCount{0};
  std::size_t frameCount{0};
  double sampleRate{48'000.0};
};

struct ConstAudioBlock final {
  const float* const* channels{nullptr};
  std::size_t channelCount{0};
  std::size_t frameCount{0};
  double sampleRate{48'000.0};
};

struct AudioDeviceDescriptor final {
  std::string id;
  std::string displayName;
  std::vector<double> supportedSampleRates;
  std::vector<std::uint32_t> supportedBufferSizes;
  std::uint32_t inputChannels{0};
  std::uint32_t outputChannels{0};
  bool isDefault{false};
  bool isBluetooth{false};
};

struct AudioConfiguration final {
  std::string inputDeviceId;
  std::string outputDeviceId;
  double sampleRate{48'000.0};
  std::uint32_t bufferFrames{128};
  std::uint32_t inputChannels{1};
  std::uint32_t outputChannels{2};
};

class IAudioProcessor {
 public:
  virtual ~IAudioProcessor() = default;
  virtual void prepare(double sampleRate, std::uint32_t maximumFrames,
                       std::uint32_t channels) = 0;
  virtual void process(AudioBlock block) noexcept = 0;
  virtual void reset() noexcept = 0;
  [[nodiscard]] virtual std::uint32_t latencySamples() const noexcept = 0;
};

}  // namespace meewav::audio
