#include "plugins/vst3/Vst3LiveProcessor.h"

#include "audio/AudioTypes.h"
#include "audio/MeeWavReverb.h"
#include "audio/SafetyLimiter.h"

#include "public.sdk/source/vst/hosting/eventlist.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"
#include "public.sdk/source/vst/hosting/plugprovider.h"
#include "public.sdk/source/vst/hosting/processdata.h"
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <cmath>
#include <cstddef>
#include <limits>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace meewav::audio {
namespace {

using VST3::Hosting::ClassInfo;
using VST3::Hosting::Module;
using VST3::Hosting::PluginFactory;

enum class VocalPluginFamily { antares, voloco, spoton, graillon3 };

using Steinberg::Vst::ParamID;

static_assert(std::atomic<bool>::is_always_lock_free);
static_assert(std::atomic<std::uint32_t>::is_always_lock_free);
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
static_assert(std::atomic<float>::is_always_lock_free);

constexpr ParamID kSpotonBypassAll = 745180057U;
constexpr ParamID kSpotonAmount = 733630552U;
constexpr ParamID kSpotonSpeed = 109641799U;
constexpr std::array<ParamID, 12> kSpotonNotes{
    67U, 1998000487U, 68U, 2026629638U, 69U, 70U,
    2083887940U, 71U, 2112517091U, 65U, 1940742185U, 66U};

constexpr ParamID kGraillonBypass = 998U;
constexpr ParamID kGraillonAmount = 17U;
constexpr ParamID kGraillonSmooth = 18U;
constexpr ParamID kGraillonCorrectionEnabled = 62U;
constexpr std::array<ParamID, 12> kGraillonNotes{
    22U, 23U, 24U, 25U, 26U, 27U, 28U, 29U, 30U, 31U, 32U, 33U};

// Auto-Tune Pro 11.0.0, verified against class
// 565354415438314175746F2D54756E65 through its VST3 controller metadata.
constexpr ParamID kAntaresScale = 1U;
constexpr ParamID kAntaresKey = 2U;
constexpr ParamID kAntaresRetuneSpeed = 4U;
constexpr ParamID kAntaresHumanize = 61U;
constexpr ParamID kAntaresMasterBypass = 89U;
constexpr ParamID kAntaresWetDryMix = 92U;
constexpr std::string_view kAntaresClassId = "565354415438314175746F2D54756E65";

// Antares offers 29 scale steps. MeeWav's eight public scales intentionally
// collapse to the closest verified Antares family instead of guessing hidden
// vendor modes: Chromatic=2, Major=0, Minor=1.
constexpr std::array<std::uint32_t, 8> kAntaresScaleSteps{
    2U, 0U, 1U, 0U, 1U, 1U, 1U, 0U};

// Root-relative pitch-class masks in the same order as the Web laboratory:
// chromatic, major, natural minor, major/minor pentatonic, blues, dorian and
// mixolydian. Native plug-ins receive their twelve real note-toggle IDs.
constexpr std::array<std::uint16_t, 8> kScaleMasks{
    0x0FFFU,
    0x0AB5U,  // 0, 2, 4, 5, 7, 9, 11
    0x05ADU,  // 0, 2, 3, 5, 7, 8, 10
    0x0295U,  // 0, 2, 4, 7, 9
    0x04A9U,  // 0, 3, 5, 7, 10
    0x04E9U,  // 0, 3, 5, 6, 7, 10
    0x06ADU,  // 0, 2, 3, 5, 7, 9, 10
    0x06B5U   // 0, 2, 4, 5, 7, 9, 10
};

bool noteIsEnabled(const std::uint32_t key, const std::uint32_t scale,
                   const std::uint32_t pitchClass) noexcept {
  const auto relativePitchClass = (pitchClass + 12U - key) % 12U;
  return (kScaleMasks[scale] & (1U << relativePitchClass)) != 0;
}

std::string lowercase(std::string value) {
  std::ranges::transform(value, value.begin(), [](const unsigned char character) {
    return static_cast<char>(std::tolower(character));
  });
  return value;
}

std::string moduleFilename(std::string path) {
  while (!path.empty() && (path.back() == '/' || path.back() == '\\')) {
    path.pop_back();
  }
  const auto separator = path.find_last_of("/\\");
  return lowercase(separator == std::string::npos ? std::move(path)
                                                   : path.substr(separator + 1));
}

bool vendorMatchesExactly(const VST3::Hosting::FactoryInfo& factoryInfo,
                          const ClassInfo& classInfo, const std::string_view expectedVendor) {
  const auto factoryVendor = lowercase(factoryInfo.vendor());
  const auto classVendor = lowercase(classInfo.vendor());
  const auto expected = lowercase(std::string(expectedVendor));
  if (factoryVendor.empty() && classVendor.empty()) {
    return false;
  }
  return (factoryVendor.empty() || factoryVendor == expected) &&
         (classVendor.empty() || classVendor == expected);
}

bool classIdMatchesExactly(const ClassInfo& classInfo, const std::string_view expectedClassId) {
  return lowercase(classInfo.ID().toString()) == lowercase(std::string(expectedClassId));
}

std::string_view familyDisplayName(const VocalPluginFamily family) {
  switch (family) {
    case VocalPluginFamily::antares:
      return "Antares Auto-Tune";
    case VocalPluginFamily::voloco:
      return "Voloco Producer";
    case VocalPluginFamily::spoton:
      return "Spoton by Sixth Sample";
    case VocalPluginFamily::graillon3:
      return "Graillon 3 by Auburn Sounds";
  }
  return "requested vocal plugin";
}

Status resolveFamily(const std::string& canonicalPluginId, VocalPluginFamily& family) {
  if (canonicalPluginId == "antares.autotune") {
    family = VocalPluginFamily::antares;
    return Status::success();
  }
  if (canonicalPluginId == "resonantcavity.voloco-producer") {
    family = VocalPluginFamily::voloco;
    return Status::success();
  }
  if (canonicalPluginId == "sixthsample.spoton") {
    family = VocalPluginFamily::spoton;
    return Status::success();
  }
  if (canonicalPluginId == "auburnsounds.graillon3") {
    family = VocalPluginFamily::graillon3;
    return Status::success();
  }
  return Status::failure(StatusCode::plugin_not_found,
                         "Only canonical Antares, Voloco, Spoton and Graillon 3 plugin families "
                         "are allowlisted.");
}

bool pathMatchesFamily(const std::string& path, const VocalPluginFamily family) {
  const auto value = lowercase(path);
  if (family == VocalPluginFamily::antares) {
    return value.find("antares") != std::string::npos &&
           (value.find("auto-tune") != std::string::npos ||
            value.find("autotune") != std::string::npos);
  }
  if (family == VocalPluginFamily::voloco) {
    return value.find("voloco") != std::string::npos ||
           value.find("resonant cavity") != std::string::npos;
  }
  const auto filename = moduleFilename(path);
  if (family == VocalPluginFamily::spoton) {
    return filename == "spoton.vst3";
  }
  return filename == "auburn sounds graillon 3.vst3";
}

bool metadataMatchesFamily(const VST3::Hosting::FactoryInfo& factoryInfo,
                           const ClassInfo& classInfo, const VocalPluginFamily family) {
  const auto value = lowercase(factoryInfo.vendor() + " " + classInfo.vendor() + " " +
                               classInfo.name());
  if (family == VocalPluginFamily::antares) {
    return vendorMatchesExactly(factoryInfo, classInfo, "Antares") &&
           lowercase(classInfo.name()) == "auto-tune pro" &&
           classInfo.version() == "11.0.0" &&
           classIdMatchesExactly(classInfo, kAntaresClassId);
  }
  if (family == VocalPluginFamily::voloco) {
    return value.find("voloco") != std::string::npos ||
           value.find("resonant cavity") != std::string::npos;
  }
  if (family == VocalPluginFamily::spoton) {
    return vendorMatchesExactly(factoryInfo, classInfo, "Sixth Sample") &&
           lowercase(classInfo.name()) == "spoton" &&
           classIdMatchesExactly(classInfo, "ABCDEF019182FAEB536978744C737733");
  }
  return vendorMatchesExactly(factoryInfo, classInfo, "Auburn Sounds") &&
         lowercase(classInfo.name()) == "graillon 3" &&
         classIdMatchesExactly(classInfo, "0B20BA920CE0B1456E62754133317340");
}

struct ModuleSelection final {
  Module::Ptr module;
  PluginFactory factory{nullptr};
  ClassInfo classInfo;
};

Status selectAllowlistedModule(const VocalPluginFamily family, ModuleSelection& selection) {
  auto modulePaths = Module::getModulePaths();
  std::ranges::sort(modulePaths);
  for (const auto& modulePath : modulePaths) {
    if (!pathMatchesFamily(modulePath, family)) {
      continue;
    }

    std::string error;
    auto module = Module::create(modulePath, error);
    if (!module) {
      continue;
    }
    auto factory = module->getFactory();
    const auto factoryInfo = factory.info();
    for (const auto& classInfo : factory.classInfos()) {
      if (classInfo.category() != kVstAudioEffectClass ||
          !metadataMatchesFamily(factoryInfo, classInfo, family)) {
        continue;
      }
      selection.module = std::move(module);
      selection.factory = std::move(factory);
      selection.classInfo = classInfo;
      return Status::success();
    }
  }

  return Status::failure(
      StatusCode::plugin_not_found,
      "No installed allowlisted " + std::string(familyDisplayName(family)) +
          " VST3 matched its exact standard bundle, vendor and product identity.");
}

}  // namespace

