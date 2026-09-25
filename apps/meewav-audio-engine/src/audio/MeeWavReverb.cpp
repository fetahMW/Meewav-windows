#include "audio/MeeWavReverb.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace meewav::audio {
namespace {

constexpr std::array<float, 6> kRoomCombMs{19.31F, 23.47F, 29.83F,
                                           31.71F, 37.11F, 41.03F};
constexpr std::array<float, 6> kPlateCombMs{23.83F, 29.41F, 31.13F,
                                            37.73F, 41.59F, 43.91F};
constexpr std::array<float, 6> kHallCombMs{31.71F, 37.11F, 41.03F,
                                           43.73F, 47.53F, 53.21F};
constexpr std::array<float, 3> kRoomAllpassMs{3.91F, 1.31F, 0.47F};
constexpr std::array<float, 3> kPlateAllpassMs{5.03F, 1.73F, 0.61F};
constexpr std::array<float, 3> kHallAllpassMs{7.13F, 2.37F, 0.83F};

const std::array<float, 6>& combTimes(const MeeWavReverbType type) noexcept {
  switch (type) {
    case MeeWavReverbType::room:
      return kRoomCombMs;
    case MeeWavReverbType::plate:
      return kPlateCombMs;
    case MeeWavReverbType::hall:
      return kHallCombMs;
  }
  return kRoomCombMs;
}

const std::array<float, 3>& allpassTimes(const MeeWavReverbType type) noexcept {
  switch (type) {
    case MeeWavReverbType::room:
      return kRoomAllpassMs;
    case MeeWavReverbType::plate:
      return kPlateAllpassMs;
    case MeeWavReverbType::hall:
      return kHallAllpassMs;
  }
  return kRoomAllpassMs;
}

float dampingFor(const MeeWavReverbType type) noexcept {
  switch (type) {
    case MeeWavReverbType::room:
      return 0.42F;
    case MeeWavReverbType::plate:
      return 0.24F;
    case MeeWavReverbType::hall:
      return 0.54F;
  }
  return 0.42F;
}

float diffusionFor(const MeeWavReverbType type) noexcept {
  switch (type) {
    case MeeWavReverbType::room:
      return 0.56F;
    case MeeWavReverbType::plate:
      return 0.68F;
    case MeeWavReverbType::hall:
      return 0.62F;
  }
  return 0.56F;
}

bool validType(const MeeWavReverbType type) noexcept {
  return type == MeeWavReverbType::room || type == MeeWavReverbType::plate ||
         type == MeeWavReverbType::hall;
}

float millisecondsToSamples(const float milliseconds, const double sampleRate) noexcept {
  return milliseconds * static_cast<float>(sampleRate) * 0.001F;
}

}  // namespace

void MeeWavReverb::DelayLine::prepare(const std::uint32_t capacity) {
  samples.assign(std::max(2U, capacity), 0.0F);
  writeIndex = 0;
  dampedState = 0.0F;
}

void MeeWavReverb::DelayLine::reset() noexcept {
  std::ranges::fill(samples, 0.0F);
  writeIndex = 0;
  dampedState = 0.0F;
}

float MeeWavReverb::DelayLine::read(const float delaySamples) const noexcept {
  const auto capacity = static_cast<std::uint32_t>(samples.size());
  if (capacity < 2U) {
    return 0.0F;
  }
  const auto clampedDelay = std::clamp(delaySamples, 1.0F, static_cast<float>(capacity - 1U));
  float readPosition = static_cast<float>(writeIndex) - clampedDelay;
  while (readPosition < 0.0F) {
    readPosition += static_cast<float>(capacity);
  }
  const auto first = static_cast<std::uint32_t>(readPosition) % capacity;
  const auto second = (first + 1U) % capacity;
  const auto fraction = readPosition - std::floor(readPosition);
  return samples[first] + ((samples[second] - samples[first]) * fraction);
}

void MeeWavReverb::DelayLine::write(const float value) noexcept {
  if (samples.empty()) {
    return;
  }
  samples[writeIndex] = value;
  writeIndex = (writeIndex + 1U) % static_cast<std::uint32_t>(samples.size());
}

