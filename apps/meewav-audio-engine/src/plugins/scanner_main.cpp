#include "plugins/PluginScanner.h"

#include <iostream>
#include <string_view>

int main(const int argc, const char* const* argv) {
  if (argc == 2 && std::string_view(argv[1]) == "--contract-version") {
    std::cout << meewav::audio::kPluginScannerContractVersion << '\n';
    return 0;
  }

  // This process intentionally accepts no filesystem path from a browser or caller.
  // A future signed backend will scan only OS-standard VST3 locations and emit a
  // versioned binary/JSON response over an inherited pipe.
  std::cerr
      << R"({"contractVersion":1,"status":"backend_unavailable","plugins":[],"message":"No VST3 scanner backend is compiled."})"
      << '\n';
  return 2;
}
