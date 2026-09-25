#include "poc/windows/WasapiSharedPeriod.h"

#include <iostream>

namespace {

int fail(const char* message) {
  std::cerr << message << '\n';
  return 1;
}

}  // namespace

int main() {
  using meewav::audio::WasapiSharedPeriodRange;
  using meewav::audio::chooseMinimumSharedPeriodFrames;
  using meewav::audio::wasapiSharedModeDiagnosticToken;

  if (chooseMinimumSharedPeriodFrames({480, 48, 48, 480}) != 48) {
    return fail("The minimum supported engine period was not selected.");
  }
  if (chooseMinimumSharedPeriodFrames({960, 48, 144, 960}) != 144) {
    return fail("A device-specific minimum period was not preserved.");
  }
  if (chooseMinimumSharedPeriodFrames({480, 0, 48, 480}) != 0 ||
      chooseMinimumSharedPeriodFrames({480, 48, 0, 480}) != 0 ||
      chooseMinimumSharedPeriodFrames({480, 48, 528, 480}) != 0) {
    return fail("Malformed or empty engine period ranges were not rejected.");
  }
  if (chooseMinimumSharedPeriodFrames({480, 48, 50, 480}) != 0 ||
      chooseMinimumSharedPeriodFrames({482, 48, 48, 480}) != 0) {
    return fail("Periods not aligned to the fundamental period were not rejected.");
  }
  if (wasapiSharedModeDiagnosticToken(true) != "low-latency-shared" ||
      wasapiSharedModeDiagnosticToken(false) != "legacy-shared") {
    return fail("WASAPI mode diagnostics do not distinguish low-latency and fallback paths.");
  }

  std::cout << "WASAPI shared period tests passed.\n";
  return 0;
}
