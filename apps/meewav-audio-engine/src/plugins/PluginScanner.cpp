#include "plugins/PluginScanner.h"

#include <algorithm>
#include <utility>

namespace meewav::audio {
namespace {

[[nodiscard]] bool isLowerAsciiLetterOrDigit(const char value) noexcept {
  return (value >= 'a' && value <= 'z') || (value >= '0' && value <= '9');
}

}  // namespace

bool isCanonicalPluginId(const std::string_view pluginId) noexcept {
  if (pluginId.size() < 2 || pluginId.size() > 128 ||
      !isLowerAsciiLetterOrDigit(pluginId.front())) {
    return false;
  }
  bool previousWasSeparator = false;
  for (std::size_t index = 1; index < pluginId.size(); ++index) {
    const char value = pluginId[index];
    if (isLowerAsciiLetterOrDigit(value)) {
      previousWasSeparator = false;
      continue;
    }
    const bool separator = value == '.' || value == '_' || value == '-';
    if (!separator || previousWasSeparator || index + 1 == pluginId.size()) {
      return false;
    }
    previousWasSeparator = true;
  }
  return true;
}

PluginScanResponse UnavailableScannerProcessTransport::runIsolated(const PluginScanRequest&) {
  return PluginScanResponse{
      Status::failure(StatusCode::backend_unavailable,
                      "The isolated VST3 scanner backend has not been selected yet."),
      {}};
}

PluginScanner::PluginScanner(std::unique_ptr<IScannerProcessTransport> transport)
    : transport_(transport ? std::move(transport)
                           : std::make_unique<UnavailableScannerProcessTransport>()) {}

PluginScanResponse PluginScanner::scan(const std::vector<std::string>& allowlistedPluginIds) {
  if (allowlistedPluginIds.empty()) {
    return PluginScanResponse{
        Status::failure(StatusCode::invalid_argument, "Plugin scan allowlist is empty."), {}};
  }
  if (allowlistedPluginIds.size() > kMaxPluginScanTargets) {
    return PluginScanResponse{
        Status::failure(StatusCode::invalid_argument,
                        "Plugin scan allowlist exceeds the bounded target count."),
        {}};
  }
  if (!std::ranges::all_of(allowlistedPluginIds, isCanonicalPluginId)) {
    return PluginScanResponse{
        Status::failure(StatusCode::invalid_argument,
                        "Plugin scan allowlist contains a non-canonical plugin ID."),
        {}};
  }

  PluginScanRequest request;
  request.allowlistedPluginIds = allowlistedPluginIds;
  std::ranges::sort(request.allowlistedPluginIds);
  request.allowlistedPluginIds.erase(
      std::unique(request.allowlistedPluginIds.begin(), request.allowlistedPluginIds.end()),
      request.allowlistedPluginIds.end());
  return transport_->runIsolated(request);
}

}  // namespace meewav::audio
