#include "poc/windows/WasapiLiveMonitor.h"
#include "poc/windows/RealtimeAudioTelemetry.h"
#include "poc/windows/WasapiSharedPeriod.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <audioclient.h>
#include <avrt.h>
#include <propkeydef.h>
#include <functiondiscoverykeys_devpkey.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <windows.h>
#include <wrl/client.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace meewav::audio {
namespace {

using Microsoft::WRL::ComPtr;

// InitializeSharedAudioStream officially accepts EVENTCALLBACK only. Format
// conversion flags remain exclusive to the legacy IAudioClient::Initialize
// fallback below.
constexpr DWORD kLowLatencyStreamFlags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
constexpr DWORD kLegacyStreamFlags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                                     AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                                     AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY |
                                     AUDCLNT_STREAMFLAGS_NOPERSIST;
constexpr std::uint32_t kMinimumLiveRingTargetFrames = 128;

std::uint32_t referenceTimeToFrames(const REFERENCE_TIME duration,
                                    const double sampleRate) noexcept {
  if (duration <= 0 || sampleRate <= 0.0) {
    return 0;
  }
  constexpr double kReferenceTimesPerSecond = 10'000'000.0;
  return static_cast<std::uint32_t>(
      ((static_cast<double>(duration) * sampleRate) / kReferenceTimesPerSecond) + 0.5);
}

Status hresultFailure(const StatusCode code, const char* operation, const HRESULT result) {
  return Status::failure(code, std::string(operation) + " failed with HRESULT " +
                                   std::to_string(static_cast<std::int64_t>(result)) + ".");
}

WAVEFORMATEX makeFloatFormat(const WORD channelCount, const DWORD sampleRate) {
  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  format.nChannels = channelCount;
  format.nSamplesPerSec = sampleRate;
  format.wBitsPerSample = 32;
  format.nBlockAlign = static_cast<WORD>(channelCount * sizeof(float));
  format.nAvgBytesPerSec = sampleRate * format.nBlockAlign;
  format.cbSize = 0;
  return format;
}

std::string wideToUtf8(const wchar_t* value) {
  if (value == nullptr || value[0] == L'\0') {
    return {};
  }
  const int required = WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
  if (required <= 1) {
    return {};
  }
  std::string result(static_cast<std::size_t>(required), '\0');
  if (WideCharToMultiByte(CP_UTF8, 0, value, -1, result.data(), required, nullptr, nullptr) == 0) {
    return {};
  }
  result.pop_back();
  return result;
}

std::string deviceFriendlyName(IMMDevice& device) {
  ComPtr<IPropertyStore> properties;
  if (FAILED(device.OpenPropertyStore(STGM_READ, &properties))) {
    return "Périphérique audio Windows";
  }
  PROPVARIANT value;
  PropVariantInit(&value);
  std::string result = "Périphérique audio Windows";
  if (SUCCEEDED(properties->GetValue(PKEY_Device_FriendlyName, &value)) &&
      value.vt == VT_LPWSTR) {
    const auto converted = wideToUtf8(value.pwszVal);
    if (!converted.empty()) {
      result = converted;
    }
  }
  PropVariantClear(&value);
  return result;
}

class StereoRingBuffer final {
 public:
  explicit StereoRingBuffer(const std::uint32_t capacityFrames)
      : samples_(static_cast<std::size_t>(capacityFrames) * 2U, 0.0F),
        capacityFrames_(capacityFrames) {}

