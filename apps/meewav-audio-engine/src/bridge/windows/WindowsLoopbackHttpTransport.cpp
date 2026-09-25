#include "bridge/windows/WindowsLoopbackHttpTransport.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <charconv>
#include <climits>
#include <chrono>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <optional>
#include <ranges>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <utility>

namespace meewav::audio {
namespace {

constexpr std::size_t kMaximumHeaderBytes = 16'384;
constexpr std::size_t kMaximumBodyBytes = 65'536;
constexpr std::size_t kMaximumResponseBytes = 1'048'576;
constexpr DWORD kSocketTimeoutMilliseconds = 500;
constexpr auto kRequestDeadline = std::chrono::seconds(2);

struct ParsedRequest final {
  ControlRequest request;
  int errorStatus{0};
  std::string errorCode;
  std::string errorMessage;
};

std::string trim(std::string_view value) {
  while (!value.empty() && (value.front() == ' ' || value.front() == '\t')) value.remove_prefix(1);
  while (!value.empty() && (value.back() == ' ' || value.back() == '\t')) value.remove_suffix(1);
  return std::string(value);
}

std::string lowercase(std::string value) {
  std::ranges::transform(value, value.begin(), [](const unsigned char character) {
    return static_cast<char>(std::tolower(character));
  });
  return value;
}

bool headerNameIsSafe(const std::string_view value) noexcept {
  return !value.empty() && value.size() <= 64 &&
         std::ranges::all_of(value, [](const unsigned char character) {
           return (character >= 'a' && character <= 'z') ||
                  (character >= '0' && character <= '9') || character == '-';
         });
}

bool headerValueIsSafe(const std::string_view value) noexcept {
  return std::ranges::all_of(value, [](const unsigned char character) {
    return character == '\t' || character >= 0x20;
  });
}

std::optional<std::size_t> parseContentLength(const std::string_view value) {
  if (value.empty() || value.size() > 10) return std::nullopt;
  std::size_t result = 0;
  const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result);
  if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size() ||
      result > kMaximumBodyBytes) {
    return std::nullopt;
  }
  return result;
}

