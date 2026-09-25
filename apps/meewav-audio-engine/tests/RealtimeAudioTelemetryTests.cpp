#include "poc/windows/RealtimeAudioTelemetry.h"

#include <cmath>
#include <iostream>

namespace {

bool approximatelyEqual(const double left, const double right, const double tolerance) {
  return std::abs(left - right) <= tolerance;
}

int fail(const char* message) {
  std::cerr << message << '\n';
  return 1;
}

}  // namespace

int main() {
  meewav::audio::RealtimeLevelWindow meter;

  constexpr float kHalfScale[] = {0.5F, -0.5F, 0.5F, -0.5F};
  meter.add(kHalfScale, 4);
  const auto halfScale = meter.consume();
  if (halfScale.sampleCount != 4 ||
      !approximatelyEqual(halfScale.peakLinear, 0.5, 0.0001) ||
      !approximatelyEqual(halfScale.rmsLinear, 0.5, 0.0001)) {
    return fail("Half-scale peak/RMS telemetry was not preserved.");
  }

  const auto consumed = meter.consume();
  if (consumed.sampleCount != 0 || consumed.peakLinear != 0.0 || consumed.rmsLinear != 0.0) {
    return fail("Consuming a telemetry window did not reset it.");
  }

  constexpr float kClippedAndInvalid[] = {2.0F, -2.0F, NAN};
  meter.add(kClippedAndInvalid, 3);
  const auto clipped = meter.consume();
  if (clipped.sampleCount != 3 || !approximatelyEqual(clipped.peakLinear, 1.0, 0.0001) ||
      !approximatelyEqual(clipped.rmsLinear, std::sqrt(2.0 / 3.0), 0.0001)) {
    return fail("Telemetry did not clamp out-of-range samples or reject NaN safely.");
  }

  if (!approximatelyEqual(meewav::audio::linearLevelToDbfs(1.0), 0.0, 0.0001) ||
      !approximatelyEqual(meewav::audio::linearLevelToDbfs(0.5), -6.0206, 0.001) ||
      meewav::audio::linearLevelToDbfs(0.0) != -120.0) {
    return fail("dBFS conversion does not respect unity, half-scale and the meter floor.");
  }

  std::cout << "Realtime audio telemetry tests passed.\n";
  return 0;
}
