# Architecture decision gates

## Framework gate: JUCE versus native VST3 SDK

No production choice is encoded by the scaffold. A native Steinberg Windows proof of concept is
available behind an explicit SDK path so MeeWav can validate Antares/Voloco without first choosing
JUCE. That POC does not decide the production device/host architecture. The decision must record:

| Concern | JUCE backend | Native VST3 SDK backend |
|---|---|---|
| Licensing | Confirm MeeWav's commercial/GPL obligations before inclusion | Confirm Steinberg SDK terms and every surrounding dependency |
| Device I/O | Mature CoreAudio/WASAPI abstraction | MeeWav implements and owns each platform backend |
| VST3 hosting | Existing hosting primitives and reference host | Direct control, substantially more engineering |
| Cross-platform cost | Lower | Higher |
| Binary surface | Broader framework | Potentially smaller, custom surface |
| Maintenance | Framework upgrades | MeeWav maintains device graph and host lifecycle |

The Windows microphone-to-headphones implementation now compiles as an isolated optional target;
it has not been executed. Go/no-go still requires a written legal decision, successful manual
instantiation of legally activated Antares and Voloco builds, audible processing, state restore,
parameter control from scanned metadata, and a 30-minute dropout-free run on target hardware.

## Pairing authority gate

Production pairing uses backend authority, not a verifier secret embedded in the native app. The
browser obtains an opaque one-use ticket, and the native engine consumes it over HTTPS
through `rooms-audio-engine-pairing-consume`. The backend atomically consumes the ticket and returns
bounded Room/user/origin claims. The native consumer must enforce TLS validation, strict endpoint
allowlisting, deadlines and response-size/schema limits. The existing reject-all verifier remains
the safe default until that consumer and cryptographically secure local session secrets exist.

## Room bridge gate

Compare with the actual Rooms WebRTC transport before implementation:

1. Native PCM to authenticated loopback transport, AudioWorklet ring buffer, then browser
   `MediaStreamTrack`.
2. Native engine publishes the processed track directly to MeeWav's WebRTC infrastructure.
3. Virtual audio driver only if options 1 and 2 are rejected for measured technical reasons.

The chosen design must guarantee that raw and processed microphone tracks are never published at
the same time. Local monitoring remains native and independent of network reconnects.

## Vendor adapter gate

An adapter profile is enabled only after all of the following are captured from the installed
plugin through the approved host backend:

- exact vendor and VST3 class ID;
- version compatibility range;
- parameter metadata and stable IDs;
- units, normalization and automation flags;
- reported latency;
- state serialization round-trip;
- activation and failure behavior.

Any values that remain empty in the committed Antares/Voloco profiles are safety gates, not TODO
values to guess. The populated Auto-Tune 11 fields are explicitly metadata-only prototype evidence,
not production adapter approval.