struct Vst3LiveProcessor::Impl final {
  Steinberg::IPtr<Steinberg::Vst::HostApplication> hostContext;
  Module::Ptr module;
  Steinberg::IPtr<Steinberg::Vst::PlugProvider> provider;
  Steinberg::OPtr<Steinberg::Vst::IComponent> component;
  Steinberg::OPtr<Steinberg::Vst::IEditController> controller;
  Steinberg::FUnknownPtr<Steinberg::Vst::IAudioProcessor> processor;
  Steinberg::Vst::HostProcessData processData;
  Steinberg::Vst::ParameterChanges inputChanges;
  Steinberg::Vst::ParameterChanges outputChanges;
  Steinberg::Vst::EventList inputEvents;
  Steinberg::Vst::EventList outputEvents;
  Steinberg::Vst::ProcessContext context{};
  MeeWavReverb reverb;
  SafetyLimiter limiter;
  Vst3LiveDescriptor descriptor;
  std::array<float*, 2> limiterChannels{};
  std::vector<float> postFxLeft;
  std::vector<float> postFxRight;
  VocalPluginFamily family{VocalPluginFamily::antares};
  std::atomic_bool controlsBypassed{false};
  std::atomic<float> controlsInputGain{1.0F};
  float smoothedInputGain{1.0F};
  std::atomic<std::uint32_t> controlsKey{0};
  std::atomic<std::uint32_t> controlsScale{0};
  std::atomic<float> controlsAmount{1.0F};
  std::atomic<float> controlsRetune{0.5F};
  std::atomic<float> controlsHumanize{0.0F};
  std::atomic_bool reverbEnabled{false};
  std::atomic<float> reverbMix{0.0F};
  std::atomic<std::uint32_t> reverbType{
      static_cast<std::uint32_t>(MeeWavReverbType::room)};
  std::atomic<float> reverbDurationSeconds{1.2F};
  std::atomic<float> reverbPreDelayMs{0.0F};
  std::atomic<std::uint64_t> requestedControlRevision{1};
  std::atomic<std::uint64_t> appliedControlRevision{0};
  std::uint32_t maximumFrames{0};
  std::int64_t continuousFrames{0};
  bool active{false};

