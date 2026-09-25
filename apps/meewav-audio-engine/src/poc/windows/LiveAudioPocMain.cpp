#include "plugins/vst3/Vst3LiveProcessor.h"
#include "poc/windows/NativeVst3ControlProtocol.h"
#include "poc/windows/WasapiLiveMonitor.h"
#include "poc/windows/WasapiSharedPeriod.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <conio.h>
#include <objbase.h>
#include <windows.h>

#include <algorithm>
#include <atomic>
#include <array>
#include <charconv>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <functional>
#include <iomanip>
#include <iostream>
#include <syncstream>
#include <string>
#include <string_view>
#include <thread>

namespace {

using meewav::audio::Status;
using meewav::audio::StatusCode;
using meewav::audio::Vst3LiveControls;
using meewav::audio::Vst3LiveProcessor;

std::atomic_bool gStopRequested{false};

constexpr std::array<std::string_view, 4> kAllowedPluginIds{
    "antares.autotune", "resonantcavity.voloco-producer", "sixthsample.spoton",
    "auburnsounds.graillon3"};

bool isAllowedPluginId(const std::string_view pluginId) {
  return std::ranges::find(kAllowedPluginIds, pluginId) != kAllowedPluginIds.end();
}

BOOL WINAPI consoleControlHandler(const DWORD eventType) {
  switch (eventType) {
    case CTRL_C_EVENT:
    case CTRL_BREAK_EVENT:
    case CTRL_CLOSE_EVENT:
    case CTRL_LOGOFF_EVENT:
    case CTRL_SHUTDOWN_EVENT:
      gStopRequested.store(true, std::memory_order_release);
      return TRUE;
    default:
      return FALSE;
  }
}

struct CommandLine final {
  std::string canonicalPluginId;
  bool headphonesConfirmed{false};
  bool controlStdin{false};
  bool probeOnly{false};
  bool helpRequested{false};
};

void printUsage() {
  std::cout
      << "MeeWav VST3 live-monitoring POC (Windows x64)\n\n"
      << "Usage:\n"
      << "  meewav-vst3-live-poc --plugin <canonical-id> --confirm-headphones\n"
      << "  meewav-vst3-live-poc --plugin <canonical-id> --confirm-headphones "
         "--control-stdin\n"
      << "  meewav-vst3-live-poc --plugin <canonical-id> --probe-only\n\n"
      << "Allowed canonical IDs:\n"
      << "  antares.autotune                  Antares Auto-Tune\n"
      << "  resonantcavity.voloco-producer    Voloco Producer\n"
      << "  sixthsample.spoton                Spoton by Sixth Sample\n"
      << "  auburnsounds.graillon3            Graillon 3 by Auburn Sounds\n\n"
      << "The executable accepts no plugin or DLL path. It opens the default Windows "
         "console microphone and console output, processes only through the selected installed "
         "VST3, applies the MeeWav safety limiter, and stops on Ctrl+C. Probe-only validates and "
         "initializes the exact allowlisted VST3 without opening audio devices. With "
         "--control-stdin, the live route also stops when stdin receives `stop` or reaches EOF.\n";
}

Status parseCommandLine(const int argc, char** argv, CommandLine& commandLine) {
  for (int index = 1; index < argc; ++index) {
    const std::string_view argument(argv[index] == nullptr ? "" : argv[index]);
    if (argument == "--help" || argument == "-h") {
      commandLine.helpRequested = true;
      continue;
    }
    if (argument == "--confirm-headphones") {
      commandLine.headphonesConfirmed = true;
      continue;
    }
    if (argument == "--control-stdin") {
      commandLine.controlStdin = true;
      continue;
    }
    if (argument == "--probe-only") {
      commandLine.probeOnly = true;
      continue;
    }
    if (argument == "--plugin") {
      if (index + 1 >= argc || argv[index + 1] == nullptr || argv[index + 1][0] == '\0' ||
          !commandLine.canonicalPluginId.empty()) {
        return Status::failure(StatusCode::invalid_argument,
                               "--plugin requires exactly one canonical plugin ID.");
      }
      commandLine.canonicalPluginId = argv[++index];
      continue;
    }
    return Status::failure(StatusCode::invalid_argument,
                           "Unknown argument. Filesystem plugin paths are never accepted.");
  }

  if (commandLine.helpRequested) {
    return Status::success();
  }
  if (!isAllowedPluginId(commandLine.canonicalPluginId)) {
    return Status::failure(StatusCode::plugin_not_found,
                           "Choose an allowlisted canonical Antares, Voloco, Spoton or Graillon 3 "
                           "plugin ID.");
  }
  if (!commandLine.probeOnly && !commandLine.headphonesConfirmed) {
    return Status::failure(StatusCode::invalid_argument,
                           "Explicitly confirm headphones with --confirm-headphones.");
  }
  return Status::success();
}

bool isStopCommand(std::string_view command) {
  while (!command.empty() && std::isspace(static_cast<unsigned char>(command.front())) != 0) {
    command.remove_prefix(1);
  }
  while (!command.empty() && std::isspace(static_cast<unsigned char>(command.back())) != 0) {
    command.remove_suffix(1);
  }
  if (command.size() != 4) {
    return false;
  }
  constexpr std::string_view kStop = "stop";
  for (std::size_t index = 0; index < command.size(); ++index) {
    if (static_cast<char>(std::tolower(static_cast<unsigned char>(command[index]))) !=
        kStop[index]) {
      return false;
    }
  }
  return true;
}

std::string_view trimmed(std::string_view value) noexcept {
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.front())) != 0) {
    value.remove_prefix(1);
  }
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back())) != 0) {
    value.remove_suffix(1);
  }
  return value;
}

