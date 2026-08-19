#include "orion/network_metrics.hpp"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::vector<double> parse_samples(const std::string& value) {
    std::vector<double> samples;
    if (value.empty()) {
        return samples;
    }

    std::stringstream stream(value);
    std::string item;
    while (std::getline(stream, item, ',')) {
        std::size_t consumed = 0;
        const double sample = std::stod(item, &consumed);
        if (consumed != item.size() || !std::isfinite(sample) || sample < 0.0) {
            throw std::invalid_argument("invalid latency sample");
        }
        samples.push_back(sample);
    }
    return samples;
}

void print_optional(const std::optional<double>& value) {
    if (value.has_value()) {
        std::cout << *value;
    } else {
        std::cout << "null";
    }
}

void print_json(const orion::NetworkMetrics& metrics) {
    std::cout << std::fixed << std::setprecision(3)
              << "{\"sent_packets\":" << metrics.sent_packets
              << ",\"received_packets\":" << metrics.received_packets
              << ",\"packet_loss_percent\":" << metrics.packet_loss_percent
              << ",\"availability_percent\":" << metrics.availability_percent
              << ",\"minimum_latency_ms\":";
    print_optional(metrics.minimum_latency_ms);
    std::cout << ",\"average_latency_ms\":";
    print_optional(metrics.average_latency_ms);
    std::cout << ",\"maximum_latency_ms\":";
    print_optional(metrics.maximum_latency_ms);
    std::cout << ",\"jitter_ms\":";
    print_optional(metrics.jitter_ms);
    std::cout << ",\"p95_latency_ms\":";
    print_optional(metrics.p95_latency_ms);
    std::cout << ",\"p99_latency_ms\":";
    print_optional(metrics.p99_latency_ms);
    std::cout << ",\"spike_count\":" << metrics.spike_count
              << ",\"stability_score\":" << metrics.stability_score << "}\n";
}

}  // namespace

int main(int argc, char* argv[]) {
    try {
        if (argc < 2 || std::string(argv[1]) != "analyze") {
            throw std::invalid_argument(
                "usage: orion-network-engine analyze --sent N [--samples CSV]"
            );
        }

        std::size_t sent_packets = 0;
        std::vector<double> samples;
        for (int index = 2; index < argc; ++index) {
            const std::string option = argv[index];
            if (option == "--sent" && index + 1 < argc) {
                std::size_t consumed = 0;
                const std::string value = argv[++index];
                sent_packets = std::stoull(value, &consumed);
                if (consumed != value.size()) {
                    throw std::invalid_argument("invalid sent packet count");
                }
            } else if (option == "--samples" && index + 1 < argc) {
                samples = parse_samples(argv[++index]);
            } else {
                throw std::invalid_argument("unknown or incomplete argument: " + option);
            }
        }

        print_json(orion::calculate_network_metrics(sent_packets, samples));
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