void MeeWavReverb::ChannelNetwork::reset() noexcept {
  for (auto& comb : combs) {
    comb.reset();
  }
  for (auto& allpass : allpasses) {
    allpass.reset();
  }
}

void MeeWavReverb::prepare(const double sampleRate, const std::uint32_t maximumFrames) {
  sampleRate_ = sampleRate > 0.0 ? sampleRate : 0.0;
  maximumFrames_ = sampleRate_ > 0.0 ? maximumFrames : 0U;
  if (maximumFrames_ == 0U) {
    return;
  }

  const auto preDelayCapacity = static_cast<std::uint32_t>(
      std::ceil(millisecondsToSamples(kMaximumPreDelayMs, sampleRate_))) + 2U;
  // The longest Hall comb is 53.21 ms. Keep margin for stereo detuning and
  // future tuning without reallocating inside the audio callback.
  const auto combCapacity = static_cast<std::uint32_t>(
      std::ceil(millisecondsToSamples(64.0F, sampleRate_))) + 2U;
  const auto allpassCapacity = static_cast<std::uint32_t>(
      std::ceil(millisecondsToSamples(12.0F, sampleRate_))) + 2U;

  preDelayLeft_.prepare(preDelayCapacity);
  preDelayRight_.prepare(preDelayCapacity);
  for (auto* network : {&left_, &right_}) {
    for (auto& comb : network->combs) {
      comb.prepare(combCapacity);
    }
    for (auto& allpass : network->allpasses) {
      allpass.prepare(allpassCapacity);
    }
  }
  smoothedDryGain_ = 1.0F;
  smoothedWetGain_ = 0.0F;
  smoothedPreDelaySamples_ = 0.0F;
}

void MeeWavReverb::reset() noexcept {
  preDelayLeft_.reset();
  preDelayRight_.reset();
  left_.reset();
  right_.reset();
  smoothedDryGain_ = 1.0F;
  smoothedWetGain_ = 0.0F;
  smoothedPreDelaySamples_ = 0.0F;
}

float MeeWavReverb::processPreDelay(DelayLine& line, const float input,
                                    const float delaySamples) noexcept {
  if (delaySamples < 1.0F) {
    line.write(input);
    return input;
  }
  const auto output = line.read(delaySamples);
  line.write(input);
  return output;
}

MeeWavReverb::NetworkParameters MeeWavReverb::makeNetworkParameters(
    const MeeWavReverbType type, const float durationSeconds,
    const float stereoOffsetMs) const noexcept {
  NetworkParameters parameters;
  const auto& combDelays = combTimes(type);
  for (std::size_t index = 0; index < parameters.combDelaySamples.size(); ++index) {
    const auto delayMs = combDelays[index] + stereoOffsetMs;
    parameters.combDelaySamples[index] = millisecondsToSamples(delayMs, sampleRate_);
    const auto delaySeconds = delayMs * 0.001F;
    parameters.combFeedback[index] = std::clamp(
        std::pow(10.0F, (-3.0F * delaySeconds) / durationSeconds), 0.05F, 0.965F);
  }
  const auto& allpassDelays = allpassTimes(type);
  for (std::size_t index = 0; index < parameters.allpassDelaySamples.size(); ++index) {
    parameters.allpassDelaySamples[index] =
        millisecondsToSamples(allpassDelays[index] + (stereoOffsetMs * 0.37F), sampleRate_);
  }
  parameters.damping = dampingFor(type);
  parameters.diffusion = diffusionFor(type);
  return parameters;
}