void applySetCommand(const std::string_view command, Vst3LiveProcessor& processor) {
  Vst3LiveControls controls;
  if (!meewav::audio::native_vst3_protocol::parseSetCommand(command, controls)) {
    std::osyncstream(std::cerr)
        << "Ignored invalid native control command; expected verified set fields.\n";
    return;
  }
  std::uint64_t requestedRevision = 0;
  const auto status = processor.updateControls(controls, &requestedRevision);
  if (!status.isOk()) {
    std::osyncstream(std::cerr) << "Native control update rejected: " << status.message << '\n';
    return;
  }
  while (!gStopRequested.load(std::memory_order_acquire) &&
         processor.appliedControlRevision() < requestedRevision) {
    Sleep(1);
  }
  if (processor.appliedControlRevision() < requestedRevision) {
    std::osyncstream(std::cerr)
        << "Native control update stopped before the VST3 consumed revision "
        << requestedRevision << ".\n";
    return;
  }
  std::osyncstream(std::cout) << "MEEWAV_AUDIO_CONTROL_APPLIED revision="
                              << requestedRevision << '\n'
                              << std::flush;
}

bool consumeControlCharacter(std::string& pending, const char character,
                             Vst3LiveProcessor& processor) {
  if (character == '\r' || character == '\n') {
    const bool shouldStop = isStopCommand(pending);
    if (!shouldStop && !trimmed(pending).empty()) {
      applySetCommand(pending, processor);
    }
    pending.clear();
    return shouldStop;
  }
  if (character == '\b') {
    if (!pending.empty()) {
      pending.pop_back();
    }
    return false;
  }
  if (static_cast<unsigned char>(character) >= 0x20 && pending.size() < 512) {
    pending.push_back(character);
  }
  return false;
}

void requestStdinControlledStop() noexcept {
  gStopRequested.store(true, std::memory_order_release);
}

void waitForConsoleControlInput(Vst3LiveProcessor& processor) {
  std::string pending;
  while (!gStopRequested.load(std::memory_order_acquire)) {
    if (_kbhit() == 0) {
      Sleep(10);
      continue;
    }
    const int input = _getwch();
    if (input == 0 || input == 0xE0) {
      if (_kbhit() != 0) {
        static_cast<void>(_getwch());
      }
      continue;
    }
    if (input == 0x1A ||
        consumeControlCharacter(pending, static_cast<char>(input), processor)) {
      requestStdinControlledStop();
      return;
    }
  }
}

