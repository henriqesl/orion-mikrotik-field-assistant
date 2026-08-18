#pragma once

#include <cstddef>
#include <optional>
#include <vector>

namespace orion {

struct NetworkMetrics {
    std::size_t sent_packets;
    std::size_t received_packets;
    double packet_loss_percent;
    double availability_percent;
    std::optional<double> minimum_latency_ms;
    std::optional<double> average_latency_ms;
    std::optional<double> maximum_latency_ms;
    std::optional<double> jitter_ms;
    std::optional<double> p95_latency_ms;
    std::optional<double> p99_latency_ms;
    std::size_t spike_count;
    int stability_score;
};

NetworkMetrics calculate_network_metrics(
    std::size_t sent_packets,
    const std::vector<double>& latency_samples_ms
);

}  // namespace orion
