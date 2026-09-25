#include "monitoring/MonitorRouter.h"

#include <utility>

namespace meewav::audio {

Status UnavailableMonitorBackend::enable(const MonitorConfiguration&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No CoreAudio/WASAPI monitoring backend is compiled.");
}

MonitorRouter::MonitorRouter(std::unique_ptr<IMonitorBackend> backend)
    : backend_(backend ? std::move(backend) : std::make_unique<UnavailableMonitorBackend>()) {}

MonitorRouter::~MonitorRouter() { disable(); }

Status MonitorRouter::enable(const MonitorConfiguration& configuration) {
  if (configuration.outputDeviceId.empty()) {
    return Status::failure(StatusCode::invalid_argument,
                           "Monitoring requires an explicit output device.");
  }
  const auto status = backend_->enable(configuration);
  enabled_.store(status.isOk(), std::memory_order_release);
  return status;
}

void MonitorRouter::disable() noexcept {
  enabled_.store(false, std::memory_order_release);
  backend_->disable();
}

bool MonitorRouter::isEnabled() const noexcept {
  return enabled_.load(std::memory_order_acquire);
}

}  // namespace meewav::audio