void waitForPipeControlInput(const HANDLE inputHandle, Vst3LiveProcessor& processor) {
  std::string pending;
  std::array<char, 256> buffer{};
  while (!gStopRequested.load(std::memory_order_acquire)) {
    DWORD available = 0;
    if (!PeekNamedPipe(inputHandle, nullptr, 0, nullptr, &available, nullptr)) {
      requestStdinControlledStop();
      return;
    }
    if (available == 0) {
      Sleep(10);
      continue;
    }
    DWORD bytesRead = 0;
    const auto requested = std::min<DWORD>(available, static_cast<DWORD>(buffer.size()));
    if (!ReadFile(inputHandle, buffer.data(), requested, &bytesRead, nullptr) || bytesRead == 0) {
      requestStdinControlledStop();
      return;
    }
    for (DWORD index = 0; index < bytesRead; ++index) {
      if (consumeControlCharacter(pending, buffer[index], processor)) {
        requestStdinControlledStop();
        return;
      }
    }
  }
}

void waitForFileControlInput(const HANDLE inputHandle, Vst3LiveProcessor& processor) {
  std::string pending;
  std::array<char, 256> buffer{};
  while (!gStopRequested.load(std::memory_order_acquire)) {
    DWORD bytesRead = 0;
    if (!ReadFile(inputHandle, buffer.data(), static_cast<DWORD>(buffer.size()), &bytesRead,
                  nullptr) || bytesRead == 0) {
      requestStdinControlledStop();
      return;
    }
    for (DWORD index = 0; index < bytesRead; ++index) {
      if (consumeControlCharacter(pending, buffer[index], processor)) {
        requestStdinControlledStop();
        return;
      }
    }
  }
}

void stdinControlLoop(Vst3LiveProcessor& processor) {
  const HANDLE inputHandle = GetStdHandle(STD_INPUT_HANDLE);
  if (inputHandle == nullptr || inputHandle == INVALID_HANDLE_VALUE) {
    requestStdinControlledStop();
    return;
  }

  DWORD consoleMode = 0;
  if (GetConsoleMode(inputHandle, &consoleMode)) {
    waitForConsoleControlInput(processor);
    return;
  }
  if (GetFileType(inputHandle) == FILE_TYPE_PIPE) {
    waitForPipeControlInput(inputHandle, processor);
    return;
  }
  waitForFileControlInput(inputHandle, processor);
}

class ComApartment final {
 public:
  Status initialize() {
    const HRESULT result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (result == S_OK || result == S_FALSE) {
      initialized_ = true;
      return Status::success();
    }
    return Status::failure(StatusCode::internal_error,
                           "COM multithreaded apartment initialization failed.");
  }

  ~ComApartment() {
    if (initialized_) {
      CoUninitialize();
    }
  }

  ComApartment() = default;
  ComApartment(const ComApartment&) = delete;
  ComApartment& operator=(const ComApartment&) = delete;

 private:
  bool initialized_{false};
};

void printStatusFailure(const char* stage, const Status& status) {
  std::cerr << "MeeWav Audio Engine POC stopped at " << stage << ": " << status.message << '\n';
}

bool hasTelemetry(const meewav::audio::WasapiLiveTelemetry& telemetry) noexcept {
  return telemetry.capturedFrames > 0 || telemetry.processedFrames > 0 ||
         telemetry.renderRequestedFrames > 0 || telemetry.renderSuppliedFrames > 0;
}

