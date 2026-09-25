#include "audio/AudioTypes.h"
#include "audio/MeeWavReverb.h"
#include "audio/SafetyLimiter.h"

#include <array>
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <new>

namespace {

std::atomic<std::size_t> gAllocationCount{0};

void fail(const char* message) {
  std::cerr << "MeeWavReverbTests: " << message << '\n';
  std::exit(1);
}

template <std::size_t Size>
float processImpulse(meewav::audio::MeeWavReverb& reverb,
                     const meewav::audio::MeeWavReverbSettings& settings,
                     std::array<float, Size>& left, std::array<float, Size>& right) {
  left.fill(0.0F);
  right.fill(0.0F);
  left[0] = 0.8F;
  right[0] = 0.8F;
  float tailEnergy = 0.0F;
  for (std::size_t block = 0; block < 320U; ++block) {
    reverb.processStereo(left.data(), right.data(), static_cast<std::uint32_t>(Size), settings);
    if (block > 4U) {
      for (std::size_t frame = 0; frame < Size; ++frame) {
        tailEnergy += std::abs(left[frame]) + std::abs(right[frame]);
      }
    }
    left.fill(0.0F);
    right.fill(0.0F);
  }
  return tailEnergy;
}

}  // namespace

void* operator new(const std::size_t size) {
  gAllocationCount.fetch_add(1U, std::memory_order_relaxed);
  if (auto* memory = std::malloc(size)) {
    return memory;
  }
  throw std::bad_alloc();
}

void* operator new[](const std::size_t size) {
  gAllocationCount.fetch_add(1U, std::memory_order_relaxed);
  if (auto* memory = std::malloc(size)) {
    return memory;
  }
  throw std::bad_alloc();
}

void operator delete(void* memory) noexcept { std::free(memory); }
void operator delete[](void* memory) noexcept { std::free(memory); }
void operator delete(void* memory, std::size_t) noexcept { std::free(memory); }
void operator delete[](void* memory, std::size_t) noexcept { std::free(memory); }

int main() {
  constexpr std::uint32_t kFrames = 256U;
  std::array<float, kFrames> left{};
  std::array<float, kFrames> right{};
  meewav::audio::MeeWavReverb reverb;
  reverb.prepare(48'000.0, kFrames);
  if (!reverb.isPrepared()) {
    fail("prepare did not create the fixed delay storage");
  }

  for (std::uint32_t frame = 0; frame < kFrames; ++frame) {
    left[frame] = std::sin(static_cast<float>(frame) * 0.07F) * 0.4F;
    right[frame] = std::cos(static_cast<float>(frame) * 0.09F) * 0.3F;
  }
  const auto dryLeft = left;
  const auto dryRight = right;
  reverb.processStereo(left.data(), right.data(), kFrames, {});
  if (left != dryLeft || right != dryRight) {
    fail("disabled reverb is not sample-exact dry");
  }

  const meewav::audio::MeeWavReverbSettings room{
      true, 0.65F, meewav::audio::MeeWavReverbType::room, 1.0F, 12.0F};
  const auto allocationsBefore = gAllocationCount.load(std::memory_order_relaxed);
  for (std::uint32_t block = 0; block < 64U; ++block) {
    reverb.processStereo(left.data(), right.data(), kFrames, room);
  }
  if (gAllocationCount.load(std::memory_order_relaxed) != allocationsBefore) {
    fail("audio processing allocated heap memory");
  }

  reverb.reset();
  const auto roomEnergy = processImpulse(reverb, room, left, right);
  reverb.reset();
  const meewav::audio::MeeWavReverbSettings hall{
      true, 0.65F, meewav::audio::MeeWavReverbType::hall, 3.8F, 42.0F};
  const auto hallEnergy = processImpulse(reverb, hall, left, right);
  if (!(roomEnergy > 0.01F && hallEnergy > roomEnergy * 1.08F)) {
    fail("Room/Hall impulse responses do not produce distinct real tails");
  }

  reverb.reset();
  left.fill(0.0F);
  right.fill(0.0F);
  left[0] = 8.0F;
  right[0] = -8.0F;
  const meewav::audio::MeeWavReverbSettings plate{
      true, 1.0F, meewav::audio::MeeWavReverbType::plate, 2.2F, 0.0F};
  reverb.processStereo(left.data(), right.data(), kFrames, plate);
  meewav::audio::SafetyLimiter limiter;
  limiter.prepare(48'000.0, kFrames, 2U);
  limiter.setCeilingDb(-1.0F);
  std::array<float*, 2> channels{left.data(), right.data()};
  limiter.process(meewav::audio::AudioBlock{channels.data(), 2U, kFrames, 48'000.0});
  constexpr float kCeiling = 0.892F;
  for (std::uint32_t frame = 0; frame < kFrames; ++frame) {
    if (!std::isfinite(left[frame]) || !std::isfinite(right[frame]) ||
        std::abs(left[frame]) > kCeiling || std::abs(right[frame]) > kCeiling) {
      fail("post-reverb safety limiter did not contain the signal");
    }
  }

  std::cout << "MeeWavReverbTests: OK\n";
  return 0;
}
