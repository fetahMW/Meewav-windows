#include "plugins/PluginRegistry.h"
#include "plugins/PluginScanner.h"

#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace {

using meewav::audio::IScannerProcessTransport;
using meewav::audio::PluginAllowlistEntry;
using meewav::audio::PluginArchitecture;
using meewav::audio::PluginDescriptor;
using meewav::audio::PluginLicenseStatus;
using meewav::audio::PluginRegistry;
using meewav::audio::PluginScanRequest;
using meewav::audio::PluginScanResponse;
using meewav::audio::PluginScanner;
using meewav::audio::Status;
using meewav::audio::StatusCode;

int failures = 0;

void expect(const bool condition, const std::string& message) {
  if (!condition) {
    ++failures;
    std::cerr << "FAIL: " << message << '\n';
  }
}

class RecordingScannerTransport final : public IScannerProcessTransport {
 public:
  explicit RecordingScannerTransport(bool& called, PluginScanRequest& captured)
      : called_(called), captured_(captured) {}

  PluginScanResponse runIsolated(const PluginScanRequest& request) override {
    called_ = true;
    captured_ = request;
    return PluginScanResponse{Status::success(), {}};
  }

 private:
  bool& called_;
  PluginScanRequest& captured_;
};

PluginScanner makeRecordingScanner(bool& called, PluginScanRequest& captured) {
  return PluginScanner(std::make_unique<RecordingScannerTransport>(called, captured));
}

PluginDescriptor verifiedDescriptor() {
  PluginDescriptor descriptor;
  descriptor.pluginId = "vendor.pitch";
  descriptor.classId = "verified-class-id";
  descriptor.vendor = "Verified Vendor";
  descriptor.name = "Pitch";
  descriptor.version = "1.0.0";
  descriptor.architecture = PluginArchitecture::x64;
  descriptor.available = true;
  descriptor.licenseStatus = PluginLicenseStatus::activated;
  descriptor.internalInstallationToken = "scanner-issued-token";
  return descriptor;
}

void testCanonicalPluginIds() {
  expect(meewav::audio::isCanonicalPluginId("antares.autotune"),
         "a canonical dotted plugin ID must be accepted");
  expect(meewav::audio::isCanonicalPluginId("sixthsample.spoton"),
         "the Spoton canonical plugin ID must be accepted");
  expect(meewav::audio::isCanonicalPluginId("auburnsounds.graillon3"),
         "the Graillon 3 canonical plugin ID must be accepted");
  expect(meewav::audio::isCanonicalPluginId("vendor.product-2_beta"),
         "the schema's lowercase suffix characters must be accepted");
  expect(!meewav::audio::isCanonicalPluginId("A.vendor"),
         "uppercase IDs must be rejected");
  expect(!meewav::audio::isCanonicalPluginId("../plugin"),
         "relative filesystem paths must be rejected");
  expect(!meewav::audio::isCanonicalPluginId("c:\\plugin"),
         "Windows filesystem paths must be rejected");
  expect(!meewav::audio::isCanonicalPluginId("vendor..plugin"),
         "empty canonical ID segments must be rejected");
  expect(!meewav::audio::isCanonicalPluginId("vendor."),
         "trailing canonical ID separators must be rejected");
  expect(!meewav::audio::isCanonicalPluginId("a"),
         "IDs shorter than the wire schema minimum must be rejected");
  expect(!meewav::audio::isCanonicalPluginId(std::string(129, 'a')),
         "IDs longer than the wire schema maximum must be rejected");
}

void testScannerRejectsBeforeTransport() {
  bool called = false;
  PluginScanRequest captured;
  auto scanner = makeRecordingScanner(called, captured);

  const auto empty = scanner.scan({});
  expect(empty.status.code == StatusCode::invalid_argument,
         "an empty scan target list must fail closed");
  expect(!called, "empty input must not reach the scanner transport");

  const auto path = scanner.scan({"../Auto-Tune.vst3"});
  expect(path.status.code == StatusCode::invalid_argument,
         "a path-shaped target must fail closed");
  expect(!called, "a path-shaped target must not reach the scanner transport");

  std::vector<std::string> tooMany(meewav::audio::kMaxPluginScanTargets + 1, "vendor.pitch");
  const auto oversized = scanner.scan(tooMany);
  expect(oversized.status.code == StatusCode::invalid_argument,
         "an oversized target list must fail closed before de-duplication");
  expect(!called, "an oversized target list must not reach the scanner transport");
}

void testScannerNormalizesCanonicalTargets() {
  bool called = false;
  PluginScanRequest captured;
  auto scanner = makeRecordingScanner(called, captured);

  const auto response = scanner.scan({"vendor.zeta", "vendor.alpha", "vendor.zeta"});
  expect(response.status.isOk(), "canonical scan targets must reach the transport");
  expect(called, "canonical scan targets must invoke the scanner transport");
  expect(captured.contractVersion == meewav::audio::kPluginScannerContractVersion,
         "the native request must carry the current scanner contract version");
  expect(captured.allowlistedPluginIds ==
             std::vector<std::string>{"vendor.alpha", "vendor.zeta"},
         "scan targets must be sorted and de-duplicated");
  expect(captured.perPluginTimeout.count() == 10'000,
         "the parent request must retain the bounded per-plugin deadline");
}

void testRegistryKeepsOpaqueLocatorPrivateAndTransactional() {
  PluginRegistry registry;
  PluginAllowlistEntry entry;
  entry.pluginId = "vendor.pitch";
  entry.vendor = "Verified Vendor";
  entry.verifiedClassIds.insert("verified-class-id");
  entry.enabled = true;
  registry.setAllowlist({std::move(entry)});

  const auto accepted = registry.replaceScanResults({verifiedDescriptor()});
  expect(accepted.isOk(), "an exact enabled vendor/class match must enter the registry");
  const auto publicPlugins = registry.publicPlugins();
  expect(publicPlugins.size() == 1, "the verified plugin must have one public summary");
  expect(publicPlugins.size() == 1 && publicPlugins.front().pluginId == "vendor.pitch",
         "the public summary must expose only the canonical identity");
  const auto internal = registry.findInternal("vendor.pitch");
  expect(internal.has_value() &&
             internal->internalInstallationToken == "scanner-issued-token",
         "the opaque locator must remain available only through the internal lookup");

  auto missingToken = verifiedDescriptor();
  missingToken.internalInstallationToken.clear();
  const auto rejected = registry.replaceScanResults({std::move(missingToken)});
  expect(rejected.code == StatusCode::invalid_argument,
         "a verified identity without a scanner token must fail closed");
  expect(registry.findInternal("vendor.pitch").has_value(),
         "a rejected scan replacement must not erase the last verified registry snapshot");
}

}  // namespace

int main() {
  testCanonicalPluginIds();
  testScannerRejectsBeforeTransport();
  testScannerNormalizesCanonicalTargets();
  testRegistryKeepsOpaqueLocatorPrivateAndTransactional();

  if (failures != 0) {
    std::cerr << failures << " contract test(s) failed.\n";
    return EXIT_FAILURE;
  }
  std::cout << "MeeWav audio plugin security contracts: OK\n";
  return EXIT_SUCCESS;
}
