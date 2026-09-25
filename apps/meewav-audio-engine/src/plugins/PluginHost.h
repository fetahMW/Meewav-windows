#pragma once

#include "core/Status.h"
#include "plugins/PluginInstance.h"
#include "plugins/PluginRegistry.h"

#include <memory>
#include <string>

namespace meewav::audio {

struct PluginLoadResult final {
  Status status;
  std::unique_ptr<IPluginInstance> instance;
};

class IPluginHostBackend {
 public:
  virtual ~IPluginHostBackend() = default;
  virtual PluginLoadResult load(const PluginDescriptor& descriptor) = 0;
};

class UnavailablePluginHostBackend final : public IPluginHostBackend {
 public:
  PluginLoadResult load(const PluginDescriptor& descriptor) override;
};

class PluginHost final {
 public:
  PluginHost(PluginRegistry& registry, std::unique_ptr<IPluginHostBackend> backend);
  PluginLoadResult loadAllowlisted(const std::string& pluginId);

 private:
  PluginRegistry& registry_;
  std::unique_ptr<IPluginHostBackend> backend_;
};

}  // namespace meewav::audio
