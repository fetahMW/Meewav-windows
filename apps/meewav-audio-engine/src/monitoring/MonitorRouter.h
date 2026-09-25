#pragma once

#include "core/Status.h"

#include <atomic>
#include <memory>
#include <string>

namespace meewav::audio {

struct MonitorConfiguration final {
  std::string outputDeviceId;
  float gainDb{-6.0F};
};

class IMonitorBackend {
 public:
  virtual ~IMonitorBackend() = default;
  virtual Status enable(const MonitorConfiguration& configuration) = 0;
  virtual void disable() noexcept = 0;
};

class UnavailableMonitorBackend final : public IMonitorBackend {
 public:
  Status enable(const MonitorConfiguration& configuration) override;
  void disable() noexcept override {}
};

class MonitorRouter final {
 public:
  explicit MonitorRouter(std::unique_ptr<IMonitorBackend> backend);
  ~MonitorRouter();

  Status enable(const MonitorConfiguration& configuration);
  void disable() noexcept;
  [[nodiscard]] bool isEnabled() const noexcept;

 private:
  std::unique_ptr<IMonitorBackend> backend_;
  std::atomic<bool> enabled_{false};
};

}  // namespace meewav::audio
