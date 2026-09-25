#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>

namespace meewav::audio {

enum class EngineHealth { stopped, starting, healthy, warning, error };

struct DiagnosticsSnapshot final {
  EngineHealth health{EngineHealth::stopped};
  std::string engineVersion;
  std::string inputDevice;
  std::string outputDevice;
  double sampleRate{0.0};
  std::uint32_t bufferFrames{0};
  std::uint32_t pluginLatencySamples{0};
  double audioCpuLoad{0.0};
  std::uint64_t dropoutCount{0};
  std::uint64_t audioCallbackCount{0};
  bool bridgeConnected{false};
};

class Diagnostics final {
 public:
  explicit Diagnostics(std::string engineVersion);

  void setHealth(EngineHealth health) noexcept;
  void setDevices(std::string inputDevice, std::string outputDevice);
  void setAudioConfiguration(double sampleRate, std::uint32_t bufferFrames) noexcept;
  void setPluginLatencySamples(std::uint32_t value) noexcept;
  void setAudioCpuLoad(double value) noexcept;
  void incrementDropout() noexcept;
  void markAudioCallback() noexcept;
  void setBridgeConnected(bool connected) noexcept;
  [[nodiscard]] DiagnosticsSnapshot snapshot() const;

 private:
  std::string engineVersion_;
  mutable std::mutex deviceMutex_;
  std::string inputDevice_;
  std::string outputDevice_;
  std::atomic<EngineHealth> health_{EngineHealth::stopped};
  std::atomic<double> sampleRate_{0.0};
  std::atomic<std::uint32_t> bufferFrames_{0};
  std::atomic<std::uint32_t> pluginLatencySamples_{0};
  std::atomic<double> audioCpuLoad_{0.0};
  std::atomic<std::uint64_t> dropoutCount_{0};
  std::atomic<std::uint64_t> audioCallbackCount_{0};
  std::atomic<bool> bridgeConnected_{false};
};

}  // namespace meewav::audio
