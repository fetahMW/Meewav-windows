#include "bridge/CommandAuthenticator.h"
#include "bridge/ControlServer.h"
#include "bridge/LocalControlApi.h"
#include "diagnostics/Diagnostics.h"
#include "security/OriginPolicy.h"

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>

#include "bridge/windows/WindowsCommandCrypto.h"
#include "bridge/windows/WindowsLoopbackHttpTransport.h"
#endif

#include <array>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <climits>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <string_view>
#include <utility>

namespace {

using meewav::audio::CommandSessionConfiguration;
using meewav::audio::ControlHandler;
using meewav::audio::ControlRequest;
using meewav::audio::ControlResponse;
using meewav::audio::ControlServer;
using meewav::audio::ControlWatchdogState;
using meewav::audio::Diagnostics;
using meewav::audio::EngineHealth;
using meewav::audio::ICommandCrypto;
using meewav::audio::IControlTransport;
using meewav::audio::LocalControlApi;
using meewav::audio::LocalControlRuntimeState;
using meewav::audio::OriginPolicy;
using meewav::audio::SafeFallbackAction;
using meewav::audio::SessionCommandAuthenticator;
using meewav::audio::Status;
using meewav::audio::StatusCode;

constexpr std::int64_t kNowMilliseconds = 1'700'000'000'000;
const std::string kOrigin = "https://app.meewav.test";
const std::string kSessionId(22, 'S');
const std::string kSessionSecret(43, 'K');
const std::string kValidSignature(43, 's');
const std::string kBodyDigest(64, 'a');

int failures = 0;

void expect(const bool condition, const std::string& message) {
  if (!condition) {
    ++failures;
    std::cerr << "FAIL: " << message << '\n';
  }
}

bool contains(const std::string& value, const std::string_view expected) {
  return value.find(expected) != std::string::npos;
}

bool hasHeader(const ControlResponse& response, const std::string_view name,
               const std::string_view value) {
  for (const auto& [headerName, headerValue] : response.headers) {
    if (headerName == name && headerValue == value) {
      return true;
    }
  }
  return false;
}

std::chrono::system_clock::time_point fixedNow() {
  return std::chrono::system_clock::time_point(std::chrono::milliseconds(kNowMilliseconds));
}

ControlRequest signedRequest(std::string nonce = std::string(24, 'n')) {
  ControlRequest request;
  request.method = "GET";
  request.route = "/v1/health";
  request.origin = kOrigin;
  request.requestId = "request_12345678";
  request.sessionId = kSessionId;
  request.timestampMilliseconds = std::to_string(kNowMilliseconds);
  request.nonce = std::move(nonce);
  request.signature = kValidSignature;
  return request;
}

CommandSessionConfiguration sessionConfiguration() {
  CommandSessionConfiguration configuration;
  configuration.sessionId = kSessionId;
  configuration.encodedSessionSecret = kSessionSecret;
  configuration.exactOrigin = kOrigin;
  configuration.expiresAt = fixedNow() + std::chrono::hours(1);
  configuration.maximumTrackedNonces = 16;
  return configuration;
}

class DeterministicCommandCrypto final : public ICommandCrypto {
 public:
  Status sha256Hex(const std::string_view input, std::string& digestHex) override {
    lastBody = std::string(input);
    digestHex = kBodyDigest;
    return Status::success();
  }

  Status verifyHmacSha256Base64Url(const std::string_view encodedSecret,
                                   const std::string_view canonicalMessage,
                                   const std::string_view encodedSignature) override {
    lastCanonical = std::string(canonicalMessage);
    if (encodedSecret == kSessionSecret && encodedSignature == kValidSignature) {
      return Status::success();
    }
    return Status::failure(StatusCode::unauthorized, "test signature mismatch");
  }

