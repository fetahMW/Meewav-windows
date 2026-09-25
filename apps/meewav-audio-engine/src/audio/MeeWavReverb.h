#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace meewav::audio {

enum class MeeWavReverbType : std::uint32_t {
  room = 0,
  plate = 1,
  hall = 2,
};

struct MeeWavReverbSettings final {
  bool enabled{false};
  float mix{0.0F};
  MeeWavReverbType type{MeeWavReverbType::room};
  float durationSeconds{1.2F};
  float preDelayMs{0.0F};
};

// A compact Schroeder/Moorer-style stereo reverb for the native live path.
// All delay storage is allocated by prepare(). processStereo() performs no
// allocation, locking, filesystem access or logging and is safe for the
// MeeWav audio callback.
class MeeWavReverb final {
 public:
  static constexpr float kMinimumDurationSeconds = 0.2F;
  static constexpr float kMaximumDurationSeconds = 5.0F;
  static constexpr float kMaximumPreDelayMs = 180.0F;

  void prepare(double sampleRate, std::uint32_t maximumFrames);
  void reset() noexcept;

  // The channel buffers must be distinct, writable and contain frameCount
  // samples. Invalid/non-finite settings fail closed to a dry signal.
  void processStereo(float* left, float* right, std::uint32_t frameCount,
                     const MeeWavReverbSettings& settings) noexcept;

  [[nodiscard]] bool isPrepared() const noexcept;

 private:
  struct DelayLine final {
    std::vector<float> samples;
    std::uint32_t writeIndex{0};
    float dampedState{0.0F};

    void prepare(std::uint32_t capacity);
    void reset() noexcept;
    [[nodiscard]] float read(float delaySamples) const noexcept;
    void write(float value) noexcept;
  };

  struct ChannelNetwork final {
    std::array<DelayLine, 6> combs;
    std::array<DelayLine, 3> allpasses;

    void reset() noexcept;
  };

  struct NetworkParameters final {
    std::array<float, 6> combDelaySamples{};
    std::array<float, 6> combFeedback{};
    std::array<float, 3> allpassDelaySamples{};
    float damping{0.42F};
    float diffusion{0.56F};
  };

  [[nodiscard]] NetworkParameters makeNetworkParameters(
      MeeWavReverbType type, float durationSeconds, float stereoOffsetMs) const noexcept;
  [[nodiscard]] float processNetwork(ChannelNetwork& network, float input,
                                     const NetworkParameters& parameters) noexcept;
  [[nodiscard]] float processPreDelay(DelayLine& line, float input,
                                      float delaySamples) noexcept;

  double sampleRate_{0.0};
  std::uint32_t maximumFrames_{0};
  DelayLine preDelayLeft_;
  DelayLine preDelayRight_;
  ChannelNetwork left_;
  ChannelNetwork right_;
  float smoothedDryGain_{1.0F};
  float smoothedWetGain_{0.0F};
  float smoothedPreDelaySamples_{0.0F};
};

}  // namespace meewav::audio
