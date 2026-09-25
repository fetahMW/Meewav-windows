#pragma once

#include "audio/AudioTypes.h"
#include "core/Status.h"
#include "plugins/PluginDescriptor.h"
#include "plugins/PluginState.h"

#include <string>

namespace meewav::audio {

class IPluginInstance : public IAudioProcessor {
 public:
  ~IPluginInstance() override = default;
  [[nodiscard]] virtual const PluginDescriptor& descriptor() const noexcept = 0;
  virtual Status setNormalizedParameter(const std::string& stableParameterId,
                                        double normalizedValue) = 0;
  [[nodiscard]] virtual Status getState(PluginState& state) const = 0;
  virtual Status setState(const PluginState& state) = 0;
  virtual void setBypassed(bool bypassed) noexcept = 0;
  [[nodiscard]] virtual bool isBypassed() const noexcept = 0;
};

}  // namespace meewav::audio
