#pragma once

#include "core/Status.h"
#include "plugins/PluginDescriptor.h"

#include <algorithm>
#include <cctype>
#include <map>
#include <optional>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

namespace meewav::audio {

enum class CanonicalVocalControl {
  key,
  scale,
  correctionAmount,
  retuneSpeed,
  humanize,
  formant,
  preset,
};

struct ParameterMatchRule final {
  CanonicalVocalControl control;
  std::string exactDisplayName;
  std::optional<std::string> exactUnit;
};

struct PluginAdapterRules final {
  std::string pluginId;
  std::string exactVendor;
  std::unordered_set<std::string> verifiedClassIds;
  std::vector<std::string> acceptedVersionPrefixes;
  std::vector<ParameterMatchRule> parameterRules;
};

struct CanonicalParameterMap final {
  Status status;
  std::map<CanonicalVocalControl, std::string> stableParameterIds;
};

class IPluginAdapter {
 public:
  virtual ~IPluginAdapter() = default;
  [[nodiscard]] virtual bool supports(const PluginDescriptor& descriptor) const = 0;
  [[nodiscard]] virtual CanonicalParameterMap mapParameters(
      const PluginDescriptor& descriptor) const = 0;
  [[nodiscard]] virtual const std::string& canonicalPluginId() const noexcept = 0;
};

class MetadataDrivenPluginAdapter : public IPluginAdapter {
 public:
  explicit MetadataDrivenPluginAdapter(PluginAdapterRules rules) : rules_(std::move(rules)) {}

  [[nodiscard]] bool supports(const PluginDescriptor& descriptor) const override {
    if (rules_.verifiedClassIds.empty() || descriptor.vendor != rules_.exactVendor ||
        !rules_.verifiedClassIds.contains(descriptor.classId)) {
      return false;
    }
    if (rules_.acceptedVersionPrefixes.empty()) {
      return true;
    }
    return std::ranges::any_of(rules_.acceptedVersionPrefixes, [&](const std::string& prefix) {
      return descriptor.version.starts_with(prefix);
    });
  }

  [[nodiscard]] CanonicalParameterMap mapParameters(
      const PluginDescriptor& descriptor) const override {
    if (!supports(descriptor)) {
      return CanonicalParameterMap{
          Status::failure(StatusCode::plugin_incompatible,
                          "Plugin identity or version is not verified for this adapter."),
          {}};
    }

    CanonicalParameterMap result{Status::success(), {}};
    for (const auto& rule : rules_.parameterRules) {
      const auto match = std::ranges::find_if(
          descriptor.parameters, [&](const PluginParameterMetadata& parameter) {
            return !parameter.stableId.empty() && parameter.automatable && !parameter.readOnly &&
                   parameter.displayName == rule.exactDisplayName &&
                   (!rule.exactUnit.has_value() || parameter.unit == *rule.exactUnit);
          });
      if (match == descriptor.parameters.end()) {
        return CanonicalParameterMap{
            Status::failure(StatusCode::plugin_incompatible,
                            "Verified plugin metadata no longer matches the adapter profile."),
            {}};
      }
      result.stableParameterIds.insert_or_assign(rule.control, match->stableId);
    }
    return result;
  }

  [[nodiscard]] const std::string& canonicalPluginId() const noexcept override {
    return rules_.pluginId;
  }

 protected:
  PluginAdapterRules rules_;
};

}  // namespace meewav::audio