  [[nodiscard]] bool pushLatest(const float* interleavedStereo,
                                const std::uint32_t frames) noexcept {
    if (interleavedStereo == nullptr || frames > capacityFrames_) {
      return false;
    }

    bool discardedStaleAudio = false;
    const auto availableFrames = capacityFrames_ - sizeFrames_;
    if (frames > availableFrames) {
      const auto framesToDiscard = frames - availableFrames;
      readFrame_ = (readFrame_ + framesToDiscard) % capacityFrames_;
      sizeFrames_ -= framesToDiscard;
      discardedStaleAudio = true;
    }
    for (std::uint32_t frame = 0; frame < frames; ++frame) {
      const auto destination = static_cast<std::size_t>(writeFrame_) * 2U;
      const auto source = static_cast<std::size_t>(frame) * 2U;
      samples_[destination] = interleavedStereo[source];
      samples_[destination + 1U] = interleavedStereo[source + 1U];
      writeFrame_ = (writeFrame_ + 1U) % capacityFrames_;
    }
    sizeFrames_ += frames;
    return !discardedStaleAudio;
  }

  [[nodiscard]] std::uint32_t pop(float* interleavedStereo,
                                  const std::uint32_t requestedFrames) noexcept {
    if (interleavedStereo == nullptr) {
      return 0;
    }
    const auto frames = std::min(requestedFrames, sizeFrames_);
    for (std::uint32_t frame = 0; frame < frames; ++frame) {
      const auto source = static_cast<std::size_t>(readFrame_) * 2U;
      const auto destination = static_cast<std::size_t>(frame) * 2U;
      interleavedStereo[destination] = samples_[source];
      interleavedStereo[destination + 1U] = samples_[source + 1U];
      readFrame_ = (readFrame_ + 1U) % capacityFrames_;
    }
    sizeFrames_ -= frames;
    return frames;
  }

  [[nodiscard]] std::uint32_t keepLatest(
      const std::uint32_t maximumFrames) noexcept {
    if (sizeFrames_ <= maximumFrames) {
      return 0;
    }
    const auto discardedFrames = sizeFrames_ - maximumFrames;
    readFrame_ = (readFrame_ + discardedFrames) % capacityFrames_;
    sizeFrames_ = maximumFrames;
    return discardedFrames;
  }

 private:
  std::vector<float> samples_;
  std::uint32_t capacityFrames_{0};
  std::uint32_t readFrame_{0};
  std::uint32_t writeFrame_{0};
  std::uint32_t sizeFrames_{0};
};

}  // namespace

struct WasapiLiveMonitor::Impl final {
  ComPtr<IMMDeviceEnumerator> enumerator;
  ComPtr<IMMDevice> captureDevice;
  ComPtr<IMMDevice> renderDevice;
  ComPtr<IAudioClient> captureAudioClient;
  ComPtr<IAudioClient> renderAudioClient;
  ComPtr<IAudioCaptureClient> captureClient;
  ComPtr<IAudioRenderClient> renderClient;
  HANDLE captureEvent{nullptr};
  HANDLE renderEvent{nullptr};
  WAVEFORMATEX captureFormat{};
  WAVEFORMATEX renderFormat{};
  std::unique_ptr<StereoRingBuffer> ring;
  std::vector<float> monoScratch;
  std::vector<float> processedScratch;
  Vst3LiveProcessor* processor{nullptr};
  WasapiLiveConfiguration configuration{};
  WasapiLiveSnapshot snapshot{};
  std::atomic<std::uint64_t> capturedFrames{0};
  std::atomic<std::uint64_t> processedFrames{0};
  std::atomic<std::uint64_t> renderRequestedFrames{0};
  std::atomic<std::uint64_t> renderSuppliedFrames{0};
  RealtimeLevelWindow inputLevels;
  RealtimeLevelWindow outputLevels;
  bool opened{false};
  bool started{false};
  std::uint32_t liveRingTargetFrames{kMinimumLiveRingTargetFrames};