void printTelemetry(const meewav::audio::WasapiLiveTelemetry& telemetry) {
  const auto fillPercent =
      telemetry.renderRequestedFrames == 0
          ? 0.0
          : (100.0 * static_cast<double>(telemetry.renderSuppliedFrames) /
             static_cast<double>(telemetry.renderRequestedFrames));
  std::osyncstream output(std::cout);
  output << std::fixed << std::setprecision(1) << "MEEWAV_AUDIO_TELEMETRY"
         << " input_frames=" << telemetry.capturedFrames
         << " processed_frames=" << telemetry.processedFrames
         << " output_frames=" << telemetry.renderSuppliedFrames
         << " endpoint_frames=" << telemetry.renderRequestedFrames
         << " render_fill_percent=" << fillPercent
         << " input_rms_dbfs=" << telemetry.inputRmsDbfs
         << " input_peak_dbfs=" << telemetry.inputPeakDbfs
         << " output_rms_dbfs=" << telemetry.outputRmsDbfs
         << " output_peak_dbfs=" << telemetry.outputPeakDbfs << '\n';
}

void telemetryLoop(meewav::audio::WasapiLiveMonitor& monitor,
                   const std::atomic_bool& stopRequested) {
  while (!stopRequested.load(std::memory_order_acquire)) {
    for (int tick = 0; tick < 20 && !stopRequested.load(std::memory_order_acquire); ++tick) {
      Sleep(50);
    }
    if (stopRequested.load(std::memory_order_acquire)) {
      break;
    }
    printTelemetry(monitor.consumeTelemetry());
  }
}

}  // namespace

