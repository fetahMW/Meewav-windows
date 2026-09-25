#pragma once

#include "core/Status.h"
#include "security/OriginPolicy.h"

#include <chrono>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

namespace meewav::audio {

struct PairingTicketConsumption final {
  std::string pairingId;
  std::string opaqueTicket;
  std::string clientNonce;
};

struct VerifiedPairingTicket final {
  std::string pairingId;
  std::string subjectUserId;
  std::string roomId;
  std::string roomRole;
  std::string clientNonce;
  std::string webOrigin;
  std::chrono::system_clock::time_point expiresAt;
};

// Production implements this interface as a bounded HTTPS call to MeeWav's one-use ticket
// consumption endpoint. The native client never holds a backend signing or Supabase service key.
class IPairingTicketConsumer {
 public:
  virtual ~IPairingTicketConsumer() = default;
  virtual Status consume(const PairingTicketConsumption& request,
                         VerifiedPairingTicket& claims) = 0;
};

class RejectAllPairingTicketConsumer final : public IPairingTicketConsumer {
 public:
  Status consume(const PairingTicketConsumption& request,
                 VerifiedPairingTicket& claims) override;
};

class ISessionIdGenerator {
 public:
  virtual ~ISessionIdGenerator() = default;
  virtual Status generate(std::string& sessionId) = 0;
};

class UnavailableSessionIdGenerator final : public ISessionIdGenerator {
 public:
  Status generate(std::string& sessionId) override;
};

class ISessionSecretGenerator {
 public:
  virtual ~ISessionSecretGenerator() = default;
  virtual Status generate(std::string& secret) = 0;
};

class UnavailableSessionSecretGenerator final : public ISessionSecretGenerator {
 public:
  Status generate(std::string& secret) override;
};

// Production implements HMAC-SHA-256 and returns an unpadded base64url proof. The opaque ticket
// is the HMAC key and must never be persisted beyond the pending pairing handshake.
class ITicketProofGenerator {
 public:
  virtual ~ITicketProofGenerator() = default;
  virtual Status generate(const std::string& opaqueTicket, const std::string& canonicalMessage,
                          std::string& ticketProof) = 0;
};

class UnavailableTicketProofGenerator final : public ITicketProofGenerator {
 public:
  Status generate(const std::string& opaqueTicket, const std::string& canonicalMessage,
                  std::string& ticketProof) override;
};

struct LocalSession final {
  std::string pairingId;
  std::string sessionId;
  std::string subjectUserId;
  std::string roomId;
  std::string roomRole;
  std::string origin;
  std::string secret;
  std::string ticketProof;
  std::chrono::system_clock::time_point expiresAt;
};

class SessionAuth final {
 public:
  SessionAuth(OriginPolicy originPolicy, std::unique_ptr<IPairingTicketConsumer> ticketConsumer,
              std::unique_ptr<ISessionIdGenerator> sessionIdGenerator,
              std::unique_ptr<ISessionSecretGenerator> secretGenerator,
              std::unique_ptr<ITicketProofGenerator> ticketProofGenerator);
  ~SessionAuth();

  // Called by the custom-protocol launch. It consumes the backend ticket exactly once and retains
  // bounded claims plus the bounded opaque ticket only until the subsequent loopback handshake can
  // produce its possession proof.
  Status consumePairingTicket(const std::string& pairingId, const std::string& opaqueTicket,
                              const std::string& clientNonce,
                              const std::string& browserOrigin);

  // POST /v1/session carries no bearer ticket. It must match a previously consumed pairing ID,
  // client nonce and origin. Completion removes the pending record before secret generation.
  Status completePairing(const std::string& pairingId, const std::string& clientNonce,
                         const std::string& browserOrigin, LocalSession& session);

  // POST /v1/session/close is idempotent and best effort.
  Status closeSession(const std::string& sessionId);

 private:
  struct PendingPairing final {
    VerifiedPairingTicket claims;
    std::string clientNonce;
    std::string browserOrigin;
    // Sensitive, bounded and short-lived. It is erased when the handshake completes, expires or
    // fails. It is never copied into the active-session registry.
    std::string opaqueTicket;
  };

  void removeExpiredStateLocked(std::chrono::system_clock::time_point now);
  [[nodiscard]] bool hasActivePairingIdLocked(const std::string& pairingId) const;

  OriginPolicy originPolicy_;
  std::unique_ptr<IPairingTicketConsumer> ticketConsumer_;
  std::unique_ptr<ISessionIdGenerator> sessionIdGenerator_;
  std::unique_ptr<ISessionSecretGenerator> secretGenerator_;
  std::unique_ptr<ITicketProofGenerator> ticketProofGenerator_;
  std::mutex stateMutex_;
  std::unordered_map<std::string, PendingPairing> pendingPairings_;
  std::unordered_map<std::string, LocalSession> activeSessions_;
};

}  // namespace meewav::audio
