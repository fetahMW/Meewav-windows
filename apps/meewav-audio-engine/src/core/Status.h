#pragma once

#include <string>
#include <utility>

namespace meewav::audio {

enum class StatusCode {
  ok,
  invalid_argument,
  unauthorized,
  forbidden_origin,
  backend_unavailable,
  device_unavailable,
  plugin_not_found,
  plugin_not_activated,
  plugin_incompatible,
  timeout,
  io_error,
  internal_error,
};

struct Status final {
  StatusCode code{StatusCode::ok};
  std::string message{};

  [[nodiscard]] bool isOk() const noexcept { return code == StatusCode::ok; }

  static Status success() { return {}; }
  static Status failure(StatusCode errorCode, std::string detail) {
    return Status{errorCode, std::move(detail)};
  }
};

}  // namespace meewav::audio