ParsedRequest parseRequest(SOCKET client, const std::uint16_t boundPort) {
  ParsedRequest parsed;
  const auto deadline = std::chrono::steady_clock::now() + kRequestDeadline;
  const auto deadlineExceeded = [&deadline] {
    return std::chrono::steady_clock::now() >= deadline;
  };
  std::string bytes;
  bytes.reserve(4'096);
  std::array<char, 4'096> buffer{};
  std::size_t headerEnd = std::string::npos;
  while (headerEnd == std::string::npos) {
    if (deadlineExceeded()) {
      parsed.errorStatus = 408;
      parsed.errorCode = "request_timeout";
      parsed.errorMessage = "HTTP request exceeded the local control deadline.";
      return parsed;
    }
    const int received = ::recv(client, buffer.data(), static_cast<int>(buffer.size()), 0);
    if (received <= 0) {
      parsed.errorStatus = 400;
      parsed.errorCode = "invalid_http";
      parsed.errorMessage = "Incomplete HTTP request.";
      return parsed;
    }
    bytes.append(buffer.data(), static_cast<std::size_t>(received));
    if (deadlineExceeded()) {
      parsed.errorStatus = 408;
      parsed.errorCode = "request_timeout";
      parsed.errorMessage = "HTTP request exceeded the local control deadline.";
      return parsed;
    }
    if (bytes.size() > kMaximumHeaderBytes) {
      parsed.errorStatus = 431;
      parsed.errorCode = "headers_too_large";
      parsed.errorMessage = "HTTP headers exceed the local control limit.";
      return parsed;
    }
    headerEnd = bytes.find("\r\n\r\n");
  }

  const auto requestLineEnd = bytes.find("\r\n");
  if (requestLineEnd == std::string::npos) {
    parsed.errorStatus = 400;
    parsed.errorCode = "invalid_http";
    parsed.errorMessage = "HTTP request line is invalid.";
    return parsed;
  }
  const std::string_view requestLine(bytes.data(), requestLineEnd);
  const auto firstSpace = requestLine.find(' ');
  const auto secondSpace = firstSpace == std::string_view::npos
                               ? std::string_view::npos
                               : requestLine.find(' ', firstSpace + 1);
  if (firstSpace == std::string_view::npos || secondSpace == std::string_view::npos ||
      requestLine.substr(secondSpace + 1) != "HTTP/1.1") {
    parsed.errorStatus = 400;
    parsed.errorCode = "invalid_http";
    parsed.errorMessage = "Only a canonical HTTP/1.1 request line is accepted.";
    return parsed;
  }
  parsed.request.method = std::string(requestLine.substr(0, firstSpace));
  parsed.request.route =
      std::string(requestLine.substr(firstSpace + 1, secondSpace - firstSpace - 1));
  if (!parsed.request.route.starts_with("/v1/") ||
      parsed.request.route.find_first_of("?#") != std::string::npos) {
    parsed.errorStatus = 400;
    parsed.errorCode = "invalid_route";
    parsed.errorMessage = "Control route is invalid.";
    return parsed;
  }

  std::unordered_map<std::string, std::string> headers;
  std::size_t cursor = requestLineEnd + 2;
  while (cursor < headerEnd) {
    const auto lineEnd = bytes.find("\r\n", cursor);
    if (lineEnd == std::string::npos || lineEnd > headerEnd) {
      parsed.errorStatus = 400;
      parsed.errorCode = "invalid_headers";
      parsed.errorMessage = "HTTP header line is invalid.";
      return parsed;
    }
    const std::string_view line(bytes.data() + cursor, lineEnd - cursor);
    const auto colon = line.find(':');
    if (colon == std::string_view::npos || colon == 0 || line.front() == ' ' ||
        line.front() == '\t') {
      parsed.errorStatus = 400;
      parsed.errorCode = "invalid_headers";
      parsed.errorMessage = "HTTP header syntax is invalid.";
      return parsed;
    }
    const std::string_view rawName = line.substr(0, colon);
    auto name = lowercase(std::string(rawName));
    auto value = trim(line.substr(colon + 1));
    if (!headerNameIsSafe(name) || rawName != trim(rawName) || !headerValueIsSafe(value) ||
        !headers.emplace(std::move(name), std::move(value)).second) {
      parsed.errorStatus = 400;
      parsed.errorCode = "duplicate_header";
      parsed.errorMessage = "Duplicate or unsafe HTTP headers are rejected.";
      return parsed;
    }
    cursor = lineEnd + 2;
  }

  const auto host = headers.find("host");
  if (host == headers.end() || host->second != "127.0.0.1:" + std::to_string(boundPort)) {
    parsed.errorStatus = 400;
    parsed.errorCode = "invalid_host";
    parsed.errorMessage = "Host must match the bound loopback endpoint.";
    return parsed;
  }
  if (headers.contains("transfer-encoding")) {
    parsed.errorStatus = 400;
    parsed.errorCode = "unsupported_encoding";
    parsed.errorMessage = "Transfer-Encoding is not accepted.";
    return parsed;
  }
  std::size_t contentLength = 0;
  if (const auto content = headers.find("content-length"); content != headers.end()) {
    const auto parsedLength = parseContentLength(content->second);
    if (!parsedLength.has_value()) {
      parsed.errorStatus = 400;
      parsed.errorCode = "invalid_content_length";
      parsed.errorMessage = "Content-Length is invalid or too large.";
      return parsed;
    }
    contentLength = *parsedLength;
  }

  const std::size_t bodyStart = headerEnd + 4;
  while (bytes.size() - bodyStart < contentLength) {
    if (deadlineExceeded()) {
      parsed.errorStatus = 408;
      parsed.errorCode = "request_timeout";
      parsed.errorMessage = "HTTP request exceeded the local control deadline.";
      return parsed;
    }
    const std::size_t remaining = contentLength - (bytes.size() - bodyStart);
    const int received = ::recv(client, buffer.data(),
                                static_cast<int>(std::min(remaining, buffer.size())), 0);
    if (received <= 0) {
      parsed.errorStatus = 400;
      parsed.errorCode = "invalid_body";
      parsed.errorMessage = "HTTP body is incomplete.";
      return parsed;
    }
    bytes.append(buffer.data(), static_cast<std::size_t>(received));
    if (deadlineExceeded()) {
      parsed.errorStatus = 408;
      parsed.errorCode = "request_timeout";
      parsed.errorMessage = "HTTP request exceeded the local control deadline.";
      return parsed;
    }
  }
  if (bytes.size() - bodyStart != contentLength) {
    parsed.errorStatus = 400;
    parsed.errorCode = "pipelining_rejected";
    parsed.errorMessage = "Only one HTTP request per connection is accepted.";
    return parsed;
  }
  parsed.request.body.assign(bytes.data() + bodyStart, contentLength);

  const auto header = [&](const char* name) -> std::string {
    const auto found = headers.find(name);
    return found == headers.end() ? std::string{} : found->second;
  };
  parsed.request.origin = header("origin");
  parsed.request.requestId = header("x-request-id");
  parsed.request.sessionId = header("x-meewav-session");
  parsed.request.timestampMilliseconds = header("x-meewav-timestamp");
  parsed.request.nonce = header("x-meewav-nonce");
  parsed.request.signature = header("x-meewav-signature");
  return parsed;
}

std::string statusText(const int status) {
  switch (status) {
    case 200: return "OK";
    case 204: return "No Content";
    case 400: return "Bad Request";
    case 401: return "Unauthorized";
    case 403: return "Forbidden";
    case 404: return "Not Found";
    case 408: return "Request Timeout";
    case 409: return "Conflict";
    case 431: return "Request Header Fields Too Large";
    case 503: return "Service Unavailable";
    default: return "Internal Server Error";
  }
}

bool sendAll(const SOCKET client, const std::string_view bytes) noexcept {
  std::size_t offset = 0;
  while (offset < bytes.size()) {
    const std::size_t remaining = bytes.size() - offset;
    const int sent = ::send(client, bytes.data() + offset,
                            static_cast<int>(std::min<std::size_t>(remaining, INT_MAX)), 0);
    if (sent <= 0) return false;
    offset += static_cast<std::size_t>(sent);
  }
  return true;
}

void sendResponse(const SOCKET client, ControlResponse response) {
  if (response.body.size() > kMaximumResponseBytes) {
    response = ControlResponse{500,
                               "{\"ok\":false,\"requestId\":\"invalid-request\","
                               "\"error\":{\"code\":\"response_too_large\","
                               "\"message\":\"Local response exceeded its bound.\"}}"};
  }
  std::string output = "HTTP/1.1 " + std::to_string(response.httpStatus) + " " +
                       statusText(response.httpStatus) + "\r\n";
  output += "Connection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n";
  if (response.httpStatus != 204) output += "Content-Type: application/json; charset=utf-8\r\n";
  for (const auto& [name, value] : response.headers) {
    const auto normalizedName = lowercase(name);
    if (headerNameIsSafe(normalizedName) && headerValueIsSafe(value)) {
      output += name + ": " + value + "\r\n";
    }
  }
  output += "Content-Length: " + std::to_string(response.body.size()) + "\r\n\r\n";
  output += response.body;
  (void)sendAll(client, output);
}

ControlResponse parseFailure(const ParsedRequest& request) {
  return ControlResponse{
      request.errorStatus == 0 ? 400 : request.errorStatus,
      "{\"ok\":false,\"requestId\":\"invalid-request\",\"error\":{\"code\":\"" +
          request.errorCode + "\",\"message\":\"" + request.errorMessage + "\"}}"};
}

void processClient(const SOCKET client, const std::uint16_t port,
                   const ControlHandler& handler) noexcept {
  try {
    auto parsed = parseRequest(client, port);
    sendResponse(client, parsed.errorStatus == 0 ? handler(parsed.request)
                                                 : parseFailure(parsed));
  } catch (...) {
    // A malformed local request or allocation failure must never unwind out of
    // the transport thread and terminate the audio-engine process. Closing the
    // one-request connection is the fail-closed response.
  }
}

}  // namespace

