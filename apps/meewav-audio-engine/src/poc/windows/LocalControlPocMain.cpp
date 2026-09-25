#include "bridge/CommandAuthenticator.h"
#include "bridge/ControlServer.h"
#include "bridge/LocalControlApi.h"
#include "bridge/windows/WindowsCommandCrypto.h"
#include "bridge/windows/WindowsLoopbackHttpTransport.h"
#include "core/Status.h"
#include "diagnostics/Diagnostics.h"
#include "security/OriginPolicy.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include <algorithm>
#include <array>
#include <charconv>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <memory>
#include <ranges>
#include <string>
#include <string_view>
#include <utility>

namespace {

using meewav::audio::CommandSessionConfiguration;
using meewav::audio::ControlServer;
using meewav::audio::Diagnostics;
using meewav::audio::EngineHealth;
using meewav::audio::LocalControlApi;
using meewav::audio::LocalControlRuntimeState;
using meewav::audio::OriginPolicy;
using meewav::audio::SessionCommandAuthenticator;
using meewav::audio::Status;
using meewav::audio::StatusCode;
using meewav::audio::WindowsCommandCrypto;
using meewav::audio::WindowsLoopbackHttpTransport;

constexpr std::uint16_t kDefaultPort = 47'191;
constexpr std::string_view kRunFlag = "--run-internal-control-poc";
constexpr char kSessionIdEnvironment[] = "MEEWAV_AUDIO_CONTROL_SESSION_ID";
constexpr char kSessionSecretEnvironment[] = "MEEWAV_AUDIO_CONTROL_SESSION_SECRET";
constexpr char kOriginEnvironment[] = "MEEWAV_AUDIO_CONTROL_ORIGIN";
constexpr char kPortEnvironment[] = "MEEWAV_AUDIO_CONTROL_PORT";

HANDLE gStopEvent = nullptr;

BOOL WINAPI consoleControlHandler(const DWORD eventType) {
  switch (eventType) {
    case CTRL_C_EVENT:
    case CTRL_BREAK_EVENT:
    case CTRL_CLOSE_EVENT:
    case CTRL_LOGOFF_EVENT:
    case CTRL_SHUTDOWN_EVENT:
      if (gStopEvent != nullptr) {
        SetEvent(gStopEvent);
      }
      return TRUE;
    default:
      return FALSE;
  }
}

void printUsage() {
  std::cout
      << "MeeWav authenticated loopback control POC (Windows x64)\n\n"
      << "Usage:\n"
      << "  meewav-control-poc " << kRunFlag << "\n\n"
      << "Required environment variables (values are never logged):\n"
      << "  " << kSessionIdEnvironment << "      base64url session ID (22-128 chars)\n"
      << "  " << kSessionSecretEnvironment << "  32 random bytes as unpadded base64url\n"
      << "  " << kOriginEnvironment << "          exact allowed Web origin\n"
      << "Optional:\n"
      << "  " << kPortEnvironment << "            loopback port (default 47191)\n\n"
      << "This executable exposes only authenticated HTTP control state. It does not carry PCM, "
         "publish WebRTC, open an audio device, or instantiate a plugin.\n";
}

Status readEnvironment(const char* name, const std::size_t maximumBytes, const bool required,
                       std::string& value) {
  value.clear();
  SetLastError(ERROR_SUCCESS);
  const DWORD requiredBytes = GetEnvironmentVariableA(name, nullptr, 0);
  if (requiredBytes == 0) {
    const DWORD error = GetLastError();
    if (!required && (error == ERROR_ENVVAR_NOT_FOUND || error == ERROR_SUCCESS)) {
      return Status::success();
    }
    return Status::failure(StatusCode::invalid_argument,
                           std::string("Required environment variable is missing: ") + name);
  }
  if (requiredBytes <= 1 || requiredBytes - 1 > maximumBytes) {
    return Status::failure(StatusCode::invalid_argument,
                           std::string("Environment variable has an invalid size: ") + name);
  }
  value.resize(requiredBytes - 1);
  const DWORD copied = GetEnvironmentVariableA(name, value.data(), requiredBytes);
  if (copied != requiredBytes - 1) {
    value.clear();
    return Status::failure(StatusCode::io_error,
                           std::string("Environment variable could not be read safely: ") + name);
  }
  return Status::success();
}

bool isBase64Url(const std::string_view value, const std::size_t minimum,
                 const std::size_t maximum) noexcept {
  return value.size() >= minimum && value.size() <= maximum &&
         std::ranges::all_of(value, [](const unsigned char character) {
           return (character >= 'a' && character <= 'z') ||
                  (character >= 'A' && character <= 'Z') ||
                  (character >= '0' && character <= '9') || character == '-' ||
                  character == '_';
         });
}

bool portSuffixIsSafe(const std::string_view suffix) noexcept {
  if (suffix.empty()) {
    return true;
  }
  if (!suffix.starts_with(':') || suffix.size() == 1 || suffix.size() > 6) {
    return false;
  }
  std::uint32_t port = 0;
  const auto digits = suffix.substr(1);
  const auto parsed = std::from_chars(digits.data(), digits.data() + digits.size(), port);
  return parsed.ec == std::errc{} && parsed.ptr == digits.data() + digits.size() &&
         port >= 1 && port <= 65'535;
}

bool exactOriginIsSafe(const std::string_view origin) noexcept {
  if (origin.size() < 8 || origin.size() > 512 ||
      std::ranges::any_of(origin, [](const unsigned char character) {
        return character <= 0x20 || character == 0x7f;
      })) {
    return false;
  }
  const auto separator = origin.find("://");
  if (separator == std::string_view::npos) {
    return false;
  }
  const auto scheme = origin.substr(0, separator);
  const auto authority = origin.substr(separator + 3);
  if ((scheme != "https" && scheme != "http") || authority.empty() ||
      authority.find_first_of("/?#@") != std::string_view::npos) {
    return false;
  }

  if (scheme == "http") {
    constexpr std::string_view kLocalhost = "localhost";
    constexpr std::string_view kLoopback = "127.0.0.1";
    if (authority.starts_with(kLocalhost)) {
      return portSuffixIsSafe(authority.substr(kLocalhost.size()));
    }
    if (authority.starts_with(kLoopback)) {
      return portSuffixIsSafe(authority.substr(kLoopback.size()));
    }
    return false;
  }

  const auto colon = authority.rfind(':');
  const auto host = colon == std::string_view::npos ? authority : authority.substr(0, colon);
  const auto port = colon == std::string_view::npos ? std::string_view{} : authority.substr(colon);
  return !host.empty() && host.find('.') != std::string_view::npos && portSuffixIsSafe(port) &&
         std::ranges::all_of(host, [](const unsigned char character) {
           return (character >= 'a' && character <= 'z') ||
                  (character >= 'A' && character <= 'Z') ||
                  (character >= '0' && character <= '9') || character == '-' ||
                  character == '.';
         });
}

Status parsePort(const std::string_view value, std::uint16_t& port) noexcept {
  if (value.empty()) {
    port = kDefaultPort;
    return Status::success();
  }
  std::uint32_t parsedPort = 0;
  const auto parsed = std::from_chars(value.data(), value.data() + value.size(), parsedPort);
  if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size() ||
      parsedPort == 0 || parsedPort > 65'535) {
    return Status::failure(StatusCode::invalid_argument,
                           "MEEWAV_AUDIO_CONTROL_PORT must be an integer from 1 to 65535.");
  }
  port = static_cast<std::uint16_t>(parsedPort);
  return Status::success();
}

