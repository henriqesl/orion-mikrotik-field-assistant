#include "orion/network_metrics.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

bool close_to(double actual, double expected, double tolerance = 0.001) {
    return std::abs(actual - expected) <= tolerance;
}

void require(bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}

}  // namespace

int main() {
    try {
        const auto stable =
            orion::calculate_network_metrics(4, {1.0, 2.0, 2.0, 3.0});
        require(stable.received_packets == 4, "stable received packets");
        require(close_to(stable.packet_loss_percent, 0.0), "stable packet loss");
        require(close_to(stable.average_latency_ms.value(), 2.0), "stable average");
        require(close_to(stable.jitter_ms.value(), 2.0 / 3.0), "stable jitter");
        require(close_to(stable.p95_latency_ms.value(), 2.85), "stable p95");
        require(close_to(stable.p99_latency_ms.value(), 2.97), "stable p99");
        require(close_to(stable.latency_range_ms.value(), 2.0), "stable range");
        require(
            close_to(stable.standard_deviation_ms.value(), std::sqrt(0.5)),
            "stable standard deviation"
        );
        require(close_to(stable.tail_spread_ms.value(), 0.97), "stable tail spread");
        require(stable.spike_count == 0, "stable spike count");
        require(stable.stability_score == 98, "stable score");

        const auto spike = orion::calculate_network_metrics(
            5, {1.0, 2.0, 3.0, 4.0, 52.0}
        );
        require(close_to(spike.average_latency_ms.value(), 12.4), "spike average");
        require(close_to(spike.maximum_latency_ms.value(), 52.0), "spike maximum");
        require(close_to(spike.jitter_ms.value(), 12.75), "spike jitter");
        require(close_to(spike.p95_latency_ms.value(), 42.4), "spike p95");
        require(close_to(spike.p99_latency_ms.value(), 50.08), "spike p99");
        require(close_to(spike.latency_range_ms.value(), 51.0), "spike range");
        require(close_to(spike.tail_spread_ms.value(), 37.68), "spike tail spread");
        require(spike.spike_count == 1, "spike count");
        require(spike.stability_score == 65, "spike score");

        const auto unavailable = orion::calculate_network_metrics(5, {});
        require(
            close_to(unavailable.packet_loss_percent, 100.0),
            "unavailable packet loss"
        );
        require(!unavailable.average_latency_ms.has_value(), "unavailable average");
        require(!unavailable.jitter_ms.has_value(), "unavailable jitter");
        require(!unavailable.standard_deviation_ms.has_value(), "unavailable deviation");
        require(unavailable.stability_score == 0, "unavailable score");

        bool rejected = false;
        try {
            static_cast<void>(orion::calculate_network_metrics(1, {1.0, 2.0}));
        } catch (const std::invalid_argument&) {
            rejected = true;
        }
        require(rejected, "invalid sample count must be rejected");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }

    return 0;
}
