# Web ↔ engine control contract v1

This is the control-plane contract. It does not choose the native-to-Room audio transport.
No endpoint accepts a plugin path, executable path, library name or arbitrary module identifier.

## Processes and CMake targets

- `meewav_audio_core`: dependency-free static C++20 library.
- `meewav-audio-engine`: native process shell. Without an approved backend it exits with a clear
  unavailable status instead of pretending to process audio.
- `meewav-plugin-scanner`: isolated scanner process shell. `--contract-version` returns `1`; scan
  attempts fail closed until a JUCE or native VST3 backend is implemented.
- `meewav-vst3-poc` (only with the official SDK option on Windows): real standard-location
  Antares/Voloco metadata, instantiation and one-block processing probe. It is deliberately separate
  from the engine and accepts no caller-supplied path.
- `meewav-vst3-live-poc` (same SDK gate): event-driven WASAPI mic -> real allowlisted VST3 ->
  safety stage -> local WASAPI render. It accepts only a canonical family ID, requires explicit
  headphone confirmation, publishes nothing to a Room and has not been manually executed.

The first three targets compile with the default CMake options and no third-party SDK. The VST3 POC
target compiles only when an official SDK tree is explicitly supplied. JUCE remains fail-closed
because its adapter implementation has not been written.

## Discovery and launch

1. MeeWav Web requests an opaque single-use pairing ticket from MeeWav's authenticated backend.
2. The browser opens `meewavaudio://pair` with `pairingId`, opaque `token`, `clientNonce`, exact
   `origin`, candidate loopback ports and version metadata. The bearer never appears in a loopback
   HTTP probe.
3. The engine consumes that ticket over HTTPS through MeeWav's authenticated
   `rooms-audio-engine-pairing-consume` endpoint. The backend atomically validates expiry, user,
   Room, origin and one-use state, then returns bounded pairing claims. The engine contains no
   Supabase service key or ticket-signing secret. The engine retains the already bounded opaque
   ticket only inside the pending in-memory handshake so it can prove possession to the browser;
   it is never persisted or copied into an active session and is erased on completion, expiry or
   failure.
4. The engine binds one available candidate port on an explicit loopback address only. Web v1
   currently probes the advertised `127.0.0.1` candidate list; `::1` requires an equivalent Web
   endpoint before it can be enabled.
5. The browser probes only those candidate ports with the non-secret pairing ID, nonce and origin.
6. Browser calls unauthenticated `POST /v1/session` with only `pairingId`, the same `clientNonce`
   and exact `origin`. The engine independently generates a random local `sessionId` and a random
   `sessionSecret`, then returns them with `ticketProof`. The proof is unpadded base64url
   HMAC-SHA-256 keyed by the opaque ticket over the exact canonical message
   `pairingId\nclientNonce\norigin\nsessionId\nsessionSecret`. Every later request is authenticated.

The native contracts deliberately provide three distinct injected cryptographic boundaries:
session-ID generation, session-secret generation and ticket-proof HMAC. Their committed default
implementations all fail closed. No timestamp, pairing ID, pseudo-random standard-library engine or
plain hash may substitute for cryptographically secure implementations.

An active local session has its own lifetime, independent from the one-minute pairing-ticket TTL.
The current native contract uses an explicit eight-hour local TTL, permits at most 16 active
sessions, purges expired sessions before state transitions and erases their secret material when
closed, expired or when the native authentication registry shuts down. Room-end and role-revocation
handling may shorten that lifetime later; they must never extend it silently.

The committed `RejectAllPairingTicketConsumer`, session-ID generator, session-secret generator and
ticket-proof generator are fail-closed placeholders; they are not a production success path. Until
an HTTPS ticket consumer with certificate validation, bounded timeouts and strict response parsing
plus all three cryptographic implementations are wired, the engine must reject pairing rather than
becoming anonymous.

## Request authentication

Every request carries:

- `X-MeeWav-Session`: opaque local session ID;
- `X-MeeWav-Timestamp`: Unix milliseconds with a short acceptance window;
- `X-MeeWav-Nonce`: unique per session;
- `X-MeeWav-Signature`: HMAC-SHA-256 over method, route, timestamp, nonce and SHA-256 body digest.

The engine rejects replayed nonces, expired timestamps, wrong origins and invalid signatures.
Exact CORS allowlisting comes from signed configuration. Production never enables wildcard origins.
The unauthenticated `/v1/session` completion and browser CORS/private-network preflight are handled
as explicit handshake routes; they are not passed through the post-session HMAC guard.

## HTTP resources