void eraseSensitiveString(std::string& value) noexcept {
  if (!value.empty()) {
    SecureZeroMemory(value.data(), value.size());
  }
  value.clear();
}

void printFailure(const char* stage, const Status& status) {
  std::cerr << "MeeWav control POC stopped at " << stage << ": " << status.message << '\n';
}

}  // namespace

int main(const int argc, char** argv) {
  SetConsoleOutputCP(CP_UTF8);
  if (argc == 2 && argv[1] != nullptr &&
      (std::string_view(argv[1]) == "--help" || std::string_view(argv[1]) == "-h")) {
    printUsage();
    return 0;
  }
  if (argc != 2 || argv[1] == nullptr || std::string_view(argv[1]) != kRunFlag) {
    printUsage();
    return 2;
  }

  std::string sessionId;
  std::string sessionSecret;
  std::string exactOrigin;
  std::string portText;
  struct EnvironmentBinding final {
    const char* name;
    std::size_t maximumBytes;
    bool required;
    std::string* destination;
  };
  const std::array bindings{
      EnvironmentBinding{kSessionIdEnvironment, 128, true, &sessionId},
      EnvironmentBinding{kSessionSecretEnvironment, 512, true, &sessionSecret},
      EnvironmentBinding{kOriginEnvironment, 512, true, &exactOrigin},
      EnvironmentBinding{kPortEnvironment, 5, false, &portText}};
  for (const auto& binding : bindings) {
    const auto status = readEnvironment(binding.name, binding.maximumBytes, binding.required,
                                        *binding.destination);
    if (!status.isOk()) {
      eraseSensitiveString(sessionSecret);
      printFailure("environment validation", status);
      return 3;
    }
  }

  std::uint16_t port = 0;
  const auto portStatus = parsePort(portText, port);
  if (!portStatus.isOk() || !isBase64Url(sessionId, 22, 128) ||
      !isBase64Url(sessionSecret, 43, 43) || !exactOriginIsSafe(exactOrigin)) {
    eraseSensitiveString(sessionSecret);
    printFailure("configuration validation",
                 portStatus.isOk()
                     ? Status::failure(StatusCode::invalid_argument,
                                       "Session ID, 32-byte secret, or exact Origin is invalid.")
                     : portStatus);
    return 4;
  }
  if (!SetEnvironmentVariableA(kSessionSecretEnvironment, nullptr)) {
    eraseSensitiveString(sessionSecret);
    printFailure("secret environment cleanup",
                 Status::failure(StatusCode::io_error,
                                 "The session secret could not be removed from the environment."));
    return 5;
  }

  gStopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (gStopEvent == nullptr || !SetConsoleCtrlHandler(consoleControlHandler, TRUE)) {
    if (gStopEvent != nullptr) {
      CloseHandle(gStopEvent);
      gStopEvent = nullptr;
    }
    eraseSensitiveString(sessionSecret);
    printFailure("shutdown handler initialization",
                 Status::failure(StatusCode::io_error,
                                 "The control POC could not install its shutdown handler."));
    return 6;
  }

  CommandSessionConfiguration configuration;
  configuration.sessionId = sessionId;
  configuration.encodedSessionSecret = std::move(sessionSecret);
  configuration.exactOrigin = exactOrigin;
  configuration.expiresAt = std::chrono::system_clock::now() + std::chrono::hours(8);

  Diagnostics diagnostics("0.1.0-control-poc");
  diagnostics.setHealth(EngineHealth::warning);
  LocalControlRuntimeState runtimeState(false);
  LocalControlApi api(OriginPolicy({exactOrigin}, false), "0.1.0-control-poc", sessionId,
                      diagnostics, runtimeState);

  auto authenticator = std::make_unique<SessionCommandAuthenticator>(
      OriginPolicy({exactOrigin}, false), std::move(configuration),
      std::make_unique<WindowsCommandCrypto>());
  auto transport = std::make_unique<WindowsLoopbackHttpTransport>();
  ControlServer server(std::move(transport), std::move(authenticator));
  const auto startStatus = server.start(
      "127.0.0.1", port,
      [&api](const meewav::audio::ControlRequest& request) { return api.handle(request); });
  if (!startStatus.isOk()) {
    SetConsoleCtrlHandler(consoleControlHandler, FALSE);
    CloseHandle(gStopEvent);
    gStopEvent = nullptr;
    printFailure("loopback startup", startStatus);
    return 7;
  }

  std::cout << "MeeWav local control POC is listening at http://127.0.0.1:" << port
            << "/v1\n"
            << "  exact Origin: " << exactOrigin << '\n'
            << "  session ID: " << sessionId << '\n'
            << "  audio plane: unavailable\n"
            << "  chain: bypassed (processing backend unavailable)\n"
            << "The browser microphone must remain active. Press Ctrl+C to stop.\n";

  const DWORD waitResult = WaitForSingleObject(gStopEvent, INFINITE);
  server.stop();
  SetConsoleCtrlHandler(consoleControlHandler, FALSE);
  CloseHandle(gStopEvent);
  gStopEvent = nullptr;
  if (waitResult != WAIT_OBJECT_0) {
    printFailure("shutdown wait",
                 Status::failure(StatusCode::io_error,
                                 "The control POC shutdown event failed."));
    return 8;
  }
  return 0;
}
