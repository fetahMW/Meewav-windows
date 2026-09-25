#include "bridge/windows/WindowsCommandCrypto.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <bcrypt.h>

#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <string>
#include <string_view>
#include <vector>

namespace meewav::audio {
namespace {

constexpr std::size_t kSha256Bytes = 32;

int base64UrlValue(const unsigned char character) noexcept {
  if (character >= 'A' && character <= 'Z') return character - 'A';
  if (character >= 'a' && character <= 'z') return character - 'a' + 26;
  if (character >= '0' && character <= '9') return character - '0' + 52;
  if (character == '-') return 62;
  if (character == '_') return 63;
  return -1;
}

bool decodeBase64Url(const std::string_view encoded, std::vector<std::uint8_t>& decoded) {
  decoded.clear();
  if (encoded.empty() || encoded.find('=') != std::string_view::npos ||
      encoded.size() % 4 == 1) {
    return false;
  }
  decoded.reserve((encoded.size() * 3) / 4 + 2);
  std::uint32_t accumulator = 0;
  int availableBits = 0;
  for (const unsigned char character : encoded) {
    const int value = base64UrlValue(character);
    if (value < 0) {
      decoded.clear();
      return false;
    }
    accumulator = (accumulator << 6U) | static_cast<std::uint32_t>(value);
    availableBits += 6;
    if (availableBits >= 8) {
      availableBits -= 8;
      decoded.push_back(static_cast<std::uint8_t>((accumulator >> availableBits) & 0xffU));
    }
  }
  if (availableBits > 0 && (accumulator & ((1U << availableBits) - 1U)) != 0) {
    decoded.clear();
    return false;
  }
  return true;
}

void eraseBytes(std::vector<std::uint8_t>& bytes) noexcept {
  if (!bytes.empty()) {
    SecureZeroMemory(bytes.data(), bytes.size());
  }
  bytes.clear();
}

Status hashSha256(const std::string_view input, std::array<std::uint8_t, kSha256Bytes>& output) {
  if (input.size() > std::numeric_limits<ULONG>::max()) {
    return Status::failure(StatusCode::invalid_argument, "SHA-256 input is too large.");
  }
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  NTSTATUS result = BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0);
  if (!BCRYPT_SUCCESS(result)) {
    return Status::failure(StatusCode::internal_error, "Windows SHA-256 provider is unavailable.");
  }
  result = BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0);
  if (BCRYPT_SUCCESS(result) && !input.empty()) {
    result = BCryptHashData(
        hash, reinterpret_cast<PUCHAR>(const_cast<char*>(input.data())),
        static_cast<ULONG>(input.size()), 0);
  }
  if (BCRYPT_SUCCESS(result)) {
    result = BCryptFinishHash(hash, output.data(), static_cast<ULONG>(output.size()), 0);
  }
  if (hash != nullptr) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  return BCRYPT_SUCCESS(result)
             ? Status::success()
             : Status::failure(StatusCode::internal_error, "Windows SHA-256 operation failed.");
}

Status hmacSha256(const std::vector<std::uint8_t>& secret, const std::string_view input,
                  std::array<std::uint8_t, kSha256Bytes>& output) {
  if (secret.empty() || secret.size() > std::numeric_limits<ULONG>::max() ||
      input.size() > std::numeric_limits<ULONG>::max()) {
    return Status::failure(StatusCode::invalid_argument, "HMAC input is invalid.");
  }
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  NTSTATUS result = BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr,
                                                 BCRYPT_ALG_HANDLE_HMAC_FLAG);
  if (!BCRYPT_SUCCESS(result)) {
    return Status::failure(StatusCode::internal_error, "Windows HMAC provider is unavailable.");
  }
  result = BCryptCreateHash(
      algorithm, &hash, nullptr, 0,
      reinterpret_cast<PUCHAR>(const_cast<std::uint8_t*>(secret.data())),
      static_cast<ULONG>(secret.size()), 0);
  if (BCRYPT_SUCCESS(result) && !input.empty()) {
    result = BCryptHashData(
        hash, reinterpret_cast<PUCHAR>(const_cast<char*>(input.data())),
        static_cast<ULONG>(input.size()), 0);
  }
  if (BCRYPT_SUCCESS(result)) {
    result = BCryptFinishHash(hash, output.data(), static_cast<ULONG>(output.size()), 0);
  }
  if (hash != nullptr) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  return BCRYPT_SUCCESS(result)
             ? Status::success()
             : Status::failure(StatusCode::internal_error, "Windows HMAC operation failed.");
}

}  // namespace

Status WindowsCommandCrypto::sha256Hex(const std::string_view input, std::string& digestHex) {
  digestHex.clear();
  std::array<std::uint8_t, kSha256Bytes> digest{};
  const auto status = hashSha256(input, digest);
  if (!status.isOk()) {
    return status;
  }
  static constexpr char kHex[] = "0123456789abcdef";
  digestHex.reserve(digest.size() * 2);
  for (const auto byte : digest) {
    digestHex.push_back(kHex[(byte >> 4U) & 0x0fU]);
    digestHex.push_back(kHex[byte & 0x0fU]);
  }
  SecureZeroMemory(digest.data(), digest.size());
  return Status::success();
}

Status WindowsCommandCrypto::verifyHmacSha256Base64Url(
    const std::string_view encodedSecret, const std::string_view canonicalMessage,
    const std::string_view encodedSignature) {
  std::vector<std::uint8_t> secret;
  std::vector<std::uint8_t> signature;
  if (!decodeBase64Url(encodedSecret, secret) || secret.size() < kSha256Bytes ||
      !decodeBase64Url(encodedSignature, signature) || signature.size() != kSha256Bytes) {
    eraseBytes(secret);
    eraseBytes(signature);
    return Status::failure(StatusCode::unauthorized, "Encoded HMAC material is invalid.");
  }

  std::array<std::uint8_t, kSha256Bytes> expected{};
  const auto status = hmacSha256(secret, canonicalMessage, expected);
  eraseBytes(secret);
  if (!status.isOk()) {
    eraseBytes(signature);
    SecureZeroMemory(expected.data(), expected.size());
    return status;
  }
  std::uint8_t difference = 0;
  for (std::size_t index = 0; index < expected.size(); ++index) {
    difference |= static_cast<std::uint8_t>(expected[index] ^ signature[index]);
  }
  eraseBytes(signature);
  SecureZeroMemory(expected.data(), expected.size());
  return difference == 0
             ? Status::success()
             : Status::failure(StatusCode::unauthorized, "HMAC signature does not match.");
}

}  // namespace meewav::audio