  Status activateAudioClient(IMMDevice& device, ComPtr<IAudioClient>& audioClient) {
    const auto result = device.Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                        reinterpret_cast<void**>(audioClient.GetAddressOf()));
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "IAudioClient activation", result);
    }
    return Status::success();
  }

  bool initializeLowLatencySharedMode(IAudioClient& audioClient,
                                      const WAVEFORMATEX& format,
                                      std::uint32_t& selectedPeriodFrames,
                                      std::string& initializationDetail) {
    ComPtr<IAudioClient3> audioClient3;
    if (FAILED(audioClient.QueryInterface(IID_PPV_ARGS(&audioClient3)))) {
      initializationDetail = "IAudioClient3 unavailable";
      return false;
    }

    AudioClientProperties properties{};
    properties.cbSize = sizeof(properties);
    properties.bIsOffload = FALSE;
    properties.eCategory = AudioCategory_Media;
    properties.Options = AUDCLNT_STREAMOPTIONS_NONE;
    if (FAILED(audioClient3->SetClientProperties(&properties))) {
      initializationDetail = "low-latency client properties rejected";
      return false;
    }

    WAVEFORMATEX* closestFormat = nullptr;
    const auto formatResult = audioClient3->IsFormatSupported(
        AUDCLNT_SHAREMODE_SHARED, &format, &closestFormat);
    CoTaskMemFree(closestFormat);
    if (formatResult != S_OK) {
      // The low-latency API does not accept AUTOCONVERTPCM. Keep the DSP at
      // exactly 48 kHz float mono/stereo and let the proven legacy path perform
      // endpoint conversion instead of feeding the VST3 an incompatible rate.
      initializationDetail = "exact 48 kHz float channel format unsupported";
      return false;
    }

    WasapiSharedPeriodRange periods{};
    const auto periodResult = audioClient3->GetSharedModeEnginePeriod(
        &format, &periods.defaultFrames, &periods.fundamentalFrames,
        &periods.minimumFrames, &periods.maximumFrames);
    if (FAILED(periodResult)) {
      initializationDetail = "shared engine period query failed";
      return false;
    }

    selectedPeriodFrames = chooseMinimumSharedPeriodFrames(periods);
    if (selectedPeriodFrames == 0) {
      initializationDetail = "shared engine returned an invalid period range";
      return false;
    }

    const auto initializeResult = audioClient3->InitializeSharedAudioStream(
        kLowLatencyStreamFlags, selectedPeriodFrames, &format, nullptr);
    if (FAILED(initializeResult)) {
      selectedPeriodFrames = 0;
      initializationDetail = "minimum-period shared stream initialization failed";
      return false;
    }

    WAVEFORMATEX* currentFormat = nullptr;
    UINT32 currentPeriodFrames = 0;
    if (SUCCEEDED(audioClient3->GetCurrentSharedModeEnginePeriod(
            &currentFormat, &currentPeriodFrames)) &&
        currentPeriodFrames > 0) {
      selectedPeriodFrames = currentPeriodFrames;
    }
    CoTaskMemFree(currentFormat);
    initializationDetail = "exact 48 kHz format, minimum shared engine period";
    return true;
  }

  Status initializeEndpoint(IMMDevice& device, const bool capture) {
    auto& audioClient = capture ? captureAudioClient : renderAudioClient;
    auto activationStatus = activateAudioClient(device, audioClient);
    if (!activationStatus.isOk()) {
      return activationStatus;
    }

    auto& format = capture ? captureFormat : renderFormat;
    // Most Windows shared-mode capture engines expose their minimum
    // IAudioClient3 period for the endpoint's stereo 48 kHz mix format, not for
    // an application-requested mono stream. Keep both endpoints stereo so the
    // low-latency path can be selected, then downmix the capture packet before
    // feeding the mono vocal plug-in.
    format = makeFloatFormat(2, static_cast<DWORD>(configuration.sampleRate));

    std::uint32_t selectedPeriodFrames = 0;
    std::string initializationDetail;
    bool lowLatencySharedMode =
        initializeLowLatencySharedMode(*audioClient.Get(), format, selectedPeriodFrames,
                                       initializationDetail);
    if (!lowLatencySharedMode) {
      // InitializeSharedAudioStream can fail after touching the client. Reactivate
      // a clean IAudioClient before invoking the legacy shared-mode path; retrying
      // Initialize on the same COM object is not a supported recovery strategy.
      audioClient.Reset();
      activationStatus = activateAudioClient(device, audioClient);
      if (!activationStatus.isOk()) {
        return activationStatus;
      }
      const auto initializeResult = audioClient->Initialize(
          AUDCLNT_SHAREMODE_SHARED, kLegacyStreamFlags, 0, 0, &format, nullptr);
      if (FAILED(initializeResult)) {
        return hresultFailure(StatusCode::device_unavailable,
                              capture ? "WASAPI capture initialization"
                                      : "WASAPI render initialization",
                              initializeResult);
      }

      REFERENCE_TIME defaultPeriod = 0;
      REFERENCE_TIME minimumPeriod = 0;
      if (SUCCEEDED(audioClient->GetDevicePeriod(&defaultPeriod, &minimumPeriod))) {
        selectedPeriodFrames = referenceTimeToFrames(defaultPeriod, configuration.sampleRate);
      }
    }

    HANDLE& eventHandle = capture ? captureEvent : renderEvent;
    eventHandle = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (eventHandle == nullptr) {
      return hresultFailure(StatusCode::io_error, "CreateEventW", HRESULT_FROM_WIN32(GetLastError()));
    }
    auto result = audioClient->SetEventHandle(eventHandle);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "WASAPI event registration", result);
    }

    UINT32 bufferFrames = 0;
    result = audioClient->GetBufferSize(&bufferFrames);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "WASAPI buffer query", result);
    }
    if (capture) {
      snapshot.captureBufferFrames = bufferFrames;
      snapshot.capturePeriodFrames = selectedPeriodFrames;
      snapshot.captureLowLatencySharedMode = lowLatencySharedMode;
      snapshot.captureInitializationDetail = std::move(initializationDetail);
      REFERENCE_TIME latency = 0;
      if (SUCCEEDED(audioClient->GetStreamLatency(&latency))) {
        snapshot.captureLatencyMs = static_cast<double>(latency) / 10'000.0;
      }
      result = audioClient->GetService(__uuidof(IAudioCaptureClient),
                                       reinterpret_cast<void**>(captureClient.GetAddressOf()));
    } else {
      snapshot.renderBufferFrames = bufferFrames;
      snapshot.renderPeriodFrames = selectedPeriodFrames;
      snapshot.renderLowLatencySharedMode = lowLatencySharedMode;
      snapshot.renderInitializationDetail = std::move(initializationDetail);
      REFERENCE_TIME latency = 0;
      if (SUCCEEDED(audioClient->GetStreamLatency(&latency))) {
        snapshot.renderLatencyMs = static_cast<double>(latency) / 10'000.0;
      }
      result = audioClient->GetService(__uuidof(IAudioRenderClient),
                                       reinterpret_cast<void**>(renderClient.GetAddressOf()));
    }
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "WASAPI service query", result);
    }
    return Status::success();
  }

  Status startStreams() {
    BYTE* initialRender = nullptr;
    auto result = renderClient->GetBuffer(snapshot.renderBufferFrames, &initialRender);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "WASAPI render prefill", result);
    }
    result = renderClient->ReleaseBuffer(snapshot.renderBufferFrames,
                                         AUDCLNT_BUFFERFLAGS_SILENT);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "WASAPI render prefill release",
                            result);
    }
    result = renderAudioClient->Start();
    if (FAILED(result)) {
      return hresultFailure(StatusCode::device_unavailable, "WASAPI render start", result);
    }
    result = captureAudioClient->Start();
    if (FAILED(result)) {
      renderAudioClient->Stop();
      return hresultFailure(StatusCode::device_unavailable, "WASAPI capture start", result);
    }
    started = true;
    return Status::success();
  }

  Status drainCapture() noexcept {
    UINT32 packetFrames = 0;
    auto result = captureClient->GetNextPacketSize(&packetFrames);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::io_error, "WASAPI capture packet query", result);
    }
    // Release every packet exposed by WASAPI during this wake. Leaving old
    // packets queued in the endpoint would create latency before our own
    // bounded live ring can discard stale audio.
    while (packetFrames > 0) {
      BYTE* packetData = nullptr;
      DWORD flags = 0;
      UINT32 frames = 0;
      result = captureClient->GetBuffer(&packetData, &frames, &flags, nullptr, nullptr);
      if (FAILED(result)) {
        return hresultFailure(StatusCode::io_error, "WASAPI capture buffer", result);
      }
      if ((flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0) {
        ++snapshot.captureDiscontinuities;
      }
      capturedFrames.fetch_add(frames, std::memory_order_relaxed);

      const auto* captured = reinterpret_cast<const float*>(packetData);
      std::uint32_t offset = 0;
      while (offset < frames) {
        const auto blockFrames =
            std::min(configuration.maximumPluginFrames, frames - offset);
        if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0 || captured == nullptr) {
          std::fill_n(monoScratch.data(), blockFrames, 0.0F);
        } else {
          for (std::uint32_t frame = 0; frame < blockFrames; ++frame) {
            const auto sourceFrame = static_cast<std::size_t>(offset + frame) * 2U;
            monoScratch[frame] =
                0.5F * (captured[sourceFrame] + captured[sourceFrame + 1U]);
          }
        }
        inputLevels.add(monoScratch.data(), blockFrames);
        if (!processor->processMonoToStereo(monoScratch.data(), blockFrames,
                                            processedScratch.data())) {
          captureClient->ReleaseBuffer(frames);
          return Status::failure(StatusCode::internal_error,
                                 "VST3 processing failed; raw microphone was not substituted.");
        }
        processedFrames.fetch_add(blockFrames, std::memory_order_relaxed);
        // A saturated live monitor must keep the newest voice instead of
        // accumulating stale audio that is heard seconds later.
        if (!ring->pushLatest(processedScratch.data(), blockFrames)) {
          ++snapshot.ringOverruns;
        }
        offset += blockFrames;
      }
      result = captureClient->ReleaseBuffer(frames);
      if (FAILED(result)) {
        return hresultFailure(StatusCode::io_error, "WASAPI capture release", result);
      }
      if (ring->keepLatest(liveRingTargetFrames) > 0) {
        ++snapshot.ringOverruns;
      }
      result = captureClient->GetNextPacketSize(&packetFrames);
      if (FAILED(result)) {
        return hresultFailure(StatusCode::io_error, "WASAPI capture packet query", result);
      }
    }
    return Status::success();
  }

  Status fillRender() noexcept {
    UINT32 padding = 0;
    auto result = renderAudioClient->GetCurrentPadding(&padding);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::io_error, "WASAPI render padding query", result);
    }
    if (padding >= snapshot.renderBufferFrames) {
      return Status::success();
    }
    const auto requestedFrames = snapshot.renderBufferFrames - padding;
    renderRequestedFrames.fetch_add(requestedFrames, std::memory_order_relaxed);
    BYTE* renderData = nullptr;
    result = renderClient->GetBuffer(requestedFrames, &renderData);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::io_error, "WASAPI render buffer", result);
    }
    auto* output = reinterpret_cast<float*>(renderData);
    const auto suppliedFrames = ring->pop(output, requestedFrames);
    renderSuppliedFrames.fetch_add(suppliedFrames, std::memory_order_relaxed);
    if (suppliedFrames < requestedFrames) {
      std::fill(output + (static_cast<std::size_t>(suppliedFrames) * 2U),
                output + (static_cast<std::size_t>(requestedFrames) * 2U), 0.0F);
      ++snapshot.renderUnderruns;
    }
    outputLevels.add(output, requestedFrames * 2U);
    result = renderClient->ReleaseBuffer(requestedFrames, 0);
    if (FAILED(result)) {
      return hresultFailure(StatusCode::io_error, "WASAPI render release", result);
    }
    return Status::success();
  }

  void shutdown() noexcept {
    if (started) {
      captureAudioClient->Stop();
      renderAudioClient->Stop();
    }
    started = false;
    captureClient.Reset();
    renderClient.Reset();
    captureAudioClient.Reset();
    renderAudioClient.Reset();
    captureDevice.Reset();
    renderDevice.Reset();
    enumerator.Reset();
    if (captureEvent != nullptr) {
      CloseHandle(captureEvent);
      captureEvent = nullptr;
    }
    if (renderEvent != nullptr) {
      CloseHandle(renderEvent);
      renderEvent = nullptr;
    }
    ring.reset();
    monoScratch.clear();
    processedScratch.clear();
    processor = nullptr;
    opened = false;
  }
};

