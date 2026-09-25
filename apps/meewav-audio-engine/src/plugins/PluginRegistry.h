#pragma once

#include "core/Status.h"
#include "plugins/PluginDescriptor.h"

#include <optional>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace meewav::audio {

struct PluginAllowlistEntry final {
  std::string pluginId;
  std::string vendor;
  std::unordered_set<std::string> verifiedClassIds;
  bool enabled{false};
};

class PluginRegistry final {
 public:
  void setAllowlist(std::vector<PluginAllowlistEntry> allowlist);
  Status replaceScanResults(std::vector<PluginDescriptor> descriptors);
  [[nodiscard]] std::optional<PluginDescriptor> findInternal(const std::string& pluginId) const;
  [[nodiscard]] std::vector<PluginSummary> publicPlugins() const;

 private:
  [[nodiscard]] bool isAllowed(const PluginDescriptor& descriptor) const;

  mutable std::shared_mutex mutex_;
  std::unordered_map<std::string, PluginAllowlistEntry> allowlist_;
  std::unordered_map<std::string, PluginDescriptor> descriptors_;
};

}  // namespace meewav::audio
