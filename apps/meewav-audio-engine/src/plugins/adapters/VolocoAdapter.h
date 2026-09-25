#pragma once

#include "plugins/adapters/PluginAdapter.h"

namespace meewav::audio {

class VolocoAdapter final : public MetadataDrivenPluginAdapter {
 public:
  // Rules must come from a versioned profile created from a real plugin scan.
  // There are deliberately no guessed class IDs or parameter IDs in code.
  explicit VolocoAdapter(PluginAdapterRules verifiedRules);
};

}  // namespace meewav::audio
