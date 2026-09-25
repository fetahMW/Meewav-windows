#include "diagnostics/Diagnostics.h"

#include <algorithm>
#include <utility>

namespace meewav::audio {

Diagnostics::Diagnostics(std::string engineVersion) : engineVersion_(std::move(engineVersion)) {}

void Diagnostics::setHealth(const EngineHealth health) noexcept {
  health_.store(health, std::memory_order_release);
}

void Diagnostics::setDevices(std::string inputDevice, std::string outputDevice) {
  const std::lock_guard lock(deviceMutex_);
  inputDevice_ = std::move(inputDevice);
  outputDevice_ = std::move(outputDevice);
}

void Diagnostics::setAudioConfiguration(const double sampleRate,
                                        const std::uint32_t bufferFrames) noexcept {
  sampleRate_.store(sampleRate, std::memory_order_relaxed);
  bufferFrames_.store(bufferFrames, std::memory_order_relaxed);
}

void Diagnostics::setPluginLatencySamples(const std::uint32_t value) noexcept {
  pluginLatencySamples_.store(value, std::memory_order_relaxed);
}

void Diagnostics::setAudioCpuLoad(const double value) noexcept {
  audioCpuLoad_.store(std::clamp(value, 0.0, 1.0), std::memory_order_relaxed);
}

void Diagnostics::incrementDropout() noexcept {
  dropoutCount_.fetch_add(1, std::memory_order_relaxed);
}

void Diagnostics::markAudioCallback() noexcept {
  audioCallbackCount_.fetch_add(1, std::memory_order_relaxed);
}

void Diagnostics::setBridgeConnected(const bool connected) noexcept {
  bridgeConnected_.store(connected, std::memory_order_release);
}

DiagnosticsSnapshot Diagnostics::snapshot() const {
  DiagnosticsSnapshot value;
  value.health = health_.load(std::memory_order_acquire);
  value.engineVersion = engineVersion_;
  {
    const std::lock_guard lock(deviceMutex_);
    value.inputDevice = inputDevice_;
    value.outputDevice = outputDevice_;
  }
  value.sampleRate = sampleRate_.load(std::memory_order_relaxed);
  value.bufferFrames = bufferFrames_.load(std::memory_order_relaxed);
  value.pluginLatencySamples = pluginLatencySamples_.load(std::memory_order_relaxed);
  value.audioCpuLoad = audioCpuLoad_.load(std::memory_order_relaxed);
  value.dropoutCount = dropoutCount_.load(std::memory_order_relaxed);
  value.audioCallbackCount = audioCallbackCount_.load(std::memory_order_relaxed);
  value.bridgeConnected = bridgeConnected_.load(std::memory_order_acquire);
  return value;
}

}  // namespace meewav::audio
