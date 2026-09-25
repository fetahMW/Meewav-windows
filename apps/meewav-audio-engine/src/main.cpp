#include "audio/AudioEngine.h"
#include "bridge/ControlServer.h"
#include "diagnostics/Diagnostics.h"

#include <iostream>
#include <memory>
#include <string_view>

int main(const int argc, const char* const* argv) {
  constexpr std::string_view kVersion = "0.1.0-scaffold";
  meewav::audio::Diagnostics diagnostics{std::string(kVersion)};
  meewav::audio::AudioEngine engine(
      std::make_unique<meewav::audio::UnavailableAudioDeviceBackend>());
  meewav::audio::ControlServer control(
      std::make_unique<meewav::audio::UnavailableControlTransport>());

  if (argc == 2 && std::string_view(argv[1]) == "--diagnostics") {
    std::cout << "{\"engineVersion\":\"" << kVersion
              << "\",\"audioBackend\":\"unavailable\","
                 "\"pluginHost\":\"unavailable\",\"controlTransport\":\"unavailable\"}"
              << '\n';
    return 0;
  }

  std::cerr << "MeeWav Audio Engine native scaffold. No device, VST3, control, or Room bridge "
               "backend is enabled. See README.md before enabling a production backend.\n";
  return 2;
}
