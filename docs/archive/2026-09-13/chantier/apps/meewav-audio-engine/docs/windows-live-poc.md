# Windows live VST3 monitoring POC

Status: **Release compilation validated; the companion offline VST3 probe succeeded, but this live
microphone/headphone executable has not been run.** This target is a manual engineering go/no-go
tool, not the Room engine shipped to artists.

## Real signal path

With `MEEWAV_AUDIO_WITH_VST3_SDK=ON`, `meewav-vst3-live-poc` builds this one-way route:

```text
default console microphone
  -> event-driven shared-mode WASAPI capture (48 kHz Float32 mono)
  -> installed allowlisted VST3 IAudioProcessor
  -> MeeWav -1 dB safety clipper
  -> preallocated stereo ring buffer
  -> default console output via event-driven shared-mode WASAPI render (48 kHz Float32 stereo)
```

The audio loop is assigned to Windows' `Pro Audio` MMCSS category when available. MeeWav-side
buffers, VST3 process buffers and the ring are allocated before streaming. The normal audio loop
does not access the filesystem, JSON, network or UI and does not log. Lock-free counters collect
input/output frames and levels; a separate diagnostics thread publishes one
`MEEWAV_AUDIO_TELEMETRY` line per second so a muted input, a silent plugin output and an empty
render ring can be distinguished without logging from the audio thread.

The zero duration/period values and event-handle registration follow Microsoft's shared-mode
event-driven [`IAudioClient::Initialize` contract](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-initialize)
and its [capture sample guidance](https://learn.microsoft.com/en-us/windows/win32/coreaudio/capturesharedeventdriven).

This is actual SDK processing, not a state-toggle simulation: each captured block is copied into
the VST3 input bus, `IAudioProcessor::process` is called in realtime mode, the returned audio is
checked for finite samples, limited and written to the render ring. Plugin-declared latency and
WASAPI stream latencies are reported by the process.

## Fail-closed invariants

- The command line accepts a canonical ID only: `antares.autotune`,
  `resonantcavity.voloco-producer`, `sixthsample.spoton` or
  `auburnsounds.graillon3`.
- It accepts no VST3, DLL, bundle or arbitrary filesystem path.
- Module discovery is restricted to Steinberg's operating-system standard VST3 locations.
- Both path family and factory vendor/name metadata must match the requested family.
- Missing, incompatible, uninstantiable or failing plugins stop the route. Vendor activation state
  is not queried explicitly; an activation problem is detected only if the plugin refuses to
  instantiate or process.
- A VST3 processing error stops capture/render; the microphone is never copied around the plugin.
- Ring underrun produces silence. Ring overrun drops processed audio. Neither condition substitutes
  raw microphone audio.
- Monitoring requires explicit `--confirm-headphones` acknowledgement.
- Vendor activation, iLok and licensing are not modified or bypassed.

## Build without running

```powershell
cmake -S apps/meewav-audio-engine -B apps/meewav-audio-engine/build-vst3-poc `
  -G "Visual Studio 18 2026" -A x64 `
  -DMEEWAV_AUDIO_WITH_VST3_SDK=ON `
  -DMEEWAV_VST3_SDK_DIR=C:\approved\vst3sdk

cmake --build apps/meewav-audio-engine/build-vst3-poc `
  --config Release --target meewav-vst3-live-poc
```

The Steinberg SDK is supplied as an approved external source tree; it is not vendored here.

## Device-free identity probe

The live executable can exercise its stricter bundle/vendor/name/class-ID matcher without opening
the microphone or output device:

```powershell
.\apps\meewav-audio-engine\build-vst3-poc\Release\meewav-vst3-live-poc.exe `
  --plugin sixthsample.spoton --probe-only

.\apps\meewav-audio-engine\build-vst3-poc\Release\meewav-vst3-live-poc.exe `
  --plugin auburnsounds.graillon3 --probe-only
```

Both commands passed on the Windows x64 laboratory machine. Probe-only initialization does not
constitute a microphone, listening, stability or Room-publication test.

## Manual invocation after explicit approval

```powershell
.\apps\meewav-audio-engine\build-vst3-poc\Release\meewav-vst3-live-poc.exe `
  --plugin antares.autotune `
  --confirm-headphones
```

Use `sixthsample.spoton` or `auburnsounds.graillon3` for the signed local installations verified on
the Windows laboratory machine, or `resonantcavity.voloco-producer` for a legally installed and
activated Voloco build. Stop with Ctrl+C. Starting this process may invoke vendor activation and
produce audible feedback if the output is not really headphones; it must not be automated in CI.

The internal `/labs/correction-vocale` page can now start and stop the installed Spoton or Graillon
POC while `npm run dev:audio-lab` is running. The browser must confirm a wired headset explicitly.
The loopback-only Vite launcher accepts canonical allowlisted IDs rather than filesystem paths,
releases the Web microphone graph first, passes `--control-stdin`, and waits for
`MEEWAV_AUDIO_CONTROL_READY` before reporting that monitoring is active. The executable then stops
gracefully when the launcher writes `stop` to stdin. This is a local development convenience only;
it is not the production Audio Bridge and does not publish audio into a Room.

## Honest limitations before Phase 1 can pass

- The companion offline probe instantiated Auto-Key 2 and Auto-Tune Pro 11.0.0 and processed one
  synthetic block through each target. Auto-Tune exposed 182 parameters and reported 2,670 latency
  samples at 48 kHz. It also matched and instantiated Spoton 1.1.2 by exact Sixth Sample class ID,
  and Graillon 3.2.0 by exact Auburn Sounds class ID. Four deterministic runs passed for each:
  Spoton reported 0 samples, while Graillon reported 1,074 samples (22.375 ms) at 48 kHz. These are
  plugin declarations and synthetic processing results, not acoustic measurements. The live
  executable's device-free identity/initialization probe passed for Spoton and Graillon, but its
  microphone/monitoring route has not been run, so audible output, end-to-end latency and stability
  remain unverified. Voloco is not installed on the current machine.
- It processes the vendor-default state. No guessed vendor parameter IDs, copied vendor presets or
  plugin UI are included.
- The default console microphone and default console output are used. This keeps capture and
  monitoring on the same interactive Windows role used by the browser/La Place path. There is no device picker, hot-plug
  recovery or physical-headset detection.
- Shared-mode Windows conversion is enabled. Low-latency `IAudioClient3`, exclusive mode and device
  native-rate behavior still require measurement.
- Capture and render clocks may drift in long sessions. The ring reports underruns/overruns but does
  not yet perform adaptive drift correction.
- The safety stage is a hard zero-lookahead clipper, not the production lookahead limiter.
- Plugin loading remains in this isolated POC process, but a per-plugin sandbox/watchdog and scan
  timeout are still required before production.
- There is no Room/WebRTC publication, production browser control bridge, installer, custom
  protocol, signing or auto-update in this target. The development-only Vite launcher described
  above controls only this isolated local-monitoring POC.

These limitations prevent any claim that Antares, Voloco, Spoton or Graillon is already operational
in MeeWav Rooms.
