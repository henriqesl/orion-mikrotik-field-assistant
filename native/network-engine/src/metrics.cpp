#include "orion/network_metrics.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>

namespace {

double percentile(const std::vector<double>& sorted_samples, double probability) {
    const double position = (sorted_samples.size() - 1) * probability;
    const auto lower = static_cast<std::size_t>(std::floor(position));
    const auto upper = static_cast<std::size_t>(std::ceil(position));
    const double fraction = position - static_cast<double>(lower);
    return sorted_samples[lower] +
           (sorted_samples[upper] - sorted_samples[lower]) * fraction;
}

int calculate_stability_score(
    double packet_loss_percent,
    const std::optional<double>& jitter_ms,
    double average_latency_ms,
    double p95_latency_ms,
    std::size_t spike_count,
    std::size_t received_packets
) {
    const double loss_penalty = std::min(65.0, packet_loss_percent * 0.65);
    const double jitter_penalty =
        std::min(20.0, jitter_ms.value_or(0.0) * 2.0);
    const double tail_penalty =
        std::min(10.0, std::max(0.0, p95_latency_ms - average_latency_ms));
    const double spike_ratio = received_packets == 0
                                   ? 0.0
                                   : static_cast<double>(spike_count) /
                                         static_cast<double>(received_packets);
    const double spike_penalty = std::min(5.0, spike_ratio * 25.0);
    const double score = std::clamp(
        100.0 - loss_penalty - jitter_penalty - tail_penalty - spike_penalty,
        0.0,
        100.0
    );
    return static_cast<int>(std::lround(score));
}

}  // namespace

namespace orion {

NetworkMetrics calculate_network_metrics(
    std::size_t sent_packets,
    const std::vector<double>& latency_samples_ms
) {
    if (sent_packets == 0) {
        throw std::invalid_argument("sent_packets must be greater than zero");
    }
    if (latency_samples_ms.size() > sent_packets) {
        throw std::invalid_argument("received samples cannot exceed sent packets");
    }
    if (std::any_of(
            latency_samples_ms.begin(),
            latency_samples_ms.end(),
            [](double sample) { return !std::isfinite(sample) || sample < 0.0; }
        )) {
        throw std::invalid_argument("latency samples must be finite and non-negative");
    }

    const auto received_packets = latency_samples_ms.size();
    const double availability =
        100.0 * static_cast<double>(received_packets) /
        static_cast<double>(sent_packets);
    const double packet_loss = 100.0 - availability;

    if (latency_samples_ms.empty()) {
        return {
            sent_packets,
            0,
            packet_loss,
            availability,
            std::nullopt,
            std::nullopt,
            std::nullopt,
            std::nullopt,
            std::nullopt,
            std::nullopt,
            0,
            0,
        };
    }

    const auto [minimum, maximum] = std::minmax_element(
        latency_samples_ms.begin(), latency_samples_ms.end()
    );
    const double average = std::accumulate(
                               latency_samples_ms.begin(),
                               latency_samples_ms.end(),
                               0.0
                           ) /
                           static_cast<double>(received_packets);

    std::optional<double> jitter;
    if (received_packets >= 2) {
        double total_delta = 0.0;
        for (std::size_t index = 1; index < received_packets; ++index) {
            total_delta += std::abs(
                latency_samples_ms[index] - latency_samples_ms[index - 1]
            );
        }
        jitter = total_delta / static_cast<double>(received_packets - 1);
    }

    auto sorted_samples = latency_samples_ms;
    std::sort(sorted_samples.begin(), sorted_samples.end());
    const double p95 = percentile(sorted_samples, 0.95);
    const double p99 = percentile(sorted_samples, 0.99);
    const double spike_threshold = average + std::max(5.0, 3.0 * jitter.value_or(0.0));
    const auto spike_count = static_cast<std::size_t>(std::count_if(
        latency_samples_ms.begin(),
        latency_samples_ms.end(),
        [spike_threshold](double sample) { return sample > spike_threshold; }
    ));

    return {
        sent_packets,
        received_packets,
        packet_loss,
        availability,
        *minimum,
        average,
        *maximum,
        jitter,
        p95,
        p99,
        spike_count,
        calculate_stability_score(
            packet_loss,
            jitter,
            average,
            p95,
            spike_count,
            received_packets
        ),
    };
}

}  // namespace orion
