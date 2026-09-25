#pragma once

#include "core/Status.h"

#include <cstdint>
#include <string>

namespace meewav::audio {

enum class AudioBridgeHealth { disconnected, connecting, healthy, low_buffer, underrun, error };

struct AudioBridgeConfiguration final {
  double sampleRate{48'000.0};
  std::uint32_t channels{1};
  std::uint32_t framesPerPacket{480};
  std::string authenticatedSessionId;
};

struct AudioBridgeSnapshot final {
  AudioBridgeHealth health{AudioBridgeHealth::disconnected};
  std::uint64_t underrunCount{0};
  std::uint64_t overrunCount{0};
  double bridgeLatencyMs{0.0};
};

class IAudioBridge {
 public:
  virtual ~IAudioBridge() = default;
  virtual Status start(const AudioBridgeConfiguration& configuration) = 0;
  virtual void stop() noexcept = 0;
  [[nodiscard]] virtual AudioBridgeSnapshot snapshot() const noexcept = 0;
};

class UnavailableAudioBridge final : public IAudioBridge {
 public:
  Status start(const AudioBridgeConfiguration& configuration) override {
    return Status::failure(StatusCode::backend_unavailable,
                           "Native-to-Room audio plane has not been selected or implemented.");
  }
  void stop() noexcept override {}
  [[nodiscard]] AudioBridgeSnapshot snapshot() const noexcept override { return {}; }
};

}  // namespace meewav::audio
