#include "plugins/adapters/AntaresAdapter.h"

#include <utility>

namespace meewav::audio {

AntaresAdapter::AntaresAdapter(PluginAdapterRules verifiedRules)
    : MetadataDrivenPluginAdapter(std::move(verifiedRules)) {}

}  // namespace meewav::audio