  [[nodiscard]] MeeWavReverbSettings currentReverbSettings() const noexcept {
    return MeeWavReverbSettings{
        reverbEnabled.load(std::memory_order_relaxed),
        reverbMix.load(std::memory_order_relaxed),
        static_cast<MeeWavReverbType>(reverbType.load(std::memory_order_relaxed)),
        reverbDurationSeconds.load(std::memory_order_relaxed),
        reverbPreDelayMs.load(std::memory_order_relaxed)};
  }

  [[nodiscard]] bool parameterExists(const ParamID id) const noexcept {
    if (!controller) {
      return false;
    }
    const auto count = controller->getParameterCount();
    for (Steinberg::int32 index = 0; index < count; ++index) {
      Steinberg::Vst::ParameterInfo info{};
      if (controller->getParameterInfo(index, info) == Steinberg::kResultOk && info.id == id) {
        return true;
      }
    }
    return false;
  }

  Status validateControlParameters() const {
    if (family == VocalPluginFamily::antares) {
      constexpr std::array<ParamID, 6> kAntaresParameters{
          kAntaresScale, kAntaresKey, kAntaresRetuneSpeed, kAntaresHumanize,
          kAntaresMasterBypass, kAntaresWetDryMix};
      for (const auto id : kAntaresParameters) {
        if (!parameterExists(id)) {
          return Status::failure(StatusCode::plugin_incompatible,
                                 "Verified Antares vocal-control parameter is missing.");
        }
      }
      return Status::success();
    }
    if (family != VocalPluginFamily::spoton && family != VocalPluginFamily::graillon3) {
      return Status::success();
    }
    const auto& notes = family == VocalPluginFamily::spoton ? kSpotonNotes : kGraillonNotes;
    const std::array<ParamID, 4> scalarParameters =
        family == VocalPluginFamily::spoton
            ? std::array<ParamID, 4>{kSpotonBypassAll, kSpotonAmount, kSpotonSpeed,
                                     Steinberg::Vst::kNoParamId}
            : std::array<ParamID, 4>{kGraillonBypass, kGraillonAmount, kGraillonSmooth,
                                     kGraillonCorrectionEnabled};
    for (const auto id : scalarParameters) {
      if (id != Steinberg::Vst::kNoParamId && !parameterExists(id)) {
        return Status::failure(StatusCode::plugin_incompatible,
                               "Verified VST3 vocal-control parameter is missing.");
      }
    }
    for (const auto id : notes) {
      if (!parameterExists(id)) {
        return Status::failure(StatusCode::plugin_incompatible,
                               "Verified VST3 note-toggle parameter is missing.");
      }
    }
    return Status::success();
  }

