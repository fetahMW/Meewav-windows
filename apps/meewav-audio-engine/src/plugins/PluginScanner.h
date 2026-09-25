#pragma once

#include "core/Status.h"
#include "plugins/PluginDescriptor.h"

#include <chrono>
#include <cstddef>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace meewav::audio {

inline constexpr int kPluginScannerContractVersion = 1;
inline constexpr std::size_t kMaxPluginScanTargets = 64;

// Mirrors plugin-scan-request.schema.json. The native boundary validates this again
// so an alternate transport cannot turn a canonical plugin ID into a filesystem path.
[[nodiscard]] bool isCanonicalPluginId(std::string_view pluginId) noexcept;

struct PluginScanRequest final {
  int contractVersion{kPluginScannerContractVersion};
  std::vector<std::string> allowlistedPluginIds;
  std::chrono::milliseconds perPluginTimeout{10'000};
};

struct PluginScanResponse final {
  Status status;
  std::vector<PluginDescriptor> plugins;
};

class IScannerProcessTransport {
 public:
  virtual ~IScannerProcessTransport() = default;
  virtual PluginScanResponse runIsolated(const PluginScanRequest& request) = 0;
};

class UnavailableScannerProcessTransport final : public IScannerProcessTransport {
 public:
  PluginScanResponse runIsolated(const PluginScanRequest& request) override;
};

class PluginScanner final {
 public:
  explicit PluginScanner(std::unique_ptr<IScannerProcessTransport> transport);
  PluginScanResponse scan(const std::vector<std::string>& allowlistedPluginIds);

 private:
  std::unique_ptr<IScannerProcessTransport> transport_;
};

}  // namespace meewav::audio
