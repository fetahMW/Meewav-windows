// Test oracle: calls the Android classes directly, compiled as a native exe.
#include "MeeWavVoiceDsp.h"
#include <cstdio>
#include <cstdlib>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
int main(int argc, char** argv) {
    if (argc != 5) return 2;
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    MeeWavPitchCorrection pitch(48000);
    MeeWavReverb reverb;
    float samples[192];
    const float amount = std::strtof(argv[4], nullptr);
    while (const auto count = std::fread(samples, sizeof(float), 192, stdin)) {
        if (count % 2) return 3;
        pitch.processStereo(samples, static_cast<int>(count / 2), std::atoi(argv[1]) != 0, std::atoi(argv[2]));
        reverb.processStereo(samples, static_cast<int>(count / 2), std::atoi(argv[3]) != 0, amount * amount);
        if (std::fwrite(samples, sizeof(float), count, stdout) != count) return 4;
    }
}
