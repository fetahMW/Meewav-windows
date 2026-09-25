#include "bridge/LocalControlApi.h"

#include <algorithm>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <ranges>
#include <sstream>
#include <string_view>
#include <utility>

namespace meewav::audio {
namespace {

std::string watchdogName(const ControlWatchdogState state) {
  switch (state) {
    case ControlWatchdogState::healthy:
      return "healthy";
    case ControlWatchdogState::timed_out:
      return "timed_out";
    case ControlWatchdogState::not_started:
    default:
      return "not_started";
  }
}

std::string fallbackName(const SafeFallbackAction action) {
  switch (action) {
    case SafeFallbackAction::stop_native_path_require_user_choice:
      return "stop_native_path_require_user_choice";
    case SafeFallbackAction::keep_browser_microphone:
    default:
      return "keep_browser_microphone";
  }
}

std::string healthName(const EngineHealth health) {
  switch (health) {
    case EngineHealth::healthy:
      return "healthy";
    case EngineHealth::warning:
      return "warning";
    case EngineHealth::error:
      return "error";
    case EngineHealth::starting:
      return "starting";
    case EngineHealth::stopped:
    default:
      return "stopped";
  }
}

std::string jsonEscape(const std::string_view value) {
  std::string result;
  result.reserve(value.size() + 8);
  for (const unsigned char character : value) {
    switch (character) {
      case '"':
        result += "\\\"";
        break;
      case '\\':
        result += "\\\\";
        break;
      case '\b':
        result += "\\b";
        break;
      case '\f':
        result += "\\f";
        break;
      case '\n':
        result += "\\n";
        break;
      case '\r':
        result += "\\r";
        break;
      case '\t':
        result += "\\t";
        break;
      default:
        if (character < 0x20) {
          std::ostringstream escaped;
          escaped << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                  << static_cast<int>(character);
          result += escaped.str();
        } else {
          result.push_back(static_cast<char>(character));
        }
    }
  }
  return result;
}

std::string isoTimestamp(const std::chrono::system_clock::time_point value) {
  const std::time_t time = std::chrono::system_clock::to_time_t(value);
  std::tm utc{};
#if defined(_WIN32)
  gmtime_s(&utc, &time);
#else
  gmtime_r(&time, &utc);
#endif
  std::ostringstream output;
  output << std::put_time(&utc, "%Y-%m-%dT%H:%M:%SZ");
  return output.str();
}

std::vector<std::pair<std::string, std::string>> corsHeaders(const std::string& origin) {
  return {{"Access-Control-Allow-Origin", origin},
          {"Access-Control-Allow-Private-Network", "true"},
          {"Vary", "Origin"}};
}

}  // namespace

LocalControlRuntimeState::LocalControlRuntimeState(const bool processingBackendAvailable) {
  state_.processingBackendAvailable = processingBackendAvailable;
  state_.chainBypassed = true;
}

Status LocalControlRuntimeState::setBypassed(const bool bypassed) {
  std::scoped_lock lock(mutex_);
  if (!bypassed && !state_.processingBackendAvailable) {
    return Status::failure(StatusCode::backend_unavailable,
                           "Processing cannot be enabled without an audio/plugin backend.");
  }
  if (state_.chainBypassed != bypassed) {
    state_.chainBypassed = bypassed;
    ++state_.chainRevision;
  }
  return Status::success();
}

void LocalControlRuntimeState::markWatchdogHealthy() noexcept {
  std::scoped_lock lock(mutex_);
  state_.watchdog = ControlWatchdogState::healthy;
}

void LocalControlRuntimeState::markWatchdogTimedOut() noexcept {
  std::scoped_lock lock(mutex_);
  state_.watchdog = ControlWatchdogState::timed_out;
  ++state_.watchdogTimeoutCount;
  if (!state_.chainBypassed) {
    state_.chainBypassed = true;
    ++state_.chainRevision;
  }
  state_.fallback = SafeFallbackAction::stop_native_path_require_user_choice;
}

LocalControlRuntimeSnapshot LocalControlRuntimeState::snapshot() const noexcept {
  std::scoped_lock lock(mutex_);
  return state_;
}

LocalControlApi::LocalControlApi(OriginPolicy originPolicy, std::string engineVersion,
                                 std::string sessionId, Diagnostics& diagnostics,
                                 LocalControlRuntimeState& runtimeState)
    : originPolicy_(std::move(originPolicy)),
      engineVersion_(std::move(engineVersion)),
      sessionId_(std::move(sessionId)),
      diagnostics_(diagnostics),
      runtimeState_(runtimeState),
      startedAt_(std::chrono::steady_clock::now()) {}

ControlResponse LocalControlApi::handle(const ControlRequest& request) {
  if (!originPolicy_.allows(request.origin)) {
    return failure(request, 403, "forbidden_origin", "Browser origin is not allowlisted.");
  }
  if (request.method == "OPTIONS") {
    return handleOptions(request);
  }
  if (!requestIdIsSafe(request.requestId)) {
    return failure(request, 400, "invalid_request", "Request ID is invalid.");
  }

  if (request.method == "GET" && request.route == "/v1/health") {
    const auto uptimeSeconds = std::chrono::duration_cast<std::chrono::seconds>(
                                   std::chrono::steady_clock::now() - startedAt_)
                                   .count();
    return success(
        request,
        "{\"service\":\"meewav-audio-engine\",\"status\":\"degraded\","
        "\"apiVersion\":\"1.0.0\",\"engineVersion\":\"" + jsonEscape(engineVersion_) +
            "\",\"minWebClientVersion\":\"1.0.0\",\"maxWebClientVersion\":null,"
            "\"sessionId\":\"" + jsonEscape(sessionId_) + "\",\"uptimeSeconds\":" +
            std::to_string(uptimeSeconds) + ",\"timestamp\":\"" +
            isoTimestamp(std::chrono::system_clock::now()) +
            "\",\"metersProtocol\":\"websocket-v1\",\"audioPlane\":\"unavailable\","
            "\"roomPublication\":{\"status\":\"unavailable\",\"roomId\":null,"
            "\"trackId\":null,\"publisher\":null,\"publishedAt\":null}}");
  }

  if (request.method == "GET" && request.route == "/v1/diagnostics") {
    const auto diagnostics = diagnostics_.snapshot();
    const auto runtime = runtimeState_.snapshot();
    return success(
        request,
        "{\"health\":\"" + healthName(diagnostics.health) +
            "\",\"audioBackend\":\"unavailable\",\"pluginHost\":\"unavailable\","
            "\"roomBridge\":\"unavailable\",\"bridgeConnected\":" +
            (diagnostics.bridgeConnected ? "true" : "false") +
            ",\"dropoutCount\":" + std::to_string(diagnostics.dropoutCount) +
            ",\"audioCallbackCount\":" + std::to_string(diagnostics.audioCallbackCount) +
            ",\"watchdog\":{\"status\":\"" + watchdogName(runtime.watchdog) +
            "\",\"timeoutCount\":" + std::to_string(runtime.watchdogTimeoutCount) +
            "},\"safeFallback\":\"" + fallbackName(runtime.fallback) + "\"}");
  }

  if (request.method == "GET" && request.route == "/v1/chain") {
    const auto runtime = runtimeState_.snapshot();
    return success(
        request,
        std::string("{\"inputGainDb\":0,\"vocalTuning\":{\"enabled\":false,") +
        "\"provider\":\"antares.autotune\",\"key\":\"C\",\"scale\":\"chromatic\","
        "\"correctionAmount\":0,\"retuneSpeed\":0,\"humanize\":0,\"formant\":0},"
        "\"compressor\":{\"provider\":\"meewav.compressor\",\"amount\":0},"
        "\"reverb\":{\"provider\":\"meewav.reverb\",\"amount\":0},"
        "\"masterGainDb\":-3,\"bypassed\":" +
            (runtime.chainBypassed ? "true" : "false") +
            ",\"revision\":" + std::to_string(runtime.chainRevision) + "}");
  }

  if (request.method == "PUT" && request.route == "/v1/chain/bypass") {
    const auto& body = request.body;
    bool bypassed = true;
    if (body == "{\"bypassed\":true}") {
      bypassed = true;
    } else if (body == "{\"bypassed\":false}") {
      bypassed = false;
    } else {
      return failure(request, 400, "invalid_argument",
                     "Bypass payload must contain one boolean field named bypassed.");
    }
    const auto status = runtimeState_.setBypassed(bypassed);
    if (!status.isOk()) {
      return failure(request, 409, "backend_unavailable", status.message);
    }
    const auto runtime = runtimeState_.snapshot();
    return success(request,
                   "{\"bypassed\":" + std::string(runtime.chainBypassed ? "true" : "false") +
                       ",\"revision\":" + std::to_string(runtime.chainRevision) + "}");
  }

  return failure(request, 404, "not_found", "Control route does not exist.");
}

ControlResponse LocalControlApi::handleOptions(const ControlRequest& request) const {
  auto headers = corsHeaders(request.origin);
  headers.emplace_back("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  headers.emplace_back(
      "Access-Control-Allow-Headers",
      "Content-Type, X-MeeWav-Session, X-MeeWav-Timestamp, X-MeeWav-Nonce, "
      "X-MeeWav-Signature, X-MeeWav-Audio-Api-Major, "
      "X-MeeWav-Audio-Client-Version, X-Request-Id");
  headers.emplace_back("Access-Control-Max-Age", "600");
  return ControlResponse{204, {}, std::move(headers)};
}

ControlResponse LocalControlApi::success(const ControlRequest& request,
                                         std::string dataJson) const {
  return ControlResponse{
      200,
      "{\"ok\":true,\"requestId\":\"" + jsonEscape(request.requestId) +
          "\",\"data\":" + dataJson + "}",
      corsHeaders(request.origin)};
}

ControlResponse LocalControlApi::failure(const ControlRequest& request, const int httpStatus,
                                         std::string code, std::string message) const {
  const std::string requestId = requestIdIsSafe(request.requestId) ? request.requestId
                                                                   : "invalid-request";
  const bool originAllowed = originPolicy_.allows(request.origin);
  return ControlResponse{
      httpStatus,
      "{\"ok\":false,\"requestId\":\"" + jsonEscape(requestId) +
          "\",\"error\":{\"code\":\"" + jsonEscape(code) +
          "\",\"message\":\"" + jsonEscape(message) + "\"}}",
      originAllowed ? corsHeaders(request.origin)
                    : std::vector<std::pair<std::string, std::string>>{}};
}

bool LocalControlApi::requestIdIsSafe(const std::string_view requestId) const noexcept {
  return requestId.size() >= 8 && requestId.size() <= 128 &&
         std::ranges::all_of(requestId, [](const unsigned char character) {
           return (character >= 'a' && character <= 'z') ||
                  (character >= 'A' && character <= 'Z') ||
                  (character >= '0' && character <= '9') || character == '-' ||
                  character == '_';
         });
}

}  // namespace meewav::audio