int main(const int argc, char** argv) {
  SetConsoleOutputCP(CP_UTF8);

  CommandLine commandLine;
  const auto commandStatus = parseCommandLine(argc, argv, commandLine);
  if (!commandStatus.isOk()) {
    printStatusFailure("command-line validation", commandStatus);
    printUsage();
    return 2;
  }
  if (commandLine.helpRequested) {
    printUsage();
    return 0;
  }

  ComApartment comApartment;
  const auto comStatus = comApartment.initialize();
  if (!comStatus.isOk()) {
    printStatusFailure("COM initialization", comStatus);
    return 3;
  }

  if (!SetConsoleCtrlHandler(consoleControlHandler, TRUE)) {
    std::cerr << "MeeWav Audio Engine POC could not install the Ctrl+C handler.\n";
    return 4;
  }

  constexpr double kSampleRate = 48'000.0;
  constexpr std::uint32_t kMaximumFrames = 1'024;

  meewav::audio::Vst3LiveProcessor processor;
  const auto pluginStatus = processor.open(meewav::audio::Vst3LiveConfiguration{
      commandLine.canonicalPluginId, kSampleRate, kMaximumFrames});
  if (!pluginStatus.isOk()) {
    printStatusFailure("allowlisted VST3 initialization", pluginStatus);
    return 5;
  }

  const auto& plugin = processor.descriptor();
  std::cout << "Loaded installed allowlisted VST3:\n"
            << "  canonical ID: " << plugin.canonicalPluginId << '\n'
            << "  vendor: " << plugin.vendor << '\n'
            << "  name: " << plugin.name << '\n'
            << "  version: " << plugin.version << '\n'
            << "  class ID: " << plugin.classId << '\n'
            << "  buses: " << plugin.inputChannels << " in / " << plugin.outputChannels
            << " out\n"
            << "  declared plugin latency: " << plugin.latencySamples << " samples\n";

  if (commandLine.probeOnly) {
    std::cout << "Probe-only validation passed; no microphone or output device was opened.\n";
    SetConsoleCtrlHandler(consoleControlHandler, FALSE);
    return 0;
  }

  meewav::audio::WasapiLiveMonitor monitor;
  const auto deviceStatus = monitor.open(
      processor,
      meewav::audio::WasapiLiveConfiguration{kSampleRate, kMaximumFrames,
                                              kMaximumFrames * 4U,
                                              commandLine.headphonesConfirmed});
  if (!deviceStatus.isOk()) {
    printStatusFailure("WASAPI device initialization", deviceStatus);
    return 6;
  }

  const auto openedSnapshot = monitor.snapshot();
  std::cout << "Live route opened (no raw-micro parallel route):\n"
            << "  capture: " << openedSnapshot.captureDeviceName << '\n'
            << "  render: " << openedSnapshot.renderDeviceName << '\n'
            << "  capture buffer: " << openedSnapshot.captureBufferFrames << " frames\n"
            << "  render buffer: " << openedSnapshot.renderBufferFrames << " frames\n"
            << "  capture engine period: " << openedSnapshot.capturePeriodFrames
            << " frames ("
            << (openedSnapshot.captureLowLatencySharedMode ? "IAudioClient3 low-latency"
                                                           : "legacy shared-mode fallback")
            << "; " << openedSnapshot.captureInitializationDetail << ")\n"
            << "  render engine period: " << openedSnapshot.renderPeriodFrames
            << " frames ("
            << (openedSnapshot.renderLowLatencySharedMode ? "IAudioClient3 low-latency"
                                                          : "legacy shared-mode fallback")
            << "; " << openedSnapshot.renderInitializationDetail << ")\n"
            << "  reported latency: "
            << openedSnapshot.captureLatencyMs + openedSnapshot.renderLatencyMs +
                   openedSnapshot.pluginLatencyMs
            << " ms\n"
            << "MEEWAV_WASAPI_MODE capture="
            << meewav::audio::wasapiSharedModeDiagnosticToken(
                   openedSnapshot.captureLowLatencySharedMode)
            << " render="
            << meewav::audio::wasapiSharedModeDiagnosticToken(
                   openedSnapshot.renderLowLatencySharedMode)
            << " capture_period_frames=" << openedSnapshot.capturePeriodFrames
            << " render_period_frames=" << openedSnapshot.renderPeriodFrames
            << " capture_buffer_frames=" << openedSnapshot.captureBufferFrames
            << " render_buffer_frames=" << openedSnapshot.renderBufferFrames << '\n';

  const auto startStatus = monitor.start();
  if (!startStatus.isOk()) {
    printStatusFailure("WASAPI stream start", startStatus);
    return 7;
  }

  std::thread stdinControlThread;
  if (commandLine.controlStdin) {
    stdinControlThread = std::thread(stdinControlLoop, std::ref(processor));
    // This marker is a control-plane contract. It must only be emitted after
    // both WASAPI streams have started successfully.
    std::cout << "MEEWAV_AUDIO_CONTROL_READY\n"
              << "Send `set bypass=<0|1> input_gain=<0..1> key=<0..11> scale=<0..7> amount=<0..1> "
                 "retune=<0..1> humanize=<0..1> reverb_enabled=<0|1> reverb_mix=<0..1> "
                 "reverb_type=<room|plate|hall> reverb_duration=<0.2..5> "
                 "reverb_predelay_ms=<0..180>` or `stop` on stdin. Ctrl+C remains available.\n"
              << std::flush;
  } else {
    std::cout << "Press Ctrl+C to stop.\n" << std::flush;
  }

  std::atomic_bool telemetryStopRequested{false};
  std::thread telemetryThread(telemetryLoop, std::ref(monitor),
                              std::cref(telemetryStopRequested));
  const auto runStatus = monitor.run(gStopRequested);
  gStopRequested.store(true, std::memory_order_release);
  telemetryStopRequested.store(true, std::memory_order_release);
  if (telemetryThread.joinable()) {
    telemetryThread.join();
  }
  const auto trailingTelemetry = monitor.consumeTelemetry();
  if (hasTelemetry(trailingTelemetry)) {
    printTelemetry(trailingTelemetry);
  }
  if (stdinControlThread.joinable()) {
    stdinControlThread.join();
  }
  const auto finalSnapshot = monitor.snapshot();
  if (!runStatus.isOk()) {
    printStatusFailure("live processing", runStatus);
  }
  std::cout << "Session diagnostics:\n"
            << "  capture discontinuities: " << finalSnapshot.captureDiscontinuities << '\n'
            << "  render underruns: " << finalSnapshot.renderUnderruns << '\n'
            << "  ring overruns: " << finalSnapshot.ringOverruns << '\n';

  SetConsoleCtrlHandler(consoleControlHandler, FALSE);
  return runStatus.isOk() ? 0 : 7;
}
