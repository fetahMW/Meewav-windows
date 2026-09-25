#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace meewav::audio {

enum class PluginFormat { vst3, internal };
enum class PluginArchitecture { arm64, x64, universal, unknown };
enum class PluginLicenseStatus { unknown, activated, activation_required, unavailable };

struct PluginParameterMetadata final {
  // Stable ID is read from the vendor plugin at scan time. MeeWav never invents it.
  std::string stableId;
  std::string displayName;
  std::string unit;
  double defaultNormalizedValue{0.0};
  bool automatable{false};
  bool readOnly{false};
};

struct PluginDescriptor final {
  std::string pluginId;
  std::string classId;
  std::string vendor;
  std::string name;
  std::string version;
  PluginFormat format{PluginFormat::vst3};
  PluginArchitecture architecture{PluginArchitecture::unknown};
  bool available{false};
  bool scanFailed{false};
  PluginLicenseStatus licenseStatus{PluginLicenseStatus::unknown};
  std::uint32_t latencySamples{0};
  std::vector<PluginParameterMetadata> parameters;

  // Opaque scanner-issued locator. It is internal-only and never accepted from the browser.
  std::string internalInstallationToken;
};

struct PluginSummary final {
  std::string pluginId;
  std::string vendor;
  std::string name;
  std::string version;
  bool available{false};
  PluginLicenseStatus licenseStatus{PluginLicenseStatus::unknown};
  std::uint32_t latencySamples{0};
};

inline PluginSummary toPublicSummary(const PluginDescriptor& descriptor) {
  return PluginSummary{descriptor.pluginId,
                       descriptor.vendor,
                       descriptor.name,
                       descriptor.version,
                       descriptor.available,
                       descriptor.licenseStatus,
                       descriptor.latencySamples};
}

}  // namespace meewav::audio
