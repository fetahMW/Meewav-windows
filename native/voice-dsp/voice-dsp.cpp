#include "MeeWavVoiceDsp.h"

// Same DSP classes as Android WaveNativeDuplex. Pro exposes the existing
// correction parameters; Android's fixed profile remains speed=1 / humanize=0.
// One WASM instance per microphone; no allocation in the render callback.
static MeeWavPitchCorrection pitch;
static MeeWavReverb reverb;
static float samples[2048]{};

extern "C" {
void mw_init(float rate) {
    pitch = MeeWavPitchCorrection(rate);
    reverb = MeeWavReverb();
}
float* mw_buffer() { return samples; }
void mw_process(int frames, int tune, int scale, int room, float amount) {
    if (frames < 0 || frames > 1024) return;
    pitch.processStereo(samples, frames, tune != 0, scale);
    const float position = std::clamp(amount, 0.f, 1.f);
    reverb.processStereo(samples, frames, room != 0, position * position);
}
void mw_process_pro(int frames, int tune, int scale, int room, float amount,
                    float speed, float humanize, float smooth) {
    if (frames < 0 || frames > 1024) return;
    const auto unit = [](float value, float fallback) { return std::isfinite(value) ? std::clamp(value, 0.f, 1.f) : fallback; };
    pitch.processStereo(samples, frames, tune != 0, scale, 1.f,
                        unit(speed, 1.f), unit(humanize, 0.f), unit(smooth, 0.f));
    const float position = unit(amount, 0.f);
    reverb.processStereo(samples, frames, room != 0, position * position);
}
}
