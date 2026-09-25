#include "plugins/adapters/VolocoAdapter.h"

#include <utility>

namespace meewav::audio {

VolocoAdapter::VolocoAdapter(PluginAdapterRules verifiedRules)
    : MetadataDrivenPluginAdapter(std::move(verifiedRules)) {}

}  // namespace meewav::audio
