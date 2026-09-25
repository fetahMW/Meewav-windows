#include "audio/AudioGraph.h"

#include <algorithm>
#include <cmath>

namespace meewav::audio {

AudioGraph::AudioGraph() { limiter_.setCeilingDb(-1.0F); }

Status AudioGraph::setProcessor(const GraphSlot slot,
                                std::unique_ptr<IAudioProcessor> processor) {
  if (prepared_) {
    return Status::failure(StatusCode::invalid_argument,
                           "Stop the audio graph before changing its processors.");
  }
  if (!processor) {
    return Status::failure(StatusCode::invalid_argument, "Processor cannot be null.");
  }
  processors_[static_cast<std::size_t>(slot)] = std::move(processor);
  return Status::success();
}

Status AudioGraph::clearProcessor(const GraphSlot slot) {
  if (prepared_) {
    return Status::failure(StatusCode::invalid_argument,
                           "Stop the audio graph before changing its processors.");
  }
  processors_[static_cast<std::size_t>(slot)].reset();
  return Status::success();
}

Status AudioGraph::prepare(const double sampleRate, const std::uint32_t maximumFrames,
                           const std::uint32_t channels) {
  if (sampleRate <= 0.0 || maximumFrames == 0 || channels == 0) {
    return Status::failure(StatusCode::invalid_argument, "Invalid audio graph configuration.");
  }

  sampleRate_ = sampleRate;
  maximumFrames_ = maximumFrames;
  channels_ = channels;
  for (auto& processor : processors_) {
    if (processor) {
      processor->prepare(sampleRate_, maximumFrames_, channels_);
    }
  }
  limiter_.prepare(sampleRate_, maximumFrames_, channels_);
  prepared_ = true;
  return Status::success();
}

void AudioGraph::process(const AudioBlock block) noexcept {
  applyGain(block, inputGainLinear_.load(std::memory_order_relaxed));
  for (auto& processor : processors_) {
    if (processor) {
      processor->process(block);
    }
  }
  applyGain(block, masterGainLinear_.load(std::memory_order_relaxed));
  limiter_.process(block);
}

void AudioGraph::reset() noexcept {
  for (auto& processor : processors_) {
    if (processor) {
      processor->reset();
    }
  }
  limiter_.reset();
  prepared_ = false;
}

void AudioGraph::setInputGainDb(const float value) noexcept {
  inputGainLinear_.store(dbToLinear(std::clamp(value, -60.0F, 18.0F)),
                         std::memory_order_relaxed);
}

void AudioGraph::setMasterGainDb(const float value) noexcept {
  masterGainLinear_.store(dbToLinear(std::clamp(value, -60.0F, 12.0F)),
                          std::memory_order_relaxed);
}

std::uint32_t AudioGraph::latencySamples() const noexcept {
  std::uint32_t total = 0;
  for (const auto& processor : processors_) {
    if (processor) {
      total += processor->latencySamples();
    }
  }
  return total + limiter_.latencySamples();
}

float AudioGraph::limiterReductionDb() const noexcept { return limiter_.lastGainReductionDb(); }

float AudioGraph::dbToLinear(const float value) noexcept {
  return value <= -60.0F ? 0.0F : std::pow(10.0F, value / 20.0F);
}

void AudioGraph::applyGain(const AudioBlock block, const float gain) noexcept {
  for (std::size_t channel = 0; channel < block.channelCount; ++channel) {
    auto* data = block.channels == nullptr ? nullptr : block.channels[channel];
    if (data == nullptr) {
      continue;
    }
    for (std::size_t frame = 0; frame < block.frameCount; ++frame) {
      data[frame] *= gain;
    }
  }
}

}  // namespace meewav::audio
