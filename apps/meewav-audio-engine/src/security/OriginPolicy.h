#pragma once

#include <algorithm>
#include <string>
#include <unordered_set>
#include <vector>

namespace meewav::audio {

class OriginPolicy final {
 public:
  explicit OriginPolicy(std::vector<std::string> exactAllowedOrigins,
                        bool allowLocalDevelopment = false)
      : allowLocalDevelopment_(allowLocalDevelopment),
        allowedOrigins_(exactAllowedOrigins.begin(), exactAllowedOrigins.end()) {}

  [[nodiscard]] bool allows(const std::string& origin) const {
    if (allowedOrigins_.contains(origin)) {
      return true;
    }
    if (!allowLocalDevelopment_) {
      return false;
    }
    return origin.starts_with("http://127.0.0.1:") ||
           origin.starts_with("http://localhost:") || origin == "http://127.0.0.1" ||
           origin == "http://localhost";
  }

 private:
  bool allowLocalDevelopment_{false};
  std::unordered_set<std::string> allowedOrigins_;
};

}  // namespace meewav::audio