float MeeWavReverb::processNetwork(ChannelNetwork& network, const float input,
                                   const NetworkParameters& parameters) noexcept {
  float sum = 0.0F;
  for (std::size_t index = 0; index < network.combs.size(); ++index) {
    auto& comb = network.combs[index];
    const auto delayed = comb.read(parameters.combDelaySamples[index]);
    comb.dampedState += (delayed - comb.dampedState) * (1.0F - parameters.damping);
    comb.write(input + (comb.dampedState * parameters.combFeedback[index]));
    sum += delayed;
  }

  float output = sum / static_cast<float>(network.combs.size());
  for (std::size_t index = 0; index < network.allpasses.size(); ++index) {
    auto& allpass = network.allpasses[index];
    const auto delayed = allpass.read(parameters.allpassDelaySamples[index]);
    const auto next = delayed - output;
    allpass.write(output + (delayed * parameters.diffusion));
    output = next;
  }
  return output;
}

void MeeWavReverb::processStereo(float* left, float* right, const std::uint32_t frameCount,
                                 const MeeWavReverbSettings& settings) noexcept {
  if (!isPrepared() || left == nullptr || right == nullptr || left == right || frameCount == 0U ||
      frameCount > maximumFrames_) {
    return;
  }

  const auto validSettings = validType(settings.type) && std::isfinite(settings.mix) &&
                             std::isfinite(settings.durationSeconds) &&
                             std::isfinite(settings.preDelayMs);
  const auto targetMix = settings.enabled && validSettings
                             ? std::clamp(settings.mix, 0.0F, 1.0F)
                             : 0.0F;
  const auto duration = validSettings
                            ? std::clamp(settings.durationSeconds, kMinimumDurationSeconds,
                                         kMaximumDurationSeconds)
                            : 1.2F;
  const auto targetPreDelaySamples =
      validSettings
          ? millisecondsToSamples(
                std::clamp(settings.preDelayMs, 0.0F, kMaximumPreDelayMs), sampleRate_)
          : 0.0F;
  const auto type = validSettings ? settings.type : MeeWavReverbType::room;
  const auto smoothing = 1.0F -
                         std::exp(-1.0F / (0.02F * static_cast<float>(sampleRate_)));
  const auto targetDryGain = std::cos(targetMix * std::numbers::pi_v<float> * 0.5F);
  const auto targetWetGain = std::sin(targetMix * std::numbers::pi_v<float> * 0.5F);
  // Feedback coefficients contain pow() and are intentionally calculated once
  // per block, never in the per-sample callback loop.
  const auto leftParameters = makeNetworkParameters(type, duration, 0.0F);
  const auto rightParameters = makeNetworkParameters(type, duration, 0.71F);

  for (std::uint32_t frame = 0; frame < frameCount; ++frame) {
    const auto dryLeft = std::isfinite(left[frame]) ? left[frame] : 0.0F;
    const auto dryRight = std::isfinite(right[frame]) ? right[frame] : 0.0F;
    smoothedDryGain_ += (targetDryGain - smoothedDryGain_) * smoothing;
    smoothedWetGain_ += (targetWetGain - smoothedWetGain_) * smoothing;
    smoothedPreDelaySamples_ +=
        (targetPreDelaySamples - smoothedPreDelaySamples_) * smoothing;

    const auto preLeft = processPreDelay(preDelayLeft_, dryLeft, smoothedPreDelaySamples_);
    const auto preRight = processPreDelay(preDelayRight_, dryRight, smoothedPreDelaySamples_);
    const auto monoExcitation = (preLeft + preRight) * 0.18F;
    const auto wetLeft =
        processNetwork(left_, monoExcitation + (preLeft * 0.08F), leftParameters);
    const auto wetRight =
        processNetwork(right_, monoExcitation + (preRight * 0.08F), rightParameters);
    const auto crossLeft = (wetLeft * 0.82F) + (wetRight * 0.18F);
    const auto crossRight = (wetRight * 0.82F) + (wetLeft * 0.18F);
    left[frame] = (dryLeft * smoothedDryGain_) + (crossLeft * smoothedWetGain_);
    right[frame] = (dryRight * smoothedDryGain_) + (crossRight * smoothedWetGain_);
  }
}

bool MeeWavReverb::isPrepared() const noexcept {
  return sampleRate_ > 0.0 && maximumFrames_ > 0U && !preDelayLeft_.samples.empty() &&
         !preDelayRight_.samples.empty();
}

}  // namespace meewav::audio
