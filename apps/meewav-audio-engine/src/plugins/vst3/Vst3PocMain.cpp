// Windows-only, SDK-gated proof of concept.
//
// This executable is deliberately separate from the production plugin registry
// and live processor. Installed commercial plugins are discovered only through
// Steinberg's standard VST3 locations. Open-source candidates can be loaded
// only by an explicit laboratory ID and a locally configured candidate root;
// each ID resolves to one fixed relative bundle path. Neither a
// browser-provided plugin path nor an arbitrary module path is accepted.

#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "public.sdk/source/vst/hosting/eventlist.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"
#include "public.sdk/source/vst/hosting/plugprovider.h"
#include "public.sdk/source/vst/hosting/processdata.h"
#include "public.sdk/source/vst/utility/stringconvert.h"

#include <algorithm>
#include <array>
#include <bit>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <objbase.h>
#endif

namespace {

using Steinberg::OPtr;
using Steinberg::Vst::EventList;
using Steinberg::Vst::HostApplication;
using Steinberg::Vst::HostProcessData;
using Steinberg::Vst::IAudioProcessor;
using Steinberg::Vst::IComponent;
using Steinberg::Vst::IEditController;
using Steinberg::Vst::ParameterChanges;
using Steinberg::Vst::PluginContextFactory;
using Steinberg::Vst::PlugProvider;
using Steinberg::Vst::ProcessContext;
using Steinberg::Vst::ProcessSetup;
using Steinberg::Vst::SpeakerArrangement;
using VST3::Hosting::ClassInfo;
using VST3::Hosting::Module;

constexpr Steinberg::int32 kBlockFrames = 128;
constexpr Steinberg::Vst::SampleRate kSampleRate = 48'000.0;
constexpr std::uint64_t kProbeSignalFrames = 3U * 48'000U;
constexpr std::uint64_t kProbeTailFrames = 48'000U;
constexpr double kPi = 3.14159265358979323846;

enum class TargetKind { standardInstallation, localCandidate };

struct TargetDefinition final {
  std::string_view canonicalId;
  TargetKind kind;
  std::string_view fixedRelativeBundle;
};

constexpr std::array<TargetDefinition, 8> kTargets{{
    {"antares.autotune", TargetKind::standardInstallation, ""},
    {"resonantcavity.voloco-producer", TargetKind::standardInstallation, ""},
    {"sixthsample.spoton", TargetKind::standardInstallation, ""},
    {"auburnsounds.graillon3", TargetKind::standardInstallation, ""},
    {"meewav.lab.qpitch", TargetKind::localCandidate,
     "qpitch/QPitch_artefacts/Release/VST3/QPitch.vst3"},
    {"meewav.lab.openvoxtuner", TargetKind::localCandidate,
     "openvoxtuner/OpenVoxTuner_artefacts/Release/VST3/OpenVoxTuner.vst3"},
    {"meewav.lab.qpitch-v1.3.1", TargetKind::localCandidate,
     "repro-qpitch-v1.3.1/QPitch_artefacts/Release/VST3/QPitch.vst3"},
    {"meewav.lab.openvoxtuner-v0.1.67", TargetKind::localCandidate,
     "repro-openvoxtuner-v0.1.67/OpenVoxTuner_artefacts/Release/VST3/"
     "OpenVoxTuner.vst3"},
}};

struct CommandLine final {
  std::vector<const TargetDefinition *> targets;
  std::optional<std::filesystem::path> candidateRoot;
  bool explicitTargets{false};
  bool showHelp{false};
  std::string error;
};

struct ProbeDiagnostics final {
  bool finite{true};
  std::uint64_t inputHash{1'469'598'103'934'665'603ULL};
  std::uint64_t outputSamples{0};
  std::uint64_t nonSilentSamples{0};
  double outputRms{0.0};
  double outputPeak{0.0};
  double alignedDifferenceRms{0.0};
  std::uint64_t outputHash{1'469'598'103'934'665'603ULL};
};

std::string lowercase(std::string value) {
  std::ranges::transform(value, value.begin(),
                         [](const unsigned char character) {
                           return static_cast<char>(std::tolower(character));
                         });
  return value;
}

std::string normalizedAlphanumeric(const std::string_view value) {
  std::string normalized;
  normalized.reserve(value.size());
  for (const auto character : value) {
    const auto unsignedCharacter = static_cast<unsigned char>(character);
    if (std::isalnum(unsignedCharacter) != 0) {
      normalized.push_back(
          static_cast<char>(std::tolower(unsignedCharacter)));
    }
  }
  return normalized;
}

const TargetDefinition *findTarget(const std::string_view canonicalId) {
  const auto target =
      std::ranges::find_if(kTargets, [canonicalId](const auto &candidate) {
        return candidate.canonicalId == canonicalId;
      });
  return target == kTargets.end() ? nullptr : &*target;
}

void addTargetOnce(std::vector<const TargetDefinition *> &targets,
                   const TargetDefinition &target) {
  if (std::ranges::find(targets, &target) == targets.end()) {
    targets.push_back(&target);
  }
}

CommandLine parseCommandLine(const int argc, char **argv) {
  CommandLine result;
  for (int index = 1; index < argc; ++index) {
    const std::string_view argument(argv[index]);
    if (argument == "--help" || argument == "-h") {
      result.showHelp = true;
      continue;
    }
    if (argument == "--target") {
      if (++index >= argc) {
        result.error = "--target requires a canonical laboratory ID.";
        return result;
      }
      result.explicitTargets = true;
      const std::string_view value(argv[index]);
      if (value == "all") {
        for (const auto &target : kTargets) {
          addTargetOnce(result.targets, target);
        }
        continue;
      }
      const auto *target = findTarget(value);
      if (target == nullptr) {
        result.error = "Unknown canonical target ID: " + std::string(value);
        return result;
      }
      addTargetOnce(result.targets, *target);
      continue;
    }
    if (argument == "--candidate-root") {
      if (++index >= argc) {
        result.error = "--candidate-root requires a local root directory.";
        return result;
      }
      result.candidateRoot = std::filesystem::path(argv[index]);
      continue;
    }
    result.error = "Unknown argument: " + std::string(argument);
    return result;
  }

  if (result.targets.empty() && !result.showHelp) {
    // Preserve the original no-argument behavior: probe installed
    // Antares/Voloco families.
    addTargetOnce(result.targets, kTargets[0]);
    addTargetOnce(result.targets, kTargets[1]);
  }
  return result;
}

void printUsage() {
  std::cout
      << "MeeWav isolated VST3 laboratory probe\n\n"
      << "Usage:\n"
      << "  meewav-vst3-poc [--target <canonical-id>]... "
         "[--candidate-root <directory>]\n\n"
      << "Canonical IDs:\n"
      << "  antares.autotune                  standard VST3 locations only\n"
      << "  resonantcavity.voloco-producer    standard VST3 locations only\n"
      << "  sixthsample.spoton                standard VST3 locations only\n"
      << "  auburnsounds.graillon3            standard VST3 locations only\n"
      << "  meewav.lab.qpitch                 fixed QPitch Release bundle "
         "under root\n"
      << "  meewav.lab.openvoxtuner           fixed OpenVoxTuner Release "
         "bundle under root\n"
      << "  meewav.lab.qpitch-v1.3.1          fixed source-tag build under "
         "repro-qpitch-v1.3.1\n"
      << "  meewav.lab.openvoxtuner-v0.1.67  fixed source-tag build under "
         "repro-openvoxtuner-v0.1.67\n"
      << "  all                               all eight IDs\n\n"
      << "The candidate root is local laboratory configuration. No direct "
         "module path is "
         "accepted.\n";
}

bool metadataMatchesTarget(const TargetDefinition &target,
                           const VST3::Hosting::FactoryInfo &factoryInfo,
                           const ClassInfo &classInfo) {
  const auto identity = lowercase(factoryInfo.vendor() + " " +
                                  classInfo.vendor() + " " + classInfo.name());
  const auto normalizedVendor = normalizedAlphanumeric(
      factoryInfo.vendor() + " " + classInfo.vendor());
  const auto normalizedName = normalizedAlphanumeric(classInfo.name());
  if (target.canonicalId == "antares.autotune") {
    return identity.find("antares") != std::string::npos &&
           (identity.find("auto-tune") != std::string::npos ||
            identity.find("autotune") != std::string::npos);
  }
  if (target.canonicalId == "resonantcavity.voloco-producer") {
    return identity.find("voloco") != std::string::npos ||
           identity.find("resonant cavity") != std::string::npos;
  }
  if (target.canonicalId == "sixthsample.spoton") {
    return normalizedVendor.find("sixthsample") != std::string::npos &&
           normalizedName == "spoton" &&
           classInfo.ID().toString() == "ABCDEF019182FAEB536978744C737733";
  }
  if (target.canonicalId == "auburnsounds.graillon3") {
    return normalizedVendor.find("auburnsounds") != std::string::npos &&
           normalizedName == "graillon3" &&
           classInfo.ID().toString() == "0B20BA920CE0B1456E62754133317340";
  }
  if (target.canonicalId.starts_with("meewav.lab.qpitch")) {
    return lowercase(classInfo.name()) == "qpitch" &&
           identity.find("qpitch") != std::string::npos;
  }
  if (target.canonicalId.starts_with("meewav.lab.openvoxtuner")) {
    return lowercase(classInfo.name()) == "openvoxtuner" &&
           identity.find("openvoxtuner") != std::string::npos;
  }
  return false;
}

bool standardPathMatchesTarget(const TargetDefinition &target,
                               const std::string &modulePath) {
  const auto identity = lowercase(modulePath);
  const auto normalizedPath = normalizedAlphanumeric(modulePath);
  if (target.canonicalId == "antares.autotune") {
    return identity.find("antares") != std::string::npos &&
           (identity.find("auto-tune") != std::string::npos ||
            identity.find("autotune") != std::string::npos);
  }
  if (target.canonicalId == "resonantcavity.voloco-producer") {
    return identity.find("voloco") != std::string::npos ||
           identity.find("resonant cavity") != std::string::npos;
  }
  if (target.canonicalId == "sixthsample.spoton") {
    // The official Windows installer currently places Spoton.vst3 directly
    // in the standard VST3 root. The exact bundle name is accepted here;
    // vendor + product metadata is still required before instantiation.
    return normalizedAlphanumeric(
               std::filesystem::path(modulePath).filename().string()) ==
           "spotonvst3";
  }
  if (target.canonicalId == "auburnsounds.graillon3") {
    return normalizedPath.find("auburnsounds") != std::string::npos &&
           normalizedPath.find("graillon3vst3") != std::string::npos;
  }
  return false;
}

bool isPathInsideRoot(const std::filesystem::path &root,
                      const std::filesystem::path &child) {
  auto rootIterator = root.begin();
  auto childIterator = child.begin();
  for (; rootIterator != root.end(); ++rootIterator, ++childIterator) {
    if (childIterator == child.end() ||
        lowercase(rootIterator->string()) !=
            lowercase(childIterator->string())) {
      return false;
    }
  }
  return true;
}

std::optional<std::string>
resolveCandidateModule(const TargetDefinition &target,
                       const CommandLine &commandLine, std::string &error) {
  if (!commandLine.candidateRoot.has_value()) {
    error = "Candidate target requires --candidate-root.";
    return std::nullopt;
  }

  std::error_code filesystemError;
  const auto root = std::filesystem::weakly_canonical(
      *commandLine.candidateRoot, filesystemError);
  if (filesystemError || !std::filesystem::is_directory(root)) {
    error = "Candidate root is unavailable or is not a directory.";
    return std::nullopt;
  }
  const auto bundle = std::filesystem::weakly_canonical(
      root / std::filesystem::path(target.fixedRelativeBundle),
      filesystemError);
  if (filesystemError || !isPathInsideRoot(root, bundle) ||
      !std::filesystem::is_directory(bundle) ||
      lowercase(bundle.extension().string()) != ".vst3") {
    error = "Fixed candidate bundle is missing or escaped the configured root.";
    return std::nullopt;
  }
  return bundle.string();
}

std::vector<std::string> modulePathsForTarget(const TargetDefinition &target,
                                              const CommandLine &commandLine,
                                              std::string &error) {
  if (target.kind == TargetKind::standardInstallation) {
    auto paths = Module::getModulePaths();
    std::erase_if(paths, [&target](const auto &path) {
      return !standardPathMatchesTarget(target, path);
    });
    std::ranges::sort(paths);
    return paths;
  }

  const auto candidate = resolveCandidateModule(target, commandLine, error);
  return candidate.has_value() ? std::vector<std::string>{*candidate}
                               : std::vector<std::string>{};
}

void printParameterMetadata(IEditController *controller) {
  if (controller == nullptr) {
    std::cout << "    controller: absent\n";
    return;
  }

  const auto count = controller->getParameterCount();
  std::cout << "    parameters: " << count << '\n';
  Steinberg::int32 reported = 0;
  constexpr Steinberg::int32 kMaximumReportedParameters = 128;
  for (Steinberg::int32 index = 0; index < count; ++index) {
    Steinberg::Vst::ParameterInfo info{};
    if (controller->getParameterInfo(index, info) != Steinberg::kResultOk) {
      continue;
    }
    const auto title = Steinberg::Vst::StringConvert::convert(info.title);
    // JUCE exposes 2,080 MIDI-controller pseudo parameters for some plugins.
    // They are valid host metadata, but dumping them hides the actual vocal
    // controls and floods CI logs.
    if (title.starts_with("MIDI CC ") ||
        reported >= kMaximumReportedParameters) {
      continue;
    }
    std::cout << "      id=" << info.id << " title=\"" << title << "\""
              << " unit=\""
              << Steinberg::Vst::StringConvert::convert(info.units) << "\""
              << " default=" << std::fixed << std::setprecision(6)
              << info.defaultNormalizedValue
              << " current=" << controller->getParamNormalized(info.id)
              << " steps=" << info.stepCount
              << " automatable="
              << ((info.flags & Steinberg::Vst::ParameterInfo::kCanAutomate) !=
                          0
                      ? "true"
                      : "false")
              << " readonly="
              << ((info.flags & Steinberg::Vst::ParameterInfo::kIsReadOnly) != 0
                      ? "true"
                      : "false")
              << '\n';
    if (info.stepCount > 0 && info.stepCount <= 32) {
      std::cout << "        values:";
      for (Steinberg::int32 step = 0; step <= info.stepCount; ++step) {
        const auto normalized = static_cast<double>(step) /
                                static_cast<double>(info.stepCount);
        Steinberg::Vst::String128 display{};
        if (controller->getParamStringByValue(info.id, normalized, display) ==
            Steinberg::kResultOk) {
          std::cout << " " << step << "=\""
                    << Steinberg::Vst::StringConvert::convert(display) << "\"";
        }
      }
      std::cout << '\n';
    } else if (title == "Retune Speed" || title == "Humanize" ||
               title == "Wet-Dry Mix") {
      std::cout << "        samples:";
      for (const auto normalized : std::array{0.0, 0.25, 0.5, 0.75, 1.0}) {
        Steinberg::Vst::String128 display{};
        if (controller->getParamStringByValue(info.id, normalized, display) ==
            Steinberg::kResultOk) {
          std::cout << " " << normalized << "=\""
                    << Steinberg::Vst::StringConvert::convert(display) << "\"";
        }
      }
      std::cout << '\n';
    }
    ++reported;
  }
  std::cout << "    parametersReported: " << reported << '\n';
  std::cout << "    parametersSuppressed: "
            << std::max<Steinberg::int32>(0, count - reported) << '\n';
}

bool configureBuses(IComponent &component, IAudioProcessor &processor) {
  const auto inputCount =
      component.getBusCount(Steinberg::Vst::kAudio, Steinberg::Vst::kInput);
  const auto outputCount =
      component.getBusCount(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput);
  if (inputCount < 1 || outputCount < 1) {
    return false;
  }
  std::vector<SpeakerArrangement> inputs(static_cast<std::size_t>(inputCount));
  std::vector<SpeakerArrangement> outputs(
      static_cast<std::size_t>(outputCount));

  for (Steinberg::int32 index = 0; index < inputCount; ++index) {
    if (processor.getBusArrangement(Steinberg::Vst::kInput, index,
                                    inputs[static_cast<std::size_t>(index)]) !=
        Steinberg::kResultOk) {
      return false;
    }
    component.activateBus(Steinberg::Vst::kAudio, Steinberg::Vst::kInput, index,
                          index == 0);
  }
  for (Steinberg::int32 index = 0; index < outputCount; ++index) {
    if (processor.getBusArrangement(Steinberg::Vst::kOutput, index,
                                    outputs[static_cast<std::size_t>(index)]) !=
        Steinberg::kResultOk) {
      return false;
    }
    component.activateBus(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput,
                          index, index == 0);
  }

  const auto result = processor.setBusArrangements(inputs.data(), inputCount,
                                                   outputs.data(), outputCount);
  return result == Steinberg::kResultOk || result == Steinberg::kResultTrue;
}

float deterministicVocalLikeSample(const std::uint64_t frame, double &phase) {
  if (frame >= kProbeSignalFrames) {
    return 0.0F;
  }
  const auto time = static_cast<double>(frame) / kSampleRate;
  constexpr std::array<double, 4> kNoteFrequencies{216.8, 246.1, 276.4, 326.2};
  const auto noteIndex = std::min<std::size_t>(
      static_cast<std::size_t>(time / 0.75), kNoteFrequencies.size() - 1);
  const auto vibratoSemitones = 0.32 * std::sin(2.0 * kPi * 5.2 * time);
  const auto frequency =
      kNoteFrequencies[noteIndex] * std::pow(2.0, vibratoSemitones / 12.0);
  phase += (2.0 * kPi * frequency) / kSampleRate;
  if (phase > 2.0 * kPi) {
    phase -= 2.0 * kPi;
  }

  const auto attack = std::min(1.0, time / 0.04);
  const auto remaining =
      (static_cast<double>(kProbeSignalFrames - frame)) / kSampleRate;
  const auto release = std::min(1.0, remaining / 0.08);
  const auto envelope =
      attack * release * (0.86 + 0.14 * std::sin(2.0 * kPi * 2.3 * time));
  const auto signal =
      0.10 * std::sin(phase) + 0.036 * std::sin(2.0 * phase + 0.2) +
      0.018 * std::sin(3.0 * phase + 0.6) + 0.008 * std::sin(4.0 * phase + 1.1);
  return static_cast<float>(envelope * signal);
}

void updateHash(std::uint64_t &hash, const float sample) {
  const auto bits = std::bit_cast<std::uint32_t>(sample);
  for (unsigned int shift = 0; shift < 32U; shift += 8U) {
    hash ^= (bits >> shift) & 0xFFU;
    hash *= 1'099'511'628'211ULL;
  }
}

bool processProbe(IComponent &component, IAudioProcessor &processor,
                  ProbeDiagnostics &diagnostics) {
  if (processor.canProcessSampleSize(Steinberg::Vst::kSample32) !=
      Steinberg::kResultTrue) {
    std::cout << "    process: rejected 32-bit float audio\n";
    return false;
  }
  if (!configureBuses(component, processor)) {
    std::cout << "    process: bus configuration rejected\n";
    return false;
  }

  ProcessSetup setup{Steinberg::Vst::kRealtime, Steinberg::Vst::kSample32,
                     kBlockFrames, kSampleRate};
  if (processor.setupProcessing(setup) != Steinberg::kResultOk ||
      component.setActive(true) != Steinberg::kResultOk ||
      processor.setProcessing(true) != Steinberg::kResultOk) {
    std::cout << "    process: setup/activation failed\n";
    component.setActive(false);
    return false;
  }

  HostProcessData processData;
  processData.prepare(component, kBlockFrames, Steinberg::Vst::kSample32);
  processData.processMode = Steinberg::Vst::kRealtime;
  processData.numSamples = kBlockFrames;

  ParameterChanges inputChanges;
  ParameterChanges outputChanges;
  EventList inputEvents;
  EventList outputEvents;
  processData.inputParameterChanges = &inputChanges;
  processData.outputParameterChanges = &outputChanges;
  processData.inputEvents = &inputEvents;
  processData.outputEvents = &outputEvents;

  ProcessContext context{};
  context.state = ProcessContext::kPlaying | ProcessContext::kTempoValid |
                  ProcessContext::kTimeSigValid |
                  ProcessContext::kContTimeValid;
  context.sampleRate = kSampleRate;
  context.tempo = 120.0;
  context.timeSigNumerator = 4;
  context.timeSigDenominator = 4;
  processData.processContext = &context;

  const auto reportedLatency = processor.getLatencySamples();
  const auto totalFrames = kProbeSignalFrames + kProbeTailFrames;
  std::vector<float> drySignal(static_cast<std::size_t>(kProbeSignalFrames),
                               0.0F);
  double inputPhase = 0.0;
  double outputSquareSum = 0.0;
  double differenceSquareSum = 0.0;
  std::uint64_t differenceSamples = 0;
  bool processSucceeded = true;

  for (std::uint64_t blockStart = 0; blockStart < totalFrames;
       blockStart += static_cast<std::uint64_t>(kBlockFrames)) {
    std::array<float, static_cast<std::size_t>(kBlockFrames)> inputBlock{};
    for (Steinberg::int32 frame = 0; frame < kBlockFrames; ++frame) {
      const auto absoluteFrame = blockStart + static_cast<std::uint64_t>(frame);
      inputBlock[static_cast<std::size_t>(frame)] =
          deterministicVocalLikeSample(absoluteFrame, inputPhase);
      updateHash(diagnostics.inputHash,
                 inputBlock[static_cast<std::size_t>(frame)]);
      if (absoluteFrame < kProbeSignalFrames) {
        drySignal[static_cast<std::size_t>(absoluteFrame)] =
            inputBlock[static_cast<std::size_t>(frame)];
      }
    }
    for (Steinberg::int32 bus = 0; bus < processData.numInputs; ++bus) {
      auto &input = processData.inputs[bus];
      input.silenceFlags = 0;
      for (Steinberg::int32 channel = 0; channel < input.numChannels;
           ++channel) {
        auto *samples = input.channelBuffers32[channel];
        if (bus == 0) {
          std::copy(inputBlock.begin(), inputBlock.end(), samples);
        } else {
          std::fill_n(samples, kBlockFrames, 0.0F);
        }
      }
    }
    for (Steinberg::int32 bus = 0; bus < processData.numOutputs; ++bus) {
      auto &output = processData.outputs[bus];
      output.silenceFlags = 0;
      for (Steinberg::int32 channel = 0; channel < output.numChannels;
           ++channel) {
        std::fill_n(output.channelBuffers32[channel], kBlockFrames, 0.0F);
      }
    }

    context.projectTimeSamples = static_cast<Steinberg::int64>(blockStart);
    context.continousTimeSamples = static_cast<Steinberg::int64>(blockStart);
    inputChanges.clearQueue();
    outputChanges.clearQueue();
    inputEvents.clear();
    outputEvents.clear();
    if (processor.process(processData) != Steinberg::kResultOk) {
      processSucceeded = false;
      break;
    }

    for (Steinberg::int32 bus = 0; bus < processData.numOutputs; ++bus) {
      const auto &output = processData.outputs[bus];
      for (Steinberg::int32 channel = 0; channel < output.numChannels;
           ++channel) {
        const auto *samples = output.channelBuffers32[channel];
        for (Steinberg::int32 frame = 0; frame < kBlockFrames; ++frame) {
          const auto sample = samples[frame];
          diagnostics.finite = diagnostics.finite && std::isfinite(sample);
          if (!std::isfinite(sample)) {
            continue;
          }
          const auto absolute = std::abs(static_cast<double>(sample));
          diagnostics.outputPeak = std::max(diagnostics.outputPeak, absolute);
          outputSquareSum += static_cast<double>(sample) * sample;
          ++diagnostics.outputSamples;
          if (absolute > 1.0e-7) {
            ++diagnostics.nonSilentSamples;
          }
          updateHash(diagnostics.outputHash, sample);

          if (bus == 0 && channel == 0) {
            const auto absoluteFrame =
                blockStart + static_cast<std::uint64_t>(frame);
            if (absoluteFrame >= reportedLatency) {
              const auto dryFrame = absoluteFrame - reportedLatency;
              if (dryFrame < drySignal.size()) {
                const auto difference =
                    static_cast<double>(sample) - drySignal[dryFrame];
                differenceSquareSum += difference * difference;
                ++differenceSamples;
              }
            }
          }
        }
      }
    }
  }

  processor.setProcessing(false);
  component.setActive(false);
  diagnostics.outputRms =
      diagnostics.outputSamples == 0
          ? 0.0
          : std::sqrt(outputSquareSum / diagnostics.outputSamples);
  diagnostics.alignedDifferenceRms =
      differenceSamples == 0
          ? 0.0
          : std::sqrt(differenceSquareSum / differenceSamples);
  const auto nonSilent =
      diagnostics.nonSilentSamples > 0 && diagnostics.outputRms > 1.0e-8;
  const auto bounded = diagnostics.outputPeak <= 8.0;

  std::cout
      << "    probeSignal: deterministic-vocal-like-v1 (3.0 s + 1.0 s tail)\n";
  std::cout << "    reportedLatencySamples: " << reportedLatency << '\n';
  std::cout << "    reportedLatencyMs: " << std::fixed << std::setprecision(3)
            << (1'000.0 * static_cast<double>(reportedLatency) / kSampleRate)
            << '\n';
  std::cout << "    outputFinite: " << (diagnostics.finite ? "true" : "false")
            << '\n';
  std::cout << "    outputNonSilent: " << (nonSilent ? "true" : "false")
            << '\n';
  std::cout << "    outputBounded: " << (bounded ? "true" : "false") << '\n';
  std::cout << "    outputRms: " << std::setprecision(9)
            << diagnostics.outputRms << '\n';
  std::cout << "    outputPeak: " << diagnostics.outputPeak << '\n';
  std::cout << "    alignedDifferenceRms: " << diagnostics.alignedDifferenceRms
            << '\n';
  std::cout << "    inputHashFnv1a64: " << std::hex << std::setw(16)
            << std::setfill('0') << diagnostics.inputHash << std::dec
            << std::setfill(' ') << '\n';
  std::cout << "    outputHashFnv1a64: " << std::hex << std::setw(16)
            << std::setfill('0') << diagnostics.outputHash << std::dec
            << std::setfill(' ') << '\n';
  std::cout << "    process: "
            << (processSucceeded && diagnostics.finite && nonSilent && bounded
                    ? "success"
                    : "failed")
            << '\n';
  std::cout << "    acousticVerdict: not-evaluated (requires recorded voice "
               "and listening)\n";
  return processSucceeded && diagnostics.finite && nonSilent && bounded;
}

bool inspectClass(const TargetDefinition &target, const Module::Ptr &module,
                  const VST3::Hosting::PluginFactory &factory,
                  const ClassInfo &classInfo) {
  std::cout << "  plugin: " << classInfo.name() << '\n';
  std::cout << "    canonicalTarget: " << target.canonicalId << '\n';
  std::cout << "    vendor: " << classInfo.vendor() << '\n';
  std::cout << "    version: " << classInfo.version() << '\n';
  std::cout << "    classId: " << classInfo.ID().toString() << '\n';
  std::cout << "    module: " << module->getName() << '\n';

  auto provider = Steinberg::owned(new PlugProvider(factory, classInfo, true));
  if (!provider->initialize()) {
    std::cout << "    instantiate: failed\n";
    return false;
  }

  OPtr<IComponent> component = provider->getComponent();
  OPtr<IEditController> controller = provider->getController();
  if (!component) {
    std::cout << "    instantiate: component unavailable\n";
    return false;
  }
  Steinberg::FUnknownPtr<IAudioProcessor> processor(component);
  if (!processor) {
    std::cout << "    instantiate: IAudioProcessor unavailable\n";
    return false;
  }

  std::cout << "    instantiate: success\n";
  printParameterMetadata(controller);
  ProbeDiagnostics diagnostics;
  return processProbe(*component, *processor, diagnostics);
}

struct TargetResult final {
  std::size_t modulesLoaded{0};
  std::size_t targetsFound{0};
  std::size_t probesPassed{0};
};

TargetResult probeTarget(const TargetDefinition &target,
                         const CommandLine &commandLine) {
  TargetResult result;
  std::cout << "target: " << target.canonicalId << '\n';
  std::string resolutionError;
  const auto modulePaths =
      modulePathsForTarget(target, commandLine, resolutionError);
  if (!resolutionError.empty()) {
    std::cout << "  resolution: failed (" << resolutionError << ")\n";
    return result;
  }
  if (modulePaths.empty()) {
    std::cout << "  resolution: no matching module path\n";
    return result;
  }

  for (const auto &modulePath : modulePaths) {
    std::cout << "  resolvedModule: " << modulePath << '\n';
    std::string error;
    const auto module = Module::create(modulePath, error);
    if (!module) {
      std::cout << "  moduleLoad: failed (" << error << ")\n";
      continue;
    }
    ++result.modulesLoaded;
    const auto factory = module->getFactory();
    const auto factoryInfo = factory.info();
    for (const auto &classInfo : factory.classInfos()) {
      if (classInfo.category() != kVstAudioEffectClass ||
          !metadataMatchesTarget(target, factoryInfo, classInfo)) {
        continue;
      }
      ++result.targetsFound;
      if (inspectClass(target, module, factory, classInfo)) {
        ++result.probesPassed;
      }
    }
  }
  std::cout << "  targetSummary: modulesLoaded=" << result.modulesLoaded
            << " targets=" << result.targetsFound
            << " probesPassed=" << result.probesPassed << '\n';
  return result;
}

} // namespace

int main(const int argc, char **argv) {
  const auto commandLine = parseCommandLine(argc, argv);
  if (!commandLine.error.empty()) {
    std::cerr << "error: " << commandLine.error << "\n\n";
    printUsage();
    return 2;
  }
  if (commandLine.showHelp) {
    printUsage();
    return 0;
  }

#if defined(_WIN32)
  const HRESULT comStatus = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(comStatus) && comStatus != RPC_E_CHANGED_MODE) {
    std::cerr << "COM initialization failed.\n";
    return 2;
  }
#endif

  auto hostContext = Steinberg::owned(new HostApplication());
  PluginContextFactory::instance().setPluginContext(hostContext);

  std::size_t targetsFound = 0;
  std::size_t probesPassed = 0;
  std::size_t requestedTargetsPassed = 0;
  for (const auto *target : commandLine.targets) {
    const auto result = probeTarget(*target, commandLine);
    targetsFound += result.targetsFound;
    probesPassed += result.probesPassed;
    if (result.targetsFound > 0 && result.probesPassed == result.targetsFound) {
      ++requestedTargetsPassed;
    }
  }

  PluginContextFactory::instance().setPluginContext(nullptr);
#if defined(_WIN32)
  if (SUCCEEDED(comStatus)) {
    CoUninitialize();
  }
#endif

  std::cout << "summary: requestedTargets=" << commandLine.targets.size()
            << " requestedTargetsPassed=" << requestedTargetsPassed
            << " targets=" << targetsFound << " probesPassed=" << probesPassed
            << '\n';
  if (commandLine.explicitTargets) {
    return requestedTargetsPassed == commandLine.targets.size() ? 0 : 3;
  }
  return targetsFound > 0 && probesPassed == targetsFound ? 0 : 3;
}