struct WindowsLoopbackHttpTransport::Impl final {
  mutable std::mutex mutex;
  SOCKET listener{INVALID_SOCKET};
  std::jthread thread;
  std::atomic<std::uint16_t> port{0};
  bool winsockStarted{false};
};

WindowsLoopbackHttpTransport::WindowsLoopbackHttpTransport() : impl_(std::make_unique<Impl>()) {}

WindowsLoopbackHttpTransport::~WindowsLoopbackHttpTransport() { stop(); }

Status WindowsLoopbackHttpTransport::listen(const std::string& bindAddress,
                                             const std::uint16_t port,
                                             ControlHandler handler) {
  stop();
  if (bindAddress != "127.0.0.1" || !handler) {
    return Status::failure(StatusCode::invalid_argument,
                           "Windows control transport requires 127.0.0.1 and a handler.");
  }

  WSADATA winsock{};
  if (WSAStartup(MAKEWORD(2, 2), &winsock) != 0) {
    return Status::failure(StatusCode::io_error, "Winsock initialization failed.");
  }
  impl_->winsockStarted = true;
  SOCKET listener = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (listener == INVALID_SOCKET) {
    stop();
    return Status::failure(StatusCode::io_error, "Loopback socket creation failed.");
  }
  BOOL exclusive = TRUE;
  if (setsockopt(listener, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
                 reinterpret_cast<const char*>(&exclusive), sizeof(exclusive)) ==
      SOCKET_ERROR) {
    closesocket(listener);
    stop();
    return Status::failure(StatusCode::io_error,
                           "Exclusive loopback socket configuration failed.");
  }

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::bind(listener, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) ==
          SOCKET_ERROR ||
      ::listen(listener, 4) == SOCKET_ERROR) {
    closesocket(listener);
    stop();
    return Status::failure(StatusCode::io_error, "Loopback bind/listen failed.");
  }
  int addressLength = sizeof(address);
  if (getsockname(listener, reinterpret_cast<sockaddr*>(&address), &addressLength) ==
      SOCKET_ERROR) {
    closesocket(listener);
    stop();
    return Status::failure(StatusCode::io_error, "Loopback port query failed.");
  }
  const auto actualPort = ntohs(address.sin_port);
  {
    std::scoped_lock lock(impl_->mutex);
    impl_->listener = listener;
    impl_->port.store(actualPort, std::memory_order_release);
  }
  try {
    impl_->thread = std::jthread(
        [listener, actualPort, handler = std::move(handler)](const std::stop_token stopToken) {
          while (!stopToken.stop_requested()) {
            sockaddr_in remote{};
            int remoteLength = sizeof(remote);
            const SOCKET client = ::accept(listener, reinterpret_cast<sockaddr*>(&remote),
                                           &remoteLength);
            if (client == INVALID_SOCKET) break;
            if (remote.sin_family != AF_INET ||
                remote.sin_addr.s_addr != htonl(INADDR_LOOPBACK)) {
              closesocket(client);
              continue;
            }
            if (setsockopt(client, SOL_SOCKET, SO_RCVTIMEO,
                           reinterpret_cast<const char*>(&kSocketTimeoutMilliseconds),
                           sizeof(kSocketTimeoutMilliseconds)) == SOCKET_ERROR ||
                setsockopt(client, SOL_SOCKET, SO_SNDTIMEO,
                           reinterpret_cast<const char*>(&kSocketTimeoutMilliseconds),
                           sizeof(kSocketTimeoutMilliseconds)) == SOCKET_ERROR) {
              closesocket(client);
              continue;
            }
            processClient(client, actualPort, handler);
            ::shutdown(client, SD_BOTH);
            closesocket(client);
          }
        });
  } catch (...) {
    stop();
    return Status::failure(StatusCode::internal_error,
                           "Loopback control thread could not be started.");
  }
  return Status::success();
}

void WindowsLoopbackHttpTransport::stop() noexcept {
  SOCKET listener = INVALID_SOCKET;
  {
    std::scoped_lock lock(impl_->mutex);
    listener = std::exchange(impl_->listener, INVALID_SOCKET);
    impl_->port.store(0, std::memory_order_release);
  }
  if (impl_->thread.joinable()) impl_->thread.request_stop();
  if (listener != INVALID_SOCKET) {
    ::shutdown(listener, SD_BOTH);
    closesocket(listener);
  }
  if (impl_->thread.joinable()) impl_->thread.join();
  if (impl_->winsockStarted) {
    WSACleanup();
    impl_->winsockStarted = false;
  }
}

std::uint16_t WindowsLoopbackHttpTransport::boundPort() const noexcept {
  return impl_->port.load(std::memory_order_acquire);
}

}  // namespace meewav::audio
