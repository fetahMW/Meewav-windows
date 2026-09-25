#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace meewav::audio {

struct PluginState final {
  std::vector<std::byte> bytes;
  std::uint32_t schemaVersion{1};
};

}  // namespace meewav::audio
