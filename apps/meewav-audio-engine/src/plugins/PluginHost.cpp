#include "plugins/PluginHost.h"

#include <utility>

namespace meewav::audio {

PluginLoadResult UnavailablePluginHostBackend::load(const PluginDescriptor&) {
  return PluginLoadResult{
      Status::failure(StatusCode::backend_unavailable,
                      "No JUCE or native VST3 hosting backend is compiled."),
      nullptr};
}

PluginHost::PluginHost(PluginRegistry& registry, std::unique_ptr<IPluginHostBackend> backend)
    : registry_(registry),
      backend_(backend ? std::move(backend) : std::make_unique<UnavailablePluginHostBackend>()) {}

PluginLoadResult PluginHost::loadAllowlisted(const std::string& pluginId) {
  const auto descriptor = registry_.findInternal(pluginId);
  if (!descriptor.has_value()) {
    return PluginLoadResult{
        Status::failure(StatusCode::plugin_not_found,
                        "The requested plugin is not present in the verified local registry."),
        nullptr};
  }
  if (!descriptor->available) {
    return PluginLoadResult{
        Status::failure(StatusCode::plugin_not_found, "The requested plugin is unavailable."),
        nullptr};
  }
  if (descriptor->format == PluginFormat::vst3 &&
      descriptor->licenseStatus != PluginLicenseStatus::activated) {
    return PluginLoadResult{
        Status::failure(StatusCode::plugin_not_activated,
                        "The VST3 vendor activation state is not positively confirmed."),
        nullptr};
  }
  return backend_->load(*descriptor);
}

}  // namespace meewav::audio