  bool addInputParameterChange(const ParamID id, const double value) noexcept {
    Steinberg::int32 queueIndex = 0;
    auto* queue = inputChanges.addParameterData(id, queueIndex);
    if (queue == nullptr) {
      return false;
    }
    Steinberg::int32 pointIndex = 0;
    return queue->addPoint(0, std::clamp(value, 0.0, 1.0), pointIndex) ==
           Steinberg::kResultTrue;
  }

  bool queueRequestedControls(std::uint64_t& queuedRevision) noexcept {
    queuedRevision = 0;
    if (family != VocalPluginFamily::antares && family != VocalPluginFamily::spoton &&
        family != VocalPluginFamily::graillon3) {
      return true;
    }
    const auto revision = requestedControlRevision.load(std::memory_order_acquire);
    if (revision == appliedControlRevision.load(std::memory_order_relaxed)) {
      return true;
    }

    const auto bypassed = controlsBypassed.load(std::memory_order_relaxed);
    const auto key = controlsKey.load(std::memory_order_relaxed);
    const auto scale = controlsScale.load(std::memory_order_relaxed);
    const auto amount = controlsAmount.load(std::memory_order_relaxed);
    const auto retune = controlsRetune.load(std::memory_order_relaxed);
    const auto humanize = controlsHumanize.load(std::memory_order_relaxed);

    if (family == VocalPluginFamily::antares) {
      const auto scaleStep = kAntaresScaleSteps[scale];
      if (!addInputParameterChange(kAntaresMasterBypass, bypassed ? 1.0 : 0.0) ||
          !addInputParameterChange(kAntaresWetDryMix, 1.0) ||
          !addInputParameterChange(kAntaresKey, static_cast<double>(key) / 11.0) ||
          !addInputParameterChange(kAntaresScale, static_cast<double>(scaleStep) / 28.0) ||
          !addInputParameterChange(kAntaresRetuneSpeed, retune) ||
          !addInputParameterChange(kAntaresHumanize, humanize)) {
        return false;
      }
      queuedRevision = revision;
      return true;
    }
    const auto& notes = family == VocalPluginFamily::spoton ? kSpotonNotes : kGraillonNotes;

    if (family == VocalPluginFamily::spoton) {
      if (!addInputParameterChange(kSpotonBypassAll, bypassed ? 1.0 : 0.0) ||
          !addInputParameterChange(kSpotonAmount, amount) ||
          !addInputParameterChange(kSpotonSpeed, retune)) {
        return false;
      }
    } else if (!addInputParameterChange(kGraillonBypass, bypassed ? 1.0 : 0.0) ||
               !addInputParameterChange(kGraillonCorrectionEnabled, 1.0) ||
               !addInputParameterChange(kGraillonAmount, amount) ||
               // Graillon's documented Smooth direction is the inverse of
               // MeeWav retune: minimum Smooth is the fastest/hardest tuning.
               !addInputParameterChange(kGraillonSmooth, 1.0 - retune)) {
      return false;
    }

    for (std::uint32_t pitchClass = 0; pitchClass < notes.size(); ++pitchClass) {
      if (!addInputParameterChange(notes[pitchClass],
                                   noteIsEnabled(key, scale, pitchClass) ? 1.0 : 0.0)) {
        return false;
      }
    }
    queuedRevision = revision;
    return true;
  }