WasapiLiveMonitor::WasapiLiveMonitor() : impl_(std::make_unique<Impl>()) {}

WasapiLiveMonitor::~WasapiLiveMonitor() { close(); }

Status WasapiLiveMonitor::open(Vst3LiveProcessor& processor,
                               const WasapiLiveConfiguration& configuration) {
  close();
  if (!configuration.headphonesExplicitlyConfirmed) {
    return Status::failure(StatusCode::invalid_argument,
                           "Headphones must be explicitly confirmed to reduce feedback risk.");
  }
  if (!processor.isOpen() || configuration.sampleRate != 48'000.0 ||
      configuration.maximumPluginFrames == 0 ||
      configuration.ringBufferFrames < configuration.maximumPluginFrames * 4U) {
    return Status::failure(StatusCode::invalid_argument,
                           "Processor or WASAPI live configuration is invalid.");
  }

  impl_->configuration = configuration;
  impl_->processor = &processor;
  impl_->snapshot = {};
  impl_->snapshot.pluginLatencyMs =
      (static_cast<double>(processor.descriptor().latencySamples) / configuration.sampleRate) *
      1000.0;
  impl_->ring = std::make_unique<StereoRingBuffer>(configuration.ringBufferFrames);
  impl_->monoScratch.resize(configuration.maximumPluginFrames);
  impl_->processedScratch.resize(static_cast<std::size_t>(configuration.maximumPluginFrames) * 2U);
  impl_->capturedFrames.store(0, std::memory_order_relaxed);
  impl_->processedFrames.store(0, std::memory_order_relaxed);
  impl_->renderRequestedFrames.store(0, std::memory_order_relaxed);
  impl_->renderSuppliedFrames.store(0, std::memory_order_relaxed);
  impl_->inputLevels.reset();
  impl_->outputLevels.reset();

  auto result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                 __uuidof(IMMDeviceEnumerator),
                                 reinterpret_cast<void**>(impl_->enumerator.GetAddressOf()));
  if (FAILED(result)) {
    close();
    return hresultFailure(StatusCode::device_unavailable, "MMDeviceEnumerator", result);
  }
  // Use the same Windows default-device role as ordinary interactive/browser
  // playback. Mixing communications capture with multimedia render can select
  // two unrelated physical devices and produce an apparently silent route.
  result = impl_->enumerator->GetDefaultAudioEndpoint(eCapture, eConsole,
                                                       &impl_->captureDevice);
  if (FAILED(result)) {
    close();
    return hresultFailure(StatusCode::device_unavailable, "Default capture endpoint", result);
  }
  result = impl_->enumerator->GetDefaultAudioEndpoint(eRender, eConsole,
                                                       &impl_->renderDevice);
  if (FAILED(result)) {
    close();
    return hresultFailure(StatusCode::device_unavailable, "Default render endpoint", result);
  }
  impl_->snapshot.captureDeviceName = deviceFriendlyName(*impl_->captureDevice.Get());
  impl_->snapshot.renderDeviceName = deviceFriendlyName(*impl_->renderDevice.Get());

  const auto captureStatus = impl_->initializeEndpoint(*impl_->captureDevice.Get(), true);
  if (!captureStatus.isOk()) {
    close();
    return captureStatus;
  }
  const auto renderStatus = impl_->initializeEndpoint(*impl_->renderDevice.Get(), false);
  if (!renderStatus.isOk()) {
    close();
    return renderStatus;
  }
  const auto longestEndpointPeriod = std::max(
      impl_->snapshot.capturePeriodFrames, impl_->snapshot.renderPeriodFrames);
  impl_->liveRingTargetFrames = std::clamp(
      longestEndpointPeriod > 0 ? longestEndpointPeriod * 2U
                                : kMinimumLiveRingTargetFrames,
      kMinimumLiveRingTargetFrames, configuration.ringBufferFrames);
  impl_->opened = true;
  return Status::success();
}

