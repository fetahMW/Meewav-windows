#include "plugins/PluginRegistry.h"

#include <algorithm>
#include <mutex>
#include <utility>

namespace meewav::audio {

void PluginRegistry::setAllowlist(std::vector<PluginAllowlistEntry> allowlist) {
  std::unique_lock lock(mutex_);
  allowlist_.clear();
  for (auto& entry : allowlist) {
    const auto pluginId = entry.pluginId;
    allowlist_.insert_or_assign(pluginId, std::move(entry));
  }
  descriptors_.clear();
}

Status PluginRegistry::replaceScanResults(std::vector<PluginDescriptor> descriptors) {
  std::unique_lock lock(mutex_);
  decltype(descriptors_) validatedDescriptors;
  for (auto& descriptor : descriptors) {
    if (!isAllowed(descriptor)) {
      continue;
    }
    if (descriptor.internalInstallationToken.empty()) {
      return Status::failure(StatusCode::invalid_argument,
                             "Scanner result is missing its opaque installation token.");
    }
    validatedDescriptors.insert_or_assign(descriptor.pluginId, std::move(descriptor));
  }
  descriptors_.swap(validatedDescriptors);
  return Status::success();
}

std::optional<PluginDescriptor> PluginRegistry::findInternal(const std::string& pluginId) const {
  std::shared_lock lock(mutex_);
  const auto found = descriptors_.find(pluginId);
  if (found == descriptors_.end()) {
    return std::nullopt;
  }
  return found->second;
}

std::vector<PluginSummary> PluginRegistry::publicPlugins() const {
  std::shared_lock lock(mutex_);
  std::vector<PluginSummary> result;
  result.reserve(descriptors_.size());
  for (const auto& [_, descriptor] : descriptors_) {
    result.push_back(toPublicSummary(descriptor));
  }
  std::ranges::sort(result, {}, &PluginSummary::name);
  return result;
}

bool PluginRegistry::isAllowed(const PluginDescriptor& descriptor) const {
  const auto allowed = allowlist_.find(descriptor.pluginId);
  if (allowed == allowlist_.end() || !allowed->second.enabled) {
    return false;
  }
  return descriptor.vendor == allowed->second.vendor &&
         allowed->second.verifiedClassIds.contains(descriptor.classId);
}

}  // namespace meewav::audio
