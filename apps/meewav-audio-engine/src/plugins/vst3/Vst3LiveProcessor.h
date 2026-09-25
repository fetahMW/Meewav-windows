#pragma once

#include "audio/MeeWavReverb.h"
#include "core/Status.h"

#include <cstdint>
#include <memory>
#include <string>

namespace meewav::audio {

struct Vst3LiveConfiguration final {
  std::string canonicalPluginId;
  double sampleRate{48'000.0};
  std::uint32_t maximumFrames{1'024};
};

struct Vst3LiveDescriptor final {
  std::string canonicalPluginId;
  std::string vendor;
  std::string name;
  std::string version;
  std::string classId;
  std::uint32_t latencySamples{0};
  std::uint32_t inputChannels{0};
  std::uint32_t outputChannels{0};
};

// Canonical pitch controls are mapped only to parameters verified on the
// selected plug-in. Antares exposes Humanize directly; Spoton and Graillon do
// not, so their adapters deliberately leave that field unapplied. Reverb is a
// MeeWav post-effect and never depends on a vendor parameter mapping.
struct Vst3LiveControls final {
  bool bypassed{false};
  float inputGain{1.0F};
  std::uint32_t key{0};
  std::uint32_t scale{0};
  float amount{1.0F};
  float retune{0.5F};
  float humanize{0.0F};
  MeeWavReverbSettings reverb{};
};

// SDK-backed vocal processor used only by the isolated Windows live POC.
// It resolves a standard-location module from a canonical family ID and never accepts a path.
class Vst3LiveProcessor final {
 public:
  Vst3LiveProcessor();
  ~Vst3LiveProcessor();

  Vst3LiveProcessor(const Vst3LiveProcessor&) = delete;
  Vst3LiveProcessor& operator=(const Vst3LiveProcessor&) = delete;

  Status open(const Vst3LiveConfiguration& configuration);
  // Lock-free control handoff. The next audio block sends the verified native
  // parameter IDs through VST3 IParameterChanges.
  Status updateControls(const Vst3LiveControls& controls,
                        std::uint64_t* requestedRevision = nullptr) noexcept;
  // Published by the audio thread only after the parameter queues were
  // accepted by a successful VST3 process() call.
  [[nodiscard]] std::uint64_t appliedControlRevision() const noexcept;
  void close() noexcept;

  // Real-time safe on the MeeWav side after open(): no allocation, filesystem, logging or locks.
  // On failure, the caller must stop the session; raw microphone passthrough is not performed.
  [[nodiscard]] bool processMonoToStereo(const float* input, std::uint32_t frameCount,
                                         float* interleavedStereoOutput) noexcept;

  [[nodiscard]] bool isOpen() const noexcept;
  [[nodiscard]] const Vst3LiveDescriptor& descriptor() const noexcept;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace meewav::audio