  Status configureBuses() {
    const auto inputBusCount = component->getBusCount(Steinberg::Vst::kAudio,
                                                      Steinberg::Vst::kInput);
    const auto outputBusCount = component->getBusCount(Steinberg::Vst::kAudio,
                                                       Steinberg::Vst::kOutput);
    if (inputBusCount < 1 || outputBusCount < 1) {
      return Status::failure(StatusCode::plugin_incompatible,
                             "Vocal plugin requires a main audio input and output bus.");
    }

    std::vector<Steinberg::Vst::SpeakerArrangement> inputs(
        static_cast<std::size_t>(inputBusCount));
    std::vector<Steinberg::Vst::SpeakerArrangement> outputs(
        static_cast<std::size_t>(outputBusCount));
    for (Steinberg::int32 index = 0; index < inputBusCount; ++index) {
      if (processor->getBusArrangement(Steinberg::Vst::kInput, index,
                                       inputs[static_cast<std::size_t>(index)]) !=
          Steinberg::kResultOk) {
        return Status::failure(StatusCode::plugin_incompatible,
                               "Unable to read VST3 input bus arrangement.");
      }
    }
    for (Steinberg::int32 index = 0; index < outputBusCount; ++index) {
      if (processor->getBusArrangement(Steinberg::Vst::kOutput, index,
                                       outputs[static_cast<std::size_t>(index)]) !=
          Steinberg::kResultOk) {
        return Status::failure(StatusCode::plugin_incompatible,
                               "Unable to read VST3 output bus arrangement.");
      }
    }

    inputs.front() = Steinberg::Vst::SpeakerArr::kMono;
    outputs.front() = Steinberg::Vst::SpeakerArr::kMono;
    auto arrangementResult = processor->setBusArrangements(
        inputs.data(), inputBusCount, outputs.data(), outputBusCount);
    if (arrangementResult != Steinberg::kResultOk &&
        arrangementResult != Steinberg::kResultTrue) {
      inputs.front() = Steinberg::Vst::SpeakerArr::kStereo;
      outputs.front() = Steinberg::Vst::SpeakerArr::kStereo;
      arrangementResult = processor->setBusArrangements(
          inputs.data(), inputBusCount, outputs.data(), outputBusCount);
    }
    if (arrangementResult != Steinberg::kResultOk &&
        arrangementResult != Steinberg::kResultTrue) {
      return Status::failure(StatusCode::plugin_incompatible,
                             "Plugin rejected both mono and stereo vocal arrangements.");
    }

    for (Steinberg::int32 index = 0; index < inputBusCount; ++index) {
      component->activateBus(Steinberg::Vst::kAudio, Steinberg::Vst::kInput, index, index == 0);
    }
    for (Steinberg::int32 index = 0; index < outputBusCount; ++index) {
      component->activateBus(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput, index, index == 0);
    }

    Steinberg::Vst::BusInfo inputInfo{};
    Steinberg::Vst::BusInfo outputInfo{};
    if (component->getBusInfo(Steinberg::Vst::kAudio, Steinberg::Vst::kInput, 0, inputInfo) !=
            Steinberg::kResultOk ||
        component->getBusInfo(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput, 0, outputInfo) !=
            Steinberg::kResultOk ||
        inputInfo.channelCount < 1 || inputInfo.channelCount > 2 || outputInfo.channelCount < 1 ||
        outputInfo.channelCount > 2) {
      return Status::failure(StatusCode::plugin_incompatible,
                             "POC supports only mono/stereo main vocal buses.");
    }
    descriptor.inputChannels = static_cast<std::uint32_t>(inputInfo.channelCount);
    descriptor.outputChannels = static_cast<std::uint32_t>(outputInfo.channelCount);
    return Status::success();
  }

  void clearProcessBuffers(const std::uint32_t frameCount) noexcept {
    for (Steinberg::int32 bus = 0; bus < processData.numInputs; ++bus) {
      auto& inputBus = processData.inputs[bus];
      inputBus.silenceFlags = 0;
      for (Steinberg::int32 channel = 0; channel < inputBus.numChannels; ++channel) {
        std::fill_n(inputBus.channelBuffers32[channel], frameCount, 0.0F);
      }
    }
    for (Steinberg::int32 bus = 0; bus < processData.numOutputs; ++bus) {
      auto& outputBus = processData.outputs[bus];
      outputBus.silenceFlags = 0;
      for (Steinberg::int32 channel = 0; channel < outputBus.numChannels; ++channel) {
        std::fill_n(outputBus.channelBuffers32[channel], frameCount, 0.0F);
      }
    }
  }

