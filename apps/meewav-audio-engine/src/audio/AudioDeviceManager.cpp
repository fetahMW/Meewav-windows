#include "audio/AudioDeviceManager.h"

#include <utility>

namespace meewav::audio {

Status UnavailableAudioDeviceBackend::open(const AudioConfiguration&, AudioCallback) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No CoreAudio/WASAPI backend is compiled into this scaffold.");
}

Status UnavailableAudioDeviceBackend::start() {
  return Status::failure(StatusCode::backend_unavailable,
                         "No CoreAudio/WASAPI backend is compiled into this scaffold.");
}

AudioDeviceManager::AudioDeviceManager(std::unique_ptr<IAudioDeviceBackend> backend)
    : backend_(backend ? std::move(backend) : std::make_unique<UnavailableAudioDeviceBackend>()) {}

std::vector<AudioDeviceDescriptor> AudioDeviceManager::inputDevices() const {
  return backend_->inputDevices();
}

std::vector<AudioDeviceDescriptor> AudioDeviceManager::outputDevices() const {
  return backend_->outputDevices();
}

Status AudioDeviceManager::open(const AudioConfiguration& configuration, AudioCallback callback) {
  return backend_->open(configuration, std::move(callback));
}

Status AudioDeviceManager::start() { return backend_->start(); }

void AudioDeviceManager::stop() noexcept { backend_->stop(); }

bool AudioDeviceManager::isRunning() const noexcept { return backend_->isRunning(); }

double AudioDeviceManager::inputLatencyMs() const noexcept { return backend_->inputLatencyMs(); }

double AudioDeviceManager::outputLatencyMs() const noexcept { return backend_->outputLatencyMs(); }

}  // namespace meewav::audio
