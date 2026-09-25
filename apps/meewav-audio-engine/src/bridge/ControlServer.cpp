#include "bridge/ControlServer.h"

#include <algorithm>
#include <utility>

namespace meewav::audio {

Status UnavailableControlTransport::listen(const std::string&, std::uint16_t, ControlHandler) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No loopback HTTP/WebSocket transport is compiled.");
}

Status RejectAllCommandAuthenticator::authorize(const ControlRequest&) {
  return Status::failure(StatusCode::backend_unavailable,
                         "No command HMAC authenticator is configured.");
}

ControlServer::ControlServer(std::unique_ptr<IControlTransport> transport,
                             std::unique_ptr<ICommandAuthenticator> authenticator)
    : transport_(transport ? std::move(transport)
                           : std::make_unique<UnavailableControlTransport>()),
      authenticator_(authenticator ? std::move(authenticator)
                                   : std::make_unique<RejectAllCommandAuthenticator>()) {}

ControlServer::~ControlServer() { stop(); }

Status ControlServer::start(const std::string& bindAddress, const std::uint16_t port,
                            ControlHandler handler) {
  if (!isExplicitLoopbackAddress(bindAddress)) {
    return Status::failure(StatusCode::invalid_argument,
                           "Control server must bind to an explicit loopback address.");
  }
  if (port == 0 || !handler) {
    return Status::failure(StatusCode::invalid_argument,
                           "Control server requires a port and request handler.");
  }
  auto guardedHandler = [this, handler = std::move(handler)](const ControlRequest& request) {
    if (isHandshakeRequest(request)) {
      // The route handler must still validate the exact allowlisted Origin and,
      // for POST /v1/session, complete a consumed one-use pairing. This bypass
      // only prevents the post-session HMAC guard from making pairing impossible.
      return handler(request);
    }
    const auto authorization = authenticator_->authorize(request);
    if (!authorization.isOk()) {
      const int status = authorization.code == StatusCode::forbidden_origin ? 403 : 401;
      const bool requestIdIsSafe = request.requestId.size() >= 8 && request.requestId.size() <= 128 &&
                                   std::ranges::all_of(request.requestId, [](const unsigned char character) {
                                     return (character >= 'a' && character <= 'z') ||
                                            (character >= 'A' && character <= 'Z') ||
                                            (character >= '0' && character <= '9') ||
                                            character == '-' || character == '_';
                                   });
      const std::string requestId = requestIdIsSafe ? request.requestId : "invalid-request";
      const std::string code = status == 403 ? "forbidden_origin" : "unauthorized";
      return ControlResponse{
          status,
          "{\"ok\":false,\"requestId\":\"" + requestId +
              "\",\"error\":{\"code\":\"" + code +
              "\",\"message\":\"Request authentication failed.\"}}"};
    }
    return handler(request);
  };
  return transport_->listen(bindAddress, port, std::move(guardedHandler));
}

void ControlServer::stop() noexcept { transport_->stop(); }

bool ControlServer::isExplicitLoopbackAddress(const std::string& address) noexcept {
  return address == "127.0.0.1" || address == "::1";
}

bool ControlServer::isHandshakeRequest(const ControlRequest& request) noexcept {
  return request.method == "OPTIONS" ||
         (request.method == "POST" && request.route == "/v1/session" &&
          request.sessionId.empty() && request.signature.empty());
}

}  // namespace meewav::audio
