#pragma once

#include "bridge/CommandAuthenticator.h"

namespace meewav::audio {

// Windows CNG implementation used by the internal loopback control POC.
// All work happens on the control thread, never in the audio callback.
class WindowsCommandCrypto final : public ICommandCrypto {
 public:
  Status sha256Hex(std::string_view input, std::string& digestHex) override;
  Status verifyHmacSha256Base64Url(std::string_view encodedSecret,
                                   std::string_view canonicalMessage,
                                   std::string_view encodedSignature) override;
};

}  // namespace meewav::audio
