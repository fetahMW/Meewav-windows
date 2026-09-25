#include "poc/windows/NativeVst3ControlProtocol.h"

#include <cmath>
#include <cstdlib>
#include <iostream>

namespace {

void require(const bool condition, const char* message) {
  if (!condition) {
    std::cerr << "NativeVst3ControlProtocolTests: " << message << '\n';
    std::exit(1);
  }
}

}  // namespace

int main() {
  meewav::audio::Vst3LiveControls controls;
  require(meewav::audio::native_vst3_protocol::parseSetCommand(
              "set bypass=0 input_gain=0.420000 key=9 scale=2 amount=0.800000 retune=0.700000 "
              "humanize=0.240000 "
              "reverb_enabled=1 reverb_mix=0.370000 reverb_type=plate "
              "reverb_duration=1.800000 reverb_predelay_ms=24.000000",
              controls),
          "valid full command was rejected");
  require(!controls.bypassed && controls.key == 9U && controls.scale == 2U &&
              std::abs(controls.inputGain - 0.42F) < 0.0001F &&
              std::abs(controls.amount - 0.8F) < 0.0001F &&
              std::abs(controls.retune - 0.7F) < 0.0001F &&
              std::abs(controls.humanize - 0.24F) < 0.0001F && controls.reverb.enabled &&
              controls.reverb.type == meewav::audio::MeeWavReverbType::plate &&
              std::abs(controls.reverb.mix - 0.37F) < 0.0001F &&
              std::abs(controls.reverb.durationSeconds - 1.8F) < 0.0001F &&
              std::abs(controls.reverb.preDelayMs - 24.0F) < 0.0001F,
          "valid command fields were not preserved");

  require(!meewav::audio::native_vst3_protocol::parseSetCommand(
              "set bypass=0 key=9 scale=2 amount=0.8 retune=0.7", controls),
          "legacy command without reverb contract was accepted");
  require(!meewav::audio::native_vst3_protocol::parseSetCommand(
              "set bypass=0 input_gain=1 key=9 scale=2 amount=0.8 retune=0.7 humanize=0.2 reverb_enabled=1 "
              "reverb_mix=0.4 reverb_type=cathedral reverb_duration=1.8 "
              "reverb_predelay_ms=24",
              controls),
          "unknown reverb type was accepted");
  require(!meewav::audio::native_vst3_protocol::parseSetCommand(
              "set bypass=0 input_gain=1 key=9 scale=2 amount=0.8 retune=0.7 humanize=0.2 reverb_enabled=1 "
              "reverb_mix=1.2 reverb_type=hall reverb_duration=1.8 "
              "reverb_predelay_ms=24",
              controls),
          "out-of-range reverb mix was accepted");
  require(!meewav::audio::native_vst3_protocol::parseSetCommand(
              "set bypass=0 input_gain=1 key=9 scale=2 amount=0.8 retune=0.7 humanize=0.2 reverb_enabled=1 "
              "reverb_mix=0.4 reverb_type=hall reverb_duration=5.1 "
              "reverb_predelay_ms=24",
              controls),
          "out-of-range duration was accepted");
  require(!meewav::audio::native_vst3_protocol::parseSetCommand(
              "set bypass=0 input_gain=1.1 key=9 scale=2 amount=0.8 retune=0.7 humanize=0.2 "
              "reverb_enabled=0 reverb_mix=0 reverb_type=room reverb_duration=1.2 "
              "reverb_predelay_ms=0",
              controls),
          "out-of-range microphone gain was accepted");

  std::cout << "NativeVst3ControlProtocolTests: OK\n";
  return 0;
}
