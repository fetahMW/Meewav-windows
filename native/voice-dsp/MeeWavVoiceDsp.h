#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include <cstddef>

// Native port of MeeWav's meewav-pitch-correction.worklet.js. State and all
// buffers belong to the audio thread; processStereo never allocates or locks.
class MeeWavPitchCorrection {
    static constexpr int inputSize = 2048, analysisSize = 1024, delaySize = 8192, maxTauBuffer = 400;
    std::array<float, inputSize> input{};
    std::array<float, analysisSize> analysis{};
    std::array<float, maxTauBuffer + 1> difference{};
    std::array<float, delaySize> delay{};
    int inputWrite = 0, delayWrite = 0, hop = 0, total = 0;
    float phase = .25f, ratio = 1.f, wet = 0.f;
    bool voiced = false, wasEnabled = false;
    float sampleRate;
    static constexpr std::array<bool, 12> major{true,false,true,false,true,true,false,true,false,true,false,true};
    static float wrap(float value) { return value - std::floor(value); }
    float read(float index) const {
        const float wrapped = index - std::floor(index / delaySize) * delaySize;
        const int left = static_cast<int>(wrapped);
        return delay[left] + (delay[(left + 1) & (delaySize - 1)] - delay[left]) * (wrapped - left);
    }
    float targetNote(float midi, int scale) const {
        if (scale == 0) return std::round(midi);
        const int root = std::clamp(scale - 1, 0, 11), center = static_cast<int>(std::round(midi));
        float best = center, distance = 100;
        for (int candidate = center - 7; candidate <= center + 7; ++candidate) {
            const int pitchClass = ((candidate - root) % 12 + 12) % 12;
            const float next = std::abs(candidate - midi);
            if (major[pitchClass] && next < distance) { best = candidate; distance = next; }
        }
        return best;
    }
    void analyze(bool enabled, int scale, float amount, float speed, float humanize, float smooth, float shift) {
        float mean = 0, energy = 0;
        for (int i = 0; i < analysisSize; ++i) {
            analysis[i] = .5f * (input[(inputWrite + i * 2) & (inputSize - 1)] + input[(inputWrite + i * 2 + 1) & (inputSize - 1)]);
            mean += analysis[i];
        }
        mean /= analysisSize;
        for (float& value : analysis) { value -= mean; energy += value * value; }
        if (!enabled || std::sqrt(energy / analysisSize) < .008f) { voiced = false; return; }
        const float rate = sampleRate * .5f;
        const int minTau = std::max(2, static_cast<int>(rate / 900));
        const int maxTau = std::min(maxTauBuffer, static_cast<int>(rate / 70));
        const int length = analysisSize - maxTau;
        for (int tau = 1; tau <= maxTau; ++tau) {
            float sum = 0;
            for (int i = 0; i < length; ++i) { const float d = analysis[i] - analysis[i + tau]; sum += d * d; }
            difference[tau] = sum;
        }
        float running = 0; difference[0] = 1;
        for (int tau = 1; tau <= maxTau; ++tau) {
            running += difference[tau];
            difference[tau] = running > 0 ? difference[tau] * tau / running : 1;
        }
        int estimate = -1, bestTau = minTau;
        float bestValue = difference[minTau];
        for (int tau = minTau; tau <= maxTau; ++tau) {
            float value = difference[tau];
            if (value < bestValue) { bestValue = value; bestTau = tau; }
            if (value < .13f) {
                while (tau + 1 <= maxTau && difference[tau + 1] < value) value = difference[++tau];
                estimate = tau; break;
            }
        }
        if (estimate < 0 && bestValue < .28f) estimate = bestTau;
        if (estimate < 0) { voiced = false; return; }
        float refined = estimate;
        if (estimate > minTau && estimate < maxTau) {
            const float left = difference[estimate - 1], center = difference[estimate], right = difference[estimate + 1];
            const float denominator = left - 2 * center + right;
            if (std::abs(denominator) > 1e-9f) refined += .5f * (left - right) / denominator;
        }
        const float frequency = rate / refined;
        if (!std::isfinite(frequency) || frequency < 70 || frequency > 900) { voiced = false; return; }
        const float midi = 69 + 12 * std::log2(frequency / 440);
        const float distance = targetNote(midi, scale) - midi;
        const float corrected = std::abs(distance) <= (.07f + humanize * .28f) ? 0 : distance * amount * (1 - humanize * .38f);
        const float desired = std::clamp(std::pow(2.f, (corrected + shift) / 12), .5f, 2.f);
        ratio += (desired - ratio) * (.055f + speed * speed * .78f) / (1 + smooth * 8);
        voiced = bestValue < .3f;
    }
public:
    explicit MeeWavPitchCorrection(float rate = 48000) : sampleRate(rate) {}
    void processStereo(float* samples, int frames, bool enabled, int scale,
                       float amount = 1, float speed = 1, float humanize = 0, float smooth = 0, float shift = 0) {
        if (enabled != wasEnabled) { voiced = false; ratio = 1; wasEnabled = enabled; }
        for (int i = 0; i < frames; ++i) {
            const float dry = std::isfinite(samples[i * 2]) ? samples[i * 2] : 0;
            input[inputWrite] = dry; inputWrite = (inputWrite + 1) & (inputSize - 1);
            delay[delayWrite] = dry;
            ++hop; total = std::min(total + 1, inputSize);
            if (total >= inputSize && hop >= 512) {
                hop = 0; analyze(enabled, scale, amount, speed, humanize, smooth, shift);
            }
            const float desiredWet = enabled && voiced && std::abs(ratio - 1) > .0008f ? 1.f : 0.f;
            wet += (desiredWet - wet) * .0045f;
            if (!desiredWet && wet < 1e-6f) wet = 0;
            phase = wrap(phase + (1 - ratio) / 1024);
            const float other = wrap(phase + .5f);
            const float weight = .5f - .5f * std::cos(6.283185307179586f * phase);
            const float shifted = read(delayWrite - 64 - phase * 1024) * weight + read(delayWrite - 64 - other * 1024) * (1 - weight);
            samples[i * 2] = samples[i * 2 + 1] = dry + (shifted - dry) * wet;
            delayWrite = (delayWrite + 1) & (delaySize - 1);
        }
    }
};

