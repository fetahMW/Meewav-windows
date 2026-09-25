#pragma once

#include "plugins/vst3/Vst3LiveProcessor.h"

#include <array>
#include <charconv>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <string_view>

namespace meewav::audio {
namespace native_vst3_protocol {

inline std::string_view trim(std::string_view value) noexcept {
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.front())) != 0) {
    value.remove_prefix(1);
  }
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back())) != 0) {
    value.remove_suffix(1);
  }
  return value;
}

inline bool parseUnsigned(const std::string_view token, const std::string_view prefix,
                          const std::uint32_t maximum, std::uint32_t& result) noexcept {
  if (!token.starts_with(prefix)) {
    return false;
  }
  const auto value = token.substr(prefix.size());
  std::uint32_t parsed = 0;
  const auto conversion = std::from_chars(value.data(), value.data() + value.size(), parsed);
  if (conversion.ec != std::errc{} || conversion.ptr != value.data() + value.size() ||
      parsed > maximum) {
    return false;
  }
  result = parsed;
  return true;
}

inline bool parseFloat(const std::string_view token, const std::string_view prefix,
                       const float minimum, const float maximum, float& result) noexcept {
  if (!token.starts_with(prefix)) {
    return false;
  }
  const auto value = token.substr(prefix.size());
  float parsed = 0.0F;
  const auto conversion = std::from_chars(value.data(), value.data() + value.size(), parsed);
  if (conversion.ec != std::errc{} || conversion.ptr != value.data() + value.size() ||
      !std::isfinite(parsed) || parsed < minimum || parsed > maximum) {
    return false;
  }
  result = parsed;
  return true;
}

inline bool parseReverbType(const std::string_view token, MeeWavReverbType& result) noexcept {
  constexpr std::string_view kPrefix = "reverb_type=";
  if (!token.starts_with(kPrefix)) {
    return false;
  }
  const auto value = token.substr(kPrefix.size());
  if (value == "room") {
    result = MeeWavReverbType::room;
    return true;
  }
  if (value == "plate") {
    result = MeeWavReverbType::plate;
    return true;
  }
  if (value == "hall") {
    result = MeeWavReverbType::hall;
    return true;
  }
  return false;
}

inline bool parseSetCommand(const std::string_view rawCommand,
                            Vst3LiveControls& controls) noexcept {
  const auto command = trim(rawCommand);
  std::array<std::string_view, 13> tokens{};
  std::size_t tokenCount = 0;
  std::size_t cursor = 0;
  while (cursor < command.size() && tokenCount < tokens.size()) {
    while (cursor < command.size() &&
           std::isspace(static_cast<unsigned char>(command[cursor])) != 0) {
      ++cursor;
    }
    if (cursor >= command.size()) {
      break;
    }
    const auto start = cursor;
    while (cursor < command.size() &&
           std::isspace(static_cast<unsigned char>(command[cursor])) == 0) {
      ++cursor;
    }
    tokens[tokenCount++] = command.substr(start, cursor - start);
  }
  while (cursor < command.size() &&
         std::isspace(static_cast<unsigned char>(command[cursor])) != 0) {
    ++cursor;
  }
  if (cursor != command.size() || tokenCount != tokens.size() || tokens[0] != "set") {
    return false;
  }

  std::uint32_t bypassed = 0;
  std::uint32_t reverbEnabled = 0;
  if (!parseUnsigned(tokens[1], "bypass=", 1U, bypassed) ||
      !parseFloat(tokens[2], "input_gain=", 0.0F, 1.0F, controls.inputGain) ||
      !parseUnsigned(tokens[3], "key=", 11U, controls.key) ||
      !parseUnsigned(tokens[4], "scale=", 7U, controls.scale) ||
      !parseFloat(tokens[5], "amount=", 0.0F, 1.0F, controls.amount) ||
      !parseFloat(tokens[6], "retune=", 0.0F, 1.0F, controls.retune) ||
      !parseFloat(tokens[7], "humanize=", 0.0F, 1.0F, controls.humanize) ||
      !parseUnsigned(tokens[8], "reverb_enabled=", 1U, reverbEnabled) ||
      !parseFloat(tokens[9], "reverb_mix=", 0.0F, 1.0F, controls.reverb.mix) ||
      !parseReverbType(tokens[10], controls.reverb.type) ||
      !parseFloat(tokens[11], "reverb_duration=", MeeWavReverb::kMinimumDurationSeconds,
                  MeeWavReverb::kMaximumDurationSeconds, controls.reverb.durationSeconds) ||
      !parseFloat(tokens[12], "reverb_predelay_ms=", 0.0F,
                  MeeWavReverb::kMaximumPreDelayMs, controls.reverb.preDelayMs)) {
    return false;
  }
  controls.bypassed = bypassed != 0U;
  controls.reverb.enabled = reverbEnabled != 0U;
  return true;
}

}  // namespace native_vst3_protocol
}  // namespace meewav::audio
