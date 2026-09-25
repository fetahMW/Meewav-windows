#pragma once

#include "audio/AudioTypes.h"
#include "core/Status.h"

#include <functional>
#include <memory>
#include <vector>

namespace meewav::audio {

using AudioCallback = std::function<void(AudioBlock)>;

class IAudioDeviceBackend {
 public:
  virtual ~IAudioDeviceBackend() = default;
  [[nodiscard]] virtual std::vector<AudioDeviceDescriptor> inputDevices() const = 0;
  [[nodiscard]] virtual std::vector<AudioDeviceDescriptor> outputDevices() const = 0;
  virtual Status open(const AudioConfiguration& configuration, AudioCallback callback) = 0;
  virtual Status start() = 0;
  virtual void stop() noexcept = 0;
  [[nodiscard]] virtual bool isRunning() const noexcept = 0;
  [[nodiscard]] virtual double inputLatencyMs() const noexcept = 0;
  [[nodiscard]] virtual double outputLatencyMs() const noexcept = 0;
};

class UnavailableAudioDeviceBackend final : public IAudioDeviceBackend {
 public:
  [[nodiscard]] std::vector<AudioDeviceDescriptor> inputDevices() const override { return {}; }
  [[nodiscard]] std::vector<AudioDeviceDescriptor> outputDevices() const override { return {}; }
  Status open(const AudioConfiguration&, AudioCallback) override;
  Status start() override;
  void stop() noexcept override {}
  [[nodiscard]] bool isRunning() const noexcept override { return false; }
  [[nodiscard]] double inputLatencyMs() const noexcept override { return 0.0; }
  [[nodiscard]] double outputLatencyMs() const noexcept override { return 0.0; }
};

class AudioDeviceManager final {
 public:
  explicit AudioDeviceManager(std::unique_ptr<IAudioDeviceBackend> backend);

  [[nodiscard]] std::vector<AudioDeviceDescriptor> inputDevices() const;
  [[nodiscard]] std::vector<AudioDeviceDescriptor> outputDevices() const;
  Status open(const AudioConfiguration& configuration, AudioCallback callback);
  Status start();
  void stop() noexcept;
  [[nodiscard]] bool isRunning() const noexcept;
  [[nodiscard]] double inputLatencyMs() const noexcept;
  [[nodiscard]] double outputLatencyMs() const noexcept;

 private:
  std::unique_ptr<IAudioDeviceBackend> backend_;
};

}  // namespace meewav::audio
