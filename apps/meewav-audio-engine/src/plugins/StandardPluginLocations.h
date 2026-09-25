#pragma once

#include <filesystem>
#include <vector>

namespace meewav::audio {

// Returns only operating-system standard VST3 roots. These locations are engine-owned;
// the browser API never supplies or overrides a filesystem path.
[[nodiscard]] std::vector<std::filesystem::path> standardVst3Roots();

}  // namespace meewav::audio