  void shutdown() noexcept {
    if (processor && active) {
      processor->setProcessing(false);
    }
    if (component && active) {
      component->setActive(false);
    }
    active = false;
    processor.reset();
    controller.reset();
    component.reset();
    provider.reset();
    module.reset();
    if (hostContext) {
      Steinberg::Vst::PluginContextFactory::instance().setPluginContext(nullptr);
      hostContext.reset();
    }
    descriptor = {};
    controlsBypassed.store(false, std::memory_order_relaxed);
    controlsInputGain.store(1.0F, std::memory_order_relaxed);
    smoothedInputGain = 1.0F;
    controlsKey.store(0, std::memory_order_relaxed);
    controlsScale.store(0, std::memory_order_relaxed);
    controlsAmount.store(1.0F, std::memory_order_relaxed);
    controlsRetune.store(0.5F, std::memory_order_relaxed);
    reverbEnabled.store(false, std::memory_order_relaxed);
    reverbMix.store(0.0F, std::memory_order_relaxed);
    reverbType.store(static_cast<std::uint32_t>(MeeWavReverbType::room),
                     std::memory_order_relaxed);
    reverbDurationSeconds.store(1.2F, std::memory_order_relaxed);
    reverbPreDelayMs.store(0.0F, std::memory_order_relaxed);
    requestedControlRevision.store(1, std::memory_order_relaxed);
    appliedControlRevision.store(0, std::memory_order_relaxed);
    reverb.reset();
    postFxLeft.clear();
    postFxRight.clear();
    maximumFrames = 0;
    continuousFrames = 0;
  }
};

Vst3LiveProcessor::Vst3LiveProcessor() : impl_(std::make_unique<Impl>()) {}

Vst3LiveProcessor::~Vst3LiveProcessor() { close(); }