Status WasapiLiveMonitor::start() {
  if (!impl_->opened || impl_->captureEvent == nullptr || impl_->renderEvent == nullptr) {
    return Status::failure(StatusCode::invalid_argument, "Open the WASAPI monitor before starting.");
  }
  if (impl_->started) {
    return Status::failure(StatusCode::invalid_argument, "The WASAPI monitor is already started.");
  }
  return impl_->startStreams();
}

Status WasapiLiveMonitor::run(const std::atomic_bool& stopRequested) {
  if (!impl_->opened || !impl_->started || impl_->captureEvent == nullptr ||
      impl_->renderEvent == nullptr) {
    return Status::failure(StatusCode::invalid_argument,
                           "Start the WASAPI monitor before running.");
  }

  DWORD taskIndex = 0;
  HANDLE mmcssHandle = AvSetMmThreadCharacteristicsW(L"Pro Audio", &taskIndex);

  // Keep render first in the wait array so its event is observed promptly, but
  // opportunistically drain capture before filling render on either wake. If
  // both endpoints are ready, this lets the freshly processed block meet the
  // current render request instead of waiting for another full engine period.
  const HANDLE events[] = {impl_->renderEvent, impl_->captureEvent};
  while (!stopRequested.load(std::memory_order_acquire)) {
    const DWORD signaled = WaitForMultipleObjects(2, events, FALSE, 50);
    Status status = Status::success();
    if (signaled == WAIT_OBJECT_0 || signaled == WAIT_OBJECT_0 + 1U) {
      status = impl_->drainCapture();
      if (status.isOk()) {
        status = impl_->fillRender();
      }
    } else if (signaled != WAIT_TIMEOUT) {
      status = hresultFailure(StatusCode::io_error, "WASAPI event wait",
                              HRESULT_FROM_WIN32(GetLastError()));
    }
    if (!status.isOk()) {
      if (mmcssHandle != nullptr) {
        AvRevertMmThreadCharacteristics(mmcssHandle);
      }
      impl_->shutdown();
      return status;
    }
  }

  if (mmcssHandle != nullptr) {
    AvRevertMmThreadCharacteristics(mmcssHandle);
  }
  impl_->shutdown();
  return Status::success();
}

void WasapiLiveMonitor::close() noexcept { impl_->shutdown(); }

const WasapiLiveSnapshot& WasapiLiveMonitor::snapshot() const noexcept { return impl_->snapshot; }

WasapiLiveTelemetry WasapiLiveMonitor::consumeTelemetry() noexcept {
  const auto input = impl_->inputLevels.consume();
  const auto output = impl_->outputLevels.consume();
  return WasapiLiveTelemetry{
      impl_->capturedFrames.exchange(0, std::memory_order_acq_rel),
      impl_->processedFrames.exchange(0, std::memory_order_acq_rel),
      impl_->renderRequestedFrames.exchange(0, std::memory_order_acq_rel),
      impl_->renderSuppliedFrames.exchange(0, std::memory_order_acq_rel),
      linearLevelToDbfs(input.peakLinear),
      linearLevelToDbfs(input.rmsLinear),
      linearLevelToDbfs(output.peakLinear),
      linearLevelToDbfs(output.rmsLinear)};
}

}  // namespace meewav::audio