  std::string lastBody;
  std::string lastCanonical;
};

std::unique_ptr<SessionCommandAuthenticator> makeAuthenticator(
    DeterministicCommandCrypto** capturedCrypto = nullptr) {
  auto crypto = std::make_unique<DeterministicCommandCrypto>();
  if (capturedCrypto != nullptr) {
    *capturedCrypto = crypto.get();
  }
  return std::make_unique<SessionCommandAuthenticator>(
      OriginPolicy({kOrigin}, false), sessionConfiguration(), std::move(crypto),
      [] { return fixedNow(); });
}

void testSessionCommandAuthentication() {
  DeterministicCommandCrypto* crypto = nullptr;
  auto authenticator = makeAuthenticator(&crypto);
  auto request = signedRequest();
  request.body = "{\"bypassed\":true}";
  expect(authenticator->authorize(request).isOk(),
         "a fresh exact-origin request with a valid session signature must be authorized");
  expect(crypto != nullptr && crypto->lastBody == request.body,
         "the authenticator must hash the exact transmitted body bytes");
  const auto expectedCanonical = request.method + "\n" + request.route + "\n" +
                                 request.timestampMilliseconds + "\n" + request.nonce +
                                 "\n" + kBodyDigest;
  expect(crypto != nullptr && crypto->lastCanonical == expectedCanonical,
         "the native HMAC canonicalization must match the Web client contract");
  expect(authenticator->authorize(request).code == StatusCode::unauthorized,
         "a verified nonce must be rejected on replay");

  auto wrongOrigin = signedRequest(std::string(24, 'o'));
  wrongOrigin.origin = "https://evil.example";
  expect(authenticator->authorize(wrongOrigin).code == StatusCode::forbidden_origin,
         "an origin outside the exact allowlist must be rejected before HMAC acceptance");

  auto stale = signedRequest(std::string(24, 't'));
  stale.timestampMilliseconds = std::to_string(kNowMilliseconds - 30'001);
  expect(authenticator->authorize(stale).code == StatusCode::unauthorized,
         "a command outside the configured clock-skew window must be rejected");

  auto unsafeRoute = signedRequest(std::string(24, 'r'));
  unsafeRoute.route = "/v1/../../plugin.dll";
  expect(authenticator->authorize(unsafeRoute).code == StatusCode::unauthorized,
         "path-shaped command routes must fail closed");

  auto badSignature = signedRequest(std::string(24, 'b'));
  badSignature.signature = std::string(43, 'x');
  expect(authenticator->authorize(badSignature).code == StatusCode::unauthorized,
         "an invalid HMAC signature must be rejected");
  badSignature.signature = kValidSignature;
  expect(authenticator->authorize(badSignature).isOk(),
         "an invalid signature must not poison the replay cache for the same nonce");

  auto movingNow = fixedNow();
  auto futureCrypto = std::make_unique<DeterministicCommandCrypto>();
  SessionCommandAuthenticator futureAuthenticator(
      OriginPolicy({kOrigin}, false), sessionConfiguration(), std::move(futureCrypto),
      [&movingNow] { return movingNow; });
  auto futureDated = signedRequest(std::string(24, 'f'));
  futureDated.timestampMilliseconds = std::to_string(kNowMilliseconds + 29'000);
  expect(futureAuthenticator.authorize(futureDated).isOk(),
         "a command inside the positive clock-skew boundary may be accepted once");
  movingNow += std::chrono::milliseconds(30'001);
  expect(futureAuthenticator.authorize(futureDated).code == StatusCode::unauthorized,
         "a future-dated command nonce must remain blocked for its full acceptance window");
}

void testFailClosedControlApi() {
  Diagnostics diagnostics("0.1.0-control-test");
  diagnostics.setHealth(EngineHealth::warning);
  LocalControlRuntimeState runtime(false);
  LocalControlApi api(OriginPolicy({kOrigin}, false), "0.1.0-control-test", kSessionId,
                      diagnostics, runtime);

  auto request = signedRequest();
  auto response = api.handle(request);
  expect(response.httpStatus == 200, "health must be available on the authenticated API");
  expect(contains(response.body, "\"audioPlane\":\"unavailable\""),
         "health must never imply a PCM or Room audio route");
  expect(contains(response.body,
                  "\"roomPublication\":{\"status\":\"unavailable\""),
         "health must expose explicit unavailable Room publication evidence");
  expect(hasHeader(response, "Access-Control-Allow-Origin", kOrigin),
         "successful responses must carry the exact allowlisted Origin");

  request.route = "/v1/diagnostics";
  response = api.handle(request);
  expect(response.httpStatus == 200 &&
             contains(response.body, "\"audioBackend\":\"unavailable\"") &&
             contains(response.body, "\"roomBridge\":\"unavailable\""),
         "diagnostics must truthfully report unavailable native backends");
  expect(contains(response.body, "\"safeFallback\":\"keep_browser_microphone\""),
         "diagnostics must tell the browser to retain its microphone by default");

  request.route = "/v1/chain";
  response = api.handle(request);
  expect(response.httpStatus == 200 && contains(response.body, "\"bypassed\":true"),
         "the canonical chain must start bypassed");

  request.method = "PUT";
  request.route = "/v1/chain/bypass";
  request.body = "{\"bypassed\":false}";
  response = api.handle(request);
  expect(response.httpStatus == 409 &&
             contains(response.body, "\"code\":\"backend_unavailable\""),
         "unbypass must fail closed while no processing backend exists");
  expect(runtime.snapshot().chainBypassed,
         "a rejected unbypass command must leave the chain dry/bypassed");

  request.body = "{\"bypassed\":true}";
  response = api.handle(request);
  expect(response.httpStatus == 200 && contains(response.body, "\"bypassed\":true"),
         "an explicit bypass command must remain safe and idempotent");

  request.body = "{\"by passed\":true}";
  response = api.handle(request);
  expect(response.httpStatus == 400,
         "whitespace inside a JSON key must not be normalized into an accepted command");

  request.method = "OPTIONS";
  request.body.clear();
  response = api.handle(request);
  expect(response.httpStatus == 204 && response.body.empty(),
         "an exact-origin private-network preflight must return no content");
  expect(hasHeader(response, "Access-Control-Allow-Methods", "GET, PUT, OPTIONS"),
         "preflight must advertise only the implemented methods");
  bool exposesVersionHeaders = false;
  for (const auto& [name, value] : response.headers) {
    if (name == "Access-Control-Allow-Headers" &&
        contains(value, "X-MeeWav-Audio-Api-Major") &&
        contains(value, "X-MeeWav-Audio-Client-Version")) {
      exposesVersionHeaders = true;
    }
  }
  expect(exposesVersionHeaders,
         "preflight must allow the version headers sent by the Web client");

  request.origin = "https://evil.example";
  response = api.handle(request);
  expect(response.httpStatus == 403 && response.headers.empty(),
         "a forbidden Origin must receive neither data nor an allow-origin header");
}

void testWatchdogDryFallbackTransition() {
  LocalControlRuntimeState runtime(true);
  expect(runtime.setBypassed(false).isOk(),
         "the state model may represent an active chain only when a backend exists");
  runtime.markWatchdogHealthy();
  runtime.markWatchdogTimedOut();
  const auto snapshot = runtime.snapshot();
  expect(snapshot.chainBypassed,
         "a watchdog timeout must force the represented processing chain to bypass");
  expect(snapshot.watchdog == ControlWatchdogState::timed_out &&
             snapshot.watchdogTimeoutCount == 1,
         "the diagnostics state must preserve the watchdog timeout event");
  expect(snapshot.fallback == SafeFallbackAction::stop_native_path_require_user_choice,
         "a timeout must require an explicit user choice before any native route resumes");
}

class CapturingTransport final : public IControlTransport {
 public:
  Status listen(const std::string& bindAddress, const std::uint16_t port,
                ControlHandler handler) override {
    address = bindAddress;
    boundPort = port;
    capturedHandler = std::move(handler);
    return Status::success();
  }

  void stop() noexcept override { stopped = true; }

  std::string address;
  std::uint16_t boundPort{0};
  ControlHandler capturedHandler;
  bool stopped{false};
};

void testControlServerAuthenticationGuard() {
  auto rejectedTransport = std::make_unique<CapturingTransport>();
  auto* capturedRejectedTransport = rejectedTransport.get();
  ControlServer rejectedServer(std::move(rejectedTransport), makeAuthenticator());
  const auto unusedHandler = [](const ControlRequest&) {
    return ControlResponse{200, "{\"ok\":true}"};
  };
  expect(rejectedServer.start("0.0.0.0", 47'191, unusedHandler).code ==
                 StatusCode::invalid_argument &&
             !capturedRejectedTransport->capturedHandler,
         "ControlServer must reject wildcard/non-loopback bind addresses before transport");
  expect(rejectedServer.start("127.0.0.1", 0, unusedHandler).code ==
                 StatusCode::invalid_argument &&
             !capturedRejectedTransport->capturedHandler,
         "ControlServer must reject an unspecified production control port");

  auto transport = std::make_unique<CapturingTransport>();
  auto* capturedTransport = transport.get();
  ControlServer server(std::move(transport), makeAuthenticator());
  int handled = 0;
  const auto start = server.start(
      "127.0.0.1", 47'191, [&handled](const ControlRequest&) {
        ++handled;
        return ControlResponse{200, "{\"ok\":true}"};
      });
  expect(start.isOk() && capturedTransport->address == "127.0.0.1" &&
             capturedTransport->boundPort == 47'191 && capturedTransport->capturedHandler,
         "ControlServer must install its authentication guard on explicit loopback");

  auto valid = signedRequest(std::string(24, 'g'));
  expect(capturedTransport->capturedHandler(valid).httpStatus == 200 && handled == 1,
         "a valid signed command must reach the route handler exactly once");
  expect(capturedTransport->capturedHandler(valid).httpStatus == 401 && handled == 1,
         "a replayed signed command must be stopped before the route handler");

  auto wrongOrigin = signedRequest(std::string(24, 'e'));
  wrongOrigin.origin = "https://evil.example";
  expect(capturedTransport->capturedHandler(wrongOrigin).httpStatus == 403 && handled == 1,
         "a forbidden Origin must be mapped to HTTP 403 before the route handler");

  auto preflight = signedRequest(std::string(24, 'p'));
  preflight.method = "OPTIONS";
  preflight.sessionId.clear();
  preflight.signature.clear();
  expect(capturedTransport->capturedHandler(preflight).httpStatus == 200 && handled == 2,
         "preflight must reach the route-level exact-Origin policy without session HMAC");

  server.stop();
  expect(capturedTransport->stopped, "ControlServer::stop must close its transport");
}

#if defined(_WIN32)

using meewav::audio::WindowsCommandCrypto;
using meewav::audio::WindowsLoopbackHttpTransport;

void testWindowsCryptoProvider() {
  WindowsCommandCrypto crypto;
  std::string digest;
  expect(crypto.sha256Hex("", digest).isOk() &&
             digest == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
         "Windows CNG must compute the standard SHA-256 empty-input vector");

  constexpr std::string_view kZeroKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  constexpr std::string_view kMessage = "MeeWav control contract";
  constexpr std::string_view kSignature = "CLFqzs-wLx8TauXWecXs2VHO6Bqxt3j5ZoYRh6fWHjQ";
  expect(crypto.verifyHmacSha256Base64Url(kZeroKey, kMessage, kSignature).isOk(),
         "Windows CNG must verify the fixed 32-byte-key HMAC-SHA-256 vector");
  expect(crypto.verifyHmacSha256Base64Url(
                    kZeroKey, kMessage,
                    "DLFqzs-wLx8TauXWecXs2VHO6Bqxt3j5ZoYRh6fWHjQ")
             .code == StatusCode::unauthorized,
         "Windows CNG must reject a same-length incorrect HMAC in constant-time code");
}

bool sendSocketBytes(const SOCKET socket, const std::string_view bytes) {
  std::size_t offset = 0;
  while (offset < bytes.size()) {
    const auto remaining = bytes.size() - offset;
    const int sent = ::send(socket, bytes.data() + offset,
                            static_cast<int>(std::min<std::size_t>(remaining, INT_MAX)), 0);
    if (sent <= 0) {
      return false;
    }
    offset += static_cast<std::size_t>(sent);
  }
  return true;
}

std::string makeHttpRequest(const std::uint16_t port, const std::string& request) {
  const SOCKET socket = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (socket == INVALID_SOCKET) {
    return {};
  }
  constexpr DWORD kTimeoutMilliseconds = 2'000;
  (void)setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO,
                   reinterpret_cast<const char*>(&kTimeoutMilliseconds),
                   sizeof(kTimeoutMilliseconds));
  (void)setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO,
                   reinterpret_cast<const char*>(&kTimeoutMilliseconds),
                   sizeof(kTimeoutMilliseconds));
  sockaddr_in endpoint{};
  endpoint.sin_family = AF_INET;
  endpoint.sin_port = htons(port);
  endpoint.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::connect(socket, reinterpret_cast<const sockaddr*>(&endpoint), sizeof(endpoint)) ==
          SOCKET_ERROR ||
      !sendSocketBytes(socket, request)) {
    closesocket(socket);
    return {};
  }
  ::shutdown(socket, SD_SEND);
  std::string response;
  std::array<char, 4'096> buffer{};
  for (;;) {
    const int received = ::recv(socket, buffer.data(), static_cast<int>(buffer.size()), 0);
    if (received <= 0) {
      break;
    }
    response.append(buffer.data(), static_cast<std::size_t>(received));
  }
  closesocket(socket);
  return response;
}

void testRealWindowsLoopbackTransport() {
  WSADATA winsock{};
  expect(WSAStartup(MAKEWORD(2, 2), &winsock) == 0,
         "the test client must initialize Winsock");

  WindowsLoopbackHttpTransport transport;
  std::atomic_int handled{0};
  const auto listenStatus = transport.listen(
      "127.0.0.1", 0, [&handled](const ControlRequest& request) {
        ++handled;
        if (request.method != "GET" || request.route != "/v1/health" ||
            request.origin != kOrigin || request.requestId != "request_12345678") {
          return ControlResponse{400, "{\"ok\":false}"};
        }
        return ControlResponse{200, "{\"ok\":true}",
                               {{"Access-Control-Allow-Origin", kOrigin}}};
      });
  const auto port = transport.boundPort();
  expect(listenStatus.isOk() && port != 0,
         "the concrete Windows transport must bind a real ephemeral loopback socket");

  const auto canonicalRequest =
      "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1:" + std::to_string(port) +
      "\r\nOrigin: " + kOrigin +
      "\r\nX-Request-Id: request_12345678\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
  const auto response = makeHttpRequest(port, canonicalRequest);
  expect(contains(response, "HTTP/1.1 200 OK") && contains(response, "{\"ok\":true}") &&
             contains(response, "Access-Control-Allow-Origin: " + kOrigin) && handled == 1,
         "the concrete transport must parse, dispatch and answer a bounded HTTP/1.1 request");

  const auto wrongHost =
      "GET /v1/health HTTP/1.1\r\nHost: localhost:" + std::to_string(port) +
      "\r\nOrigin: " + kOrigin +
      "\r\nX-Request-Id: request_12345678\r\nContent-Length: 0\r\n\r\n";
  const auto wrongHostResponse = makeHttpRequest(port, wrongHost);
  expect(contains(wrongHostResponse, "HTTP/1.1 400 Bad Request") && handled == 1,
         "the concrete transport must reject a Host value other than its bound IPv4 loopback");

  const auto duplicateOrigin =
      "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1:" + std::to_string(port) +
      "\r\nOrigin: " + kOrigin + "\r\nOrigin: " + kOrigin +
      "\r\nX-Request-Id: request_12345678\r\nContent-Length: 0\r\n\r\n";
  const auto duplicateResponse = makeHttpRequest(port, duplicateOrigin);
  expect(contains(duplicateResponse, "HTTP/1.1 400 Bad Request") && handled == 1,
         "the concrete transport must reject duplicate security-sensitive headers");

  transport.stop();
  WSACleanup();
}

class EphemeralWindowsControlTransport final : public IControlTransport {
 public:
  Status listen(const std::string& bindAddress, std::uint16_t,
                ControlHandler handler) override {
    return transport_.listen(bindAddress, 0, std::move(handler));
  }

