#include "plugins/StandardPluginLocations.h"

#include <cstdlib>
#include <string>

namespace meewav::audio {
namespace {

void appendEnvironmentPath(std::vector<std::filesystem::path>& roots, const char* variable,
                           const std::filesystem::path& suffix) {
#if defined(_WIN32)
  char* value = nullptr;
  std::size_t length = 0;
  if (_dupenv_s(&value, &length, variable) == 0 && value != nullptr && length > 1) {
    roots.emplace_back(std::filesystem::path(value) / suffix);
  }
  std::free(value);
#else
  if (const char* value = std::getenv(variable); value != nullptr && value[0] != '\0') {
    roots.emplace_back(std::filesystem::path(value) / suffix);
  }
#endif
}

}  // namespace

std::vector<std::filesystem::path> standardVst3Roots() {
  std::vector<std::filesystem::path> roots;
#if defined(_WIN32)
  appendEnvironmentPath(roots, "ProgramFiles", std::filesystem::path("Common Files") / "VST3");
  appendEnvironmentPath(roots, "LOCALAPPDATA",
                        std::filesystem::path("Programs") / "Common" / "VST3");
#elif defined(__APPLE__)
  roots.emplace_back("/Library/Audio/Plug-Ins/VST3");
  appendEnvironmentPath(roots, "HOME", std::filesystem::path("Library") / "Audio" / "Plug-Ins" /
                                           "VST3");
#endif
  return roots;
}

}  // namespace meewav::audio