Status Vst3LiveProcessor::open(const Vst3LiveConfiguration& configuration) {
  close();
  if (configuration.sampleRate <= 0.0 || configuration.maximumFrames == 0) {
    return Status::failure(StatusCode::invalid_argument, "Invalid VST3 live configuration.");
  }

  VocalPluginFamily family{};
  const auto familyStatus = resolveFamily(configuration.canonicalPluginId, family);
  if (!familyStatus.isOk()) {
    return familyStatus;
  }

  ModuleSelection selection;
  const auto moduleStatus = selectAllowlistedModule(family, selection);
  if (!moduleStatus.isOk()) {
    return moduleStatus;
  }

  impl_->hostContext = Steinberg::owned(new Steinberg::Vst::HostApplication());
  Steinberg::Vst::PluginContextFactory::instance().setPluginContext(impl_->hostContext);
  impl_->module = std::move(selection.module);
  impl_->provider =
      Steinberg::owned(new Steinberg::Vst::PlugProvider(selection.factory, selection.classInfo, true));
  if (!impl_->provider->initialize()) {
    impl_->shutdown();
    return Status::failure(StatusCode::plugin_not_activated,
                           "Plugin initialization failed; activation may be required.");
  }

  impl_->component = impl_->provider->getComponent();
  impl_->controller = impl_->provider->getController();
  if (!impl_->component) {
    impl_->shutdown();
    return Status::failure(StatusCode::plugin_incompatible,
                           "VST3 component could not be instantiated.");
  }
  impl_->processor = Steinberg::FUnknownPtr<Steinberg::Vst::IAudioProcessor>(impl_->component);
  if (!impl_->processor) {
    impl_->shutdown();
    return Status::failure(StatusCode::plugin_incompatible,
                           "VST3 component does not expose IAudioProcessor.");
  }
  if (impl_->processor->canProcessSampleSize(Steinberg::Vst::kSample32) !=
      Steinberg::kResultTrue) {
    impl_->shutdown();
    return Status::failure(StatusCode::plugin_incompatible,
                           "VST3 plugin rejected 32-bit float processing.");
  }

  impl_->descriptor.canonicalPluginId = configuration.canonicalPluginId;
  impl_->family = family;
  impl_->descriptor.vendor = selection.classInfo.vendor();
  impl_->descriptor.name = selection.classInfo.name();
  impl_->descriptor.version = selection.classInfo.version();
  impl_->descriptor.classId = selection.classInfo.ID().toString();
  const auto busStatus = impl_->configureBuses();
  if (!busStatus.isOk()) {
    impl_->shutdown();
    return busStatus;
  }
  const auto controlsStatus = impl_->validateControlParameters();
  if (!controlsStatus.isOk()) {
    impl_->shutdown();
    return controlsStatus;
  }

  Steinberg::Vst::ProcessSetup setup{Steinberg::Vst::kRealtime, Steinberg::Vst::kSample32,
                                      static_cast<Steinberg::int32>(configuration.maximumFrames),
                                      configuration.sampleRate};
  if (impl_->processor->setupProcessing(setup) != Steinberg::kResultOk ||
      impl_->component->setActive(true) != Steinberg::kResultOk ||
      impl_->processor->setProcessing(true) != Steinberg::kResultOk) {
    impl_->shutdown();
    return Status::failure(StatusCode::plugin_incompatible,
                           "VST3 setup, activation or processing start failed.");
  }
  impl_->active = true;
  impl_->maximumFrames = configuration.maximumFrames;
  impl_->processData.prepare(*impl_->component,
                             static_cast<Steinberg::int32>(configuration.maximumFrames),
                             Steinberg::Vst::kSample32);
  impl_->processData.processMode = Steinberg::Vst::kRealtime;
  impl_->inputChanges.setMaxParameters(1'024);
  impl_->outputChanges.setMaxParameters(1'024);
  impl_->processData.inputParameterChanges = &impl_->inputChanges;
  impl_->processData.outputParameterChanges = &impl_->outputChanges;
  impl_->processData.inputEvents = &impl_->inputEvents;
  impl_->processData.outputEvents = &impl_->outputEvents;
  impl_->context = {};
  impl_->context.state = Steinberg::Vst::ProcessContext::kPlaying |
                         Steinberg::Vst::ProcessContext::kTempoValid |
                         Steinberg::Vst::ProcessContext::kTimeSigValid |
                         Steinberg::Vst::ProcessContext::kContTimeValid;
  impl_->context.sampleRate = configuration.sampleRate;
  impl_->context.tempo = 120.0;
  impl_->context.timeSigNumerator = 4;
  impl_->context.timeSigDenominator = 4;
  impl_->processData.processContext = &impl_->context;
  impl_->postFxLeft.assign(configuration.maximumFrames, 0.0F);
  impl_->postFxRight.assign(configuration.maximumFrames, 0.0F);
  impl_->reverb.prepare(configuration.sampleRate, configuration.maximumFrames);
  impl_->limiter.prepare(configuration.sampleRate, configuration.maximumFrames, 2);
  impl_->limiter.setCeilingDb(-1.0F);
  impl_->descriptor.latencySamples = impl_->processor->getLatencySamples();
  return Status::success();
}

void Vst3LiveProcessor::close() noexcept { impl_->shutdown(); }

Status Vst3LiveProcessor::updateControls(const Vst3LiveControls& controls,
                                         std::uint64_t* requestedRevision) noexcept {
  if (!impl_->active ||
      (impl_->family != VocalPluginFamily::antares &&
       impl_->family != VocalPluginFamily::spoton &&
       impl_->family != VocalPluginFamily::graillon3)) {
    return Status::failure(StatusCode::plugin_incompatible,
                           "This live VST3 does not expose verified MeeWav controls.");
  }
  if (controls.key >= 12U || controls.scale >= kScaleMasks.size() ||
      !std::isfinite(controls.inputGain) || controls.inputGain < 0.0F ||
      controls.inputGain > 1.0F ||
      !std::isfinite(controls.amount) || !std::isfinite(controls.retune) ||
      !std::isfinite(controls.humanize) ||
      !std::isfinite(controls.reverb.mix) ||
      !std::isfinite(controls.reverb.durationSeconds) ||
      !std::isfinite(controls.reverb.preDelayMs) ||
      controls.amount < 0.0F || controls.amount > 1.0F || controls.retune < 0.0F ||
      controls.retune > 1.0F || controls.humanize < 0.0F || controls.humanize > 1.0F ||
      controls.reverb.mix < 0.0F ||
      controls.reverb.mix > 1.0F ||
      controls.reverb.durationSeconds < MeeWavReverb::kMinimumDurationSeconds ||
      controls.reverb.durationSeconds > MeeWavReverb::kMaximumDurationSeconds ||
      controls.reverb.preDelayMs < 0.0F ||
      controls.reverb.preDelayMs > MeeWavReverb::kMaximumPreDelayMs ||
      static_cast<std::uint32_t>(controls.reverb.type) >
          static_cast<std::uint32_t>(MeeWavReverbType::hall)) {
    return Status::failure(StatusCode::invalid_argument,
                           "Native VST3 controls are outside their verified ranges.");
  }
  impl_->controlsBypassed.store(controls.bypassed, std::memory_order_relaxed);
  impl_->controlsInputGain.store(controls.inputGain, std::memory_order_relaxed);
  impl_->controlsKey.store(controls.key, std::memory_order_relaxed);
  impl_->controlsScale.store(controls.scale, std::memory_order_relaxed);
  impl_->controlsAmount.store(controls.amount, std::memory_order_relaxed);
  impl_->controlsRetune.store(controls.retune, std::memory_order_relaxed);
  impl_->controlsHumanize.store(controls.humanize, std::memory_order_relaxed);
  impl_->reverbEnabled.store(controls.reverb.enabled, std::memory_order_relaxed);
  impl_->reverbMix.store(controls.reverb.mix, std::memory_order_relaxed);
  impl_->reverbType.store(static_cast<std::uint32_t>(controls.reverb.type),
                          std::memory_order_relaxed);
  impl_->reverbDurationSeconds.store(controls.reverb.durationSeconds,
                                     std::memory_order_relaxed);
  impl_->reverbPreDelayMs.store(controls.reverb.preDelayMs, std::memory_order_relaxed);
  const auto revision =
      impl_->requestedControlRevision.fetch_add(1, std::memory_order_release) + 1U;
  if (requestedRevision != nullptr) {
    *requestedRevision = revision;
  }
  return Status::success();
}

std::uint64_t Vst3LiveProcessor::appliedControlRevision() const noexcept {
  return impl_->appliedControlRevision.load(std::memory_order_acquire);
}

bool Vst3LiveProcessor::processMonoToStereo(const float* input, const std::uint32_t frameCount,
                                            float* interleavedStereoOutput) noexcept {
  if (!impl_->active || input == nullptr || interleavedStereoOutput == nullptr || frameCount == 0 ||
      frameCount > impl_->maximumFrames) {
    return false;
  }

  impl_->clearProcessBuffers(frameCount);
  auto& mainInput = impl_->processData.inputs[0];
  const auto targetInputGain = impl_->controlsInputGain.load(std::memory_order_relaxed);
  // A short one-pole ramp prevents clicks when the UI fader moves. It happens
  // before the VST so the same trim reaches pitch detection and every output.
  for (std::uint32_t frame = 0; frame < frameCount; ++frame) {
    impl_->smoothedInputGain += (targetInputGain - impl_->smoothedInputGain) * 0.004F;
    mainInput.channelBuffers32[0][frame] = input[frame] * impl_->smoothedInputGain;
  }
  for (Steinberg::int32 channel = 1; channel < mainInput.numChannels; ++channel) {
    std::copy_n(mainInput.channelBuffers32[0], frameCount, mainInput.channelBuffers32[channel]);
  }

  impl_->processData.numSamples = static_cast<Steinberg::int32>(frameCount);
  impl_->context.projectTimeSamples = impl_->continuousFrames;
  impl_->context.continousTimeSamples = impl_->continuousFrames;
  impl_->inputChanges.clearQueue();
  impl_->outputChanges.clearQueue();
  impl_->inputEvents.clear();
  impl_->outputEvents.clear();
  std::uint64_t queuedControlRevision = 0;
  if (!impl_->queueRequestedControls(queuedControlRevision)) {
    return false;
  }
  if (impl_->processor->process(impl_->processData) != Steinberg::kResultOk) {
    return false;
  }
  if (queuedControlRevision != 0) {
    impl_->appliedControlRevision.store(queuedControlRevision, std::memory_order_release);
  }
  impl_->continuousFrames += frameCount;

  auto& mainOutput = impl_->processData.outputs[0];
  if (mainOutput.numChannels < 1 || mainOutput.channelBuffers32 == nullptr) {
    return false;
  }
  const auto* pluginLeft = mainOutput.channelBuffers32[0];
  const auto* pluginRight = mainOutput.numChannels > 1 ? mainOutput.channelBuffers32[1]
                                                        : mainOutput.channelBuffers32[0];
  std::copy_n(pluginLeft, frameCount, impl_->postFxLeft.data());
  std::copy_n(pluginRight, frameCount, impl_->postFxRight.data());
  impl_->reverb.processStereo(impl_->postFxLeft.data(), impl_->postFxRight.data(), frameCount,
                              impl_->currentReverbSettings());
  impl_->limiterChannels[0] = impl_->postFxLeft.data();
  impl_->limiterChannels[1] = impl_->postFxRight.data();
  impl_->limiter.process(AudioBlock{impl_->limiterChannels.data(),
                                    2U, frameCount,
                                    impl_->context.sampleRate});

  const auto* left = impl_->limiterChannels[0];
  const auto* right = impl_->limiterChannels[1];
  for (std::uint32_t frame = 0; frame < frameCount; ++frame) {
    if (!std::isfinite(left[frame]) || !std::isfinite(right[frame])) {
      return false;
    }
    interleavedStereoOutput[(frame * 2U)] = left[frame];
    interleavedStereoOutput[(frame * 2U) + 1U] = right[frame];
  }
  return true;
}

bool Vst3LiveProcessor::isOpen() const noexcept { return impl_->active; }

const Vst3LiveDescriptor& Vst3LiveProcessor::descriptor() const noexcept {
  return impl_->descriptor;
}

}  // namespace meewav::audio