  void stop() noexcept override { transport_.stop(); }

  [[nodiscard]] std::uint16_t boundPort() const noexcept {
    return transport_.boundPort();
  }

 private:
  WindowsLoopbackHttpTransport transport_;
};

void testAuthenticatedApiOverRealWindowsSocket() {
  WSADATA winsock{};
  const bool clientWinsockStarted = WSAStartup(MAKEWORD(2, 2), &winsock) == 0;
  expect(clientWinsockStarted, "the authenticated socket test must initialize Winsock");

  CommandSessionConfiguration configuration;
  configuration.sessionId = kSessionId;
  configuration.encodedSessionSecret =
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  configuration.exactOrigin = kOrigin;
  configuration.expiresAt = fixedNow() + std::chrono::hours(1);
  auto authenticator = std::make_unique<SessionCommandAuthenticator>(
      OriginPolicy({kOrigin}, false), std::move(configuration),
      std::make_unique<WindowsCommandCrypto>(), [] { return fixedNow(); });

  Diagnostics diagnostics("0.1.0-control-test");
  diagnostics.setHealth(EngineHealth::warning);
  LocalControlRuntimeState runtime(false);
  LocalControlApi api(OriginPolicy({kOrigin}, false), "0.1.0-control-test", kSessionId,
                      diagnostics, runtime);

  auto transport = std::make_unique<EphemeralWindowsControlTransport>();
  auto* capturedTransport = transport.get();
  ControlServer server(std::move(transport), std::move(authenticator));
  const auto start = server.start(
      "127.0.0.1", 47'191,
      [&api](const ControlRequest& request) { return api.handle(request); });
  const auto port = capturedTransport->boundPort();
  expect(start.isOk() && port != 0,
         "the authenticated API stack must start over the concrete loopback transport");

  const auto request =
      "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1:" + std::to_string(port) +
      "\r\nOrigin: " + kOrigin +
      "\r\nX-Request-Id: request_12345678"
      "\r\nX-MeeWav-Session: " + kSessionId +
      "\r\nX-MeeWav-Timestamp: 1700000000000"
      "\r\nX-MeeWav-Nonce: AAAAAAAAAAAAAAAAAAAAAAAA"
      "\r\nX-MeeWav-Signature: 00XvFNRwRFS8jfMduH9VBCroN8_Ik3uWYoUm_gSkndA"
      "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
  const auto response = makeHttpRequest(port, request);
  expect(contains(response, "HTTP/1.1 200 OK") &&
             contains(response, "\"audioPlane\":\"unavailable\"") &&
             contains(response, "Access-Control-Allow-Origin: " + kOrigin),
         "a real CNG-signed request must reach the fail-closed API over a real socket");

  const auto replayResponse = makeHttpRequest(port, request);
  expect(contains(replayResponse, "HTTP/1.1 401 Unauthorized"),
         "the complete real transport/auth/API stack must reject a replayed HTTP command");

  server.stop();
  if (clientWinsockStarted) {
    WSACleanup();
  }
}

#endif

}  // namespace

int main() {
  testSessionCommandAuthentication();
  testFailClosedControlApi();
  testWatchdogDryFallbackTransition();
  testControlServerAuthenticationGuard();
#if defined(_WIN32)
  testWindowsCryptoProvider();
  testRealWindowsLoopbackTransport();
  testAuthenticatedApiOverRealWindowsSocket();
#endif

  if (failures != 0) {
    std::cerr << failures << " control bridge contract test(s) failed.\n";
    return EXIT_FAILURE;
  }
  std::cout << "MeeWav authenticated loopback control contracts: OK\n";
  return EXIT_SUCCESS;
}
