# Framework decision — Phase 1 Windows POC

Status: **native Steinberg VST3 SDK selected for the isolated Windows go/no-go POC only**.
The production engine framework remains open until device I/O and long-run stability are measured.

## Evidence

- Steinberg's official VST3 SDK 3.8.x repository is MIT-licensed and includes host helpers,
  module loading, factory metadata and processing interfaces.
- The current development machine has MSVC 14.50 and CMake capable of compiling that SDK.
- MeeWav's `meewav-vst3-poc` target builds successfully against a clean official SDK source tree.
- MeeWav's `meewav-vst3-live-poc` target also compiles in Release. Its code connects event-driven
  shared-mode WASAPI capture to a real allowlisted VST3 processor, the safety stage and WASAPI
  render, with no raw parallel route.
- Auto-Tune Pro is present in Windows' standard VST3 directory; Voloco is not currently present.
- The offline POC was executed without live audio. It instantiated Auto-Key 2 and Auto-Tune Pro
  11.0.0 and processed one finite synthetic block through each target (`targets=2`,
  `probesPassed=2`). Auto-Tune exposed 182 real parameter IDs and reported 2,670 latency samples at
  48 kHz. Activation status, audible processing, live device negotiation and end-to-end stability
  remain unverified.

Primary references:

- [Steinberg VST3 SDK repository and MIT license](https://github.com/steinbergmedia/vst3sdk)
- [Official VST3 hosting documentation](https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Hosting.html)
- [Official VST3 module/factory model](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/VST%2BModule%2BArchitecture/Index.html)

## Why this POC does not use JUCE

The direct SDK path answers the immediate technical question—can the legally installed Antares and
Voloco VST3 builds instantiate and process on MeeWav's target Windows stack—without first making a
broader JUCE licensing/product decision. It also avoids confusing a framework choice with vendor
plugin rights.

JUCE may still be the better production device/host abstraction. That decision needs a separate
commercial-license review and a comparison of WASAPI/CoreAudio, hot-plug, crash containment,
maintenance cost and binary size.

## What the POC genuinely does

When built with `MEEWAV_AUDIO_WITH_VST3_SDK=ON`, the Windows-only executable:

1. asks Steinberg's host helper for standard VST3 locations;
2. rejects module paths that do not match the Antares/Auto-Tune/Voloco allowlist families;
3. loads each remaining module inside the POC process, separate from the engine;
4. verifies factory vendor/name metadata and Audio Module Class category;
5. reads the real class ID, version and parameter metadata;
6. creates `IComponent`, `IEditController` when provided, and `IAudioProcessor`;
7. configures 48 kHz, 32-bit float, 128 frames and current bus arrangements;
8. processes one low-level in-memory probe block and rejects non-finite output;
9. reports the plugin-declared latency and returns failure unless every target probe passes.

It accepts no command-line plugin path, performs no activation bypass, and contains no guessed
parameter IDs.

## Remaining blocker before a true Phase 1 success

The isolated offline POC now proves that this Auto-Tune Pro 11.0.0 build can instantiate and process
one synthetic block in the probed lifecycle. The observed class/version/parameter metadata is stored
in a `locally_scanned_prototype_only` profile. An approved developer must still run the live POC with
headphones; the offline result does not prove activation status, audible correction, state restore or
stability. Voloco must be installed and activated legally before its POC can run.

The live-monitoring implementation and its remaining technical limits are recorded in
`windows-live-poc.md`. Compilation plus the offline synthetic probe does not satisfy the manual audio
validation gate.

## Production no-go conditions

Do not promote the POC into the Room engine until:

- the scanner has a parent-enforced timeout and crash quarantine per plugin;
- Antares and Voloco pass initialization, state restore and 30-minute processing runs;
- parameters are mapped from scanned metadata and checked across supported versions;
- WASAPI/CoreAudio monitoring is implemented and measured;
- plugin state, device loss, sample-rate changes and activation failures recover cleanly;
- the selected Room bridge publishes only the processed microphone track;
- vendor plugin licenses and MeeWav distribution/onboarding terms are approved.