All routes are under `/v1` and return a request ID plus a structured error code.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Version and compatibility, no audio state mutation |
| `POST` | `/session` | Complete a previously consumed one-use pairing without resending its token |
| `POST` | `/session/close` | Authenticated, idempotent best-effort local session cleanup |
| `GET` | `/devices` | Sanitized input/output descriptors |
| `POST` | `/devices/select` | Select IDs returned by `/devices`; never OS paths |
| `GET` | `/plugins` | Public summaries for verified allowlisted plugins |
| `POST` | `/plugins/rescan` | Scan canonical allowlist IDs in a child process |
| `GET` | `/chain` | Canonical MeeWav chain state |
| `PUT` | `/chain` | Atomically apply a validated stopped-engine graph |
| `PATCH` | `/chain/{slot}` | Change canonical controls or bypass |
| `POST` | `/preset` | Apply a MeeWav-owned canonical preset |
| `POST` | `/monitor/start` | Explicitly enable local monitoring |
| `POST` | `/monitor/stop` | Disable local monitoring |
| `GET` | `/diagnostics` | Sanitized engine metrics, no audio content |

Meters and state changes use one authenticated WebSocket channel after pairing. It carries bounded
binary/JSON control frames only; audio is not sent on the control channel.

The WebSocket upgrade is canonically signed as method `GET`, route `/v1/control`, and then sends its
session/timestamp/nonce/signature authentication frame using subprotocol `meewav-audio-v1`.

`GET /v1/health` reports one fail-closed audio-plane state:

- `unavailable`: no usable native audio route; browser must retain its current Room microphone;
- `local_monitor`: a native processed route may be audible locally, but is not published;
- `room_ready`: the processed Room track is established and explicitly ready for the browser's
  coordinated raw-to-processed handoff.

An authenticated control connection alone never implies `room_ready`.
`room_ready` is valid only with a `roomPublication` object whose state is `published`, whose Room
ID matches the active Web Room and which identifies the concrete track plus publication mechanism.
The browser retires its raw microphone only when the mechanism is `native_webrtc`. A
`pcm_bridge` declaration still requires the browser to receive and publish the actual processed
`MediaStreamTrack`; an enum or health flag is never sufficient evidence of handoff.

## Canonical chain payload

The browser refers to known IDs and public controls:

```json
{
  "inputGainDb": 0,
  "vocalTuning": {
    "enabled": true,
    "provider": "antares.autotune",
    "key": "F#",
    "scale": "minor",
    "correctionAmount": 0.65,
    "retuneSpeed": 0.55,
    "humanize": 0.2,
    "formant": 0.5
  },
  "compressor": { "provider": "meewav.compressor", "amount": 0.35 },
  "reverb": { "provider": "meewav.reverb", "amount": 0.22 },
  "masterGainDb": -3
}
```

This payload is not translated to vendor parameters unless the local descriptor matches a verified
class/version profile and every required canonical binding resolves from scanned metadata.

## Scanner contract

The engine starts `meewav-plugin-scanner` as a child with inherited anonymous pipes and a
per-plugin deadline. The request follows `schemas/plugin-scan-request.schema.json`; importantly it
contains no path. Scanner roots are built internally by `standardVst3Roots()`:

- Windows: system/user standard VST3 locations;
- macOS: `/Library/Audio/Plug-Ins/VST3` and the user's standard VST3 location.

The scanner may report a crash, timeout, incompatible architecture or activation state per plugin.
The engine caches successful metadata keyed by container fingerprint/version. A scan failure never
loads the container into the main process.

## Audio plane invariant

Whichever Room bridge is selected later must output 48 kHz Float32 PCM and publish exactly one
microphone track. When effects are bypassed, the processed track remains the published track with
processors bypassed. If the native engine fails, the Web UI must explicitly ask before switching to
the browser's raw microphone. Local monitoring never depends on the network return path.

## Current unavailable boundaries

- no production CoreAudio or WASAPI backend (the Windows path is isolated in a manual POC);
- no production VST3 SDK or JUCE host adapter (the VST3 instances remain isolated POCs);
- no production Antares/Voloco instantiation or validated behavioral parameter map; an isolated
  Auto-Tune 11 synthetic probe and metadata-only prototype profile exist, while Voloco remains absent;
- no loopback HTTP/WebSocket implementation;
- no production HTTPS one-use pairing-ticket consumer, secure session-ID/session-secret generators
  or ticket-proof/command HMAC implementations;
- no native PCM or direct WebRTC Room publisher.

These boundaries are represented by explicit unavailable backends, not mock success responses.

The optional Windows POC can perform isolated instantiation and a finite probe block, but it does
not change these production-engine boundaries until its results are verified and its backend is
promoted into the engine.
