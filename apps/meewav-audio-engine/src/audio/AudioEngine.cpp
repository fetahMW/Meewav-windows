#include "audio/AudioEngine.h"

#include <utility>

namespace meewav::audio {

AudioEngine::AudioEngine(std::unique_ptr<IAudioDeviceBackend> backend)
    : deviceManager_(std::move(backend)) {}

AudioEngine::~AudioEngine() { stop(); }

Status AudioEngine::configure(const AudioConfiguration& configuration) {
  if (running_.load(std::memory_order_acquire)) {
    return Status::failure(StatusCode::invalid_argument,
                           "Stop the engine before changing its audio configuration.");
  }

  const auto graphStatus = graph_.prepare(configuration.sampleRate, configuration.bufferFrames,
                                          configuration.inputChannels);
  if (!graphStatus.isOk()) {
    return graphStatus;
  }

  const auto deviceStatus = deviceManager_.open(
      configuration, [this](const AudioBlock block) noexcept { processDeviceBlock(block); });
  if (!deviceStatus.isOk()) {
    graph_.reset();
    return deviceStatus;
  }

  configuration_ = configuration;
  configured_.store(true, std::memory_order_release);
  return Status::success();
}

Status AudioEngine::start() {
  if (!configured_.load(std::memory_order_acquire)) {
    return Status::failure(StatusCode::invalid_argument, "Configure the engine before starting it.");
  }
  const auto status = deviceManager_.start();
  if (status.isOk()) {
    running_.store(true, std::memory_order_release);
  }
  return status;
}

void AudioEngine::stop() noexcept {
  running_.store(false, std::memory_order_release);
  deviceManager_.stop();
  graph_.reset();
  configured_.store(false, std::memory_order_release);
}

bool AudioEngine::isRunning() const noexcept {
  return running_.load(std::memory_order_acquire) && deviceManager_.isRunning();
}

EngineMeterSnapshot AudioEngine::meters() const noexcept {
  return EngineMeterSnapshot{inputMeter_.snapshot(), outputMeter_.snapshot()};
}

double AudioEngine::estimatedMonitoringLatencyMs() const noexcept {
  const double pluginLatency =
      (static_cast<double>(graph_.latencySamples()) / configuration_.sampleRate) * 1000.0;
  return deviceManager_.inputLatencyMs() + pluginLatency + deviceManager_.outputLatencyMs();
}

void AudioEngine::processExternalBlock(const AudioBlock block) noexcept {
  inputMeter_.consume(block);
  graph_.process(block);
  outputMeter_.setGainReductionDb(graph_.limiterReductionDb());
  outputMeter_.consume(block);
}

void AudioEngine::processDeviceBlock(const AudioBlock block) noexcept { processExternalBlock(block); }

}  // namespace meewav::audio