// Small damped parallel-comb room reverb. Independent per-channel delay lengths
// decorrelate the tail; the dry signal stays at zero additional latency.
class MeeWavReverb {
    std::array<std::array<float, 2048>, 8> buffers{};
    std::array<int, 8> positions{};
    std::array<float, 8> lowpass{};
    static constexpr std::array<int, 8> lengths{1116,1188,1277,1356,1139,1211,1300,1379};
    float wet = 0;
public:
    void processStereo(float* samples, int frames, bool enabled, float amount) {
        const float target = enabled ? std::clamp(amount, 0.f, 1.f) : 0.f;
        for (int i = 0; i < frames; ++i) {
            wet += (target - wet) * .0045f;
            if (!target && wet < 1e-6f) wet = 0;
            for (int channel = 0; channel < 2; ++channel) {
                const float dry = samples[i * 2 + channel]; float sum = 0;
                for (int j = channel * 4; j < channel * 4 + 4; ++j) {
                    const float value = buffers[j][positions[j]];
                    lowpass[j] += (value - lowpass[j]) * .22f;
                    float next = (enabled ? dry : 0.f) + lowpass[j] * .73f;
                    buffers[j][positions[j]] = std::abs(next) < 1e-20f ? 0.f : next;
                    positions[j] = (positions[j] + 1) % lengths[j]; sum += value;
                }
                samples[i * 2 + channel] = dry + sum * .125f * wet;
            }
        }
    }
};
