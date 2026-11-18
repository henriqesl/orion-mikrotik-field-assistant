import pytest

from app.services.evaluation import (
    assess_association,
    assess_average_latency,
    assess_maximum_latency,
    assess_packet_loss,
    assess_signal,
    calculate_link_health,
)
from app.models.mikrotik import PingResult, WiFiPeer


@pytest.mark.parametrize(
    ("value", "label"),
    [
        (-61, "Muito bom"),
        (-68, "Bom"),
        (-75, "Atenção"),
        (-84, "Fraco"),
        (-90, "Muito fraco"),
        (None, "Indisponível"),
    ],
)
def test_signal_assessment_ranges(value, label) -> None:
    assert assess_signal(value).label == label


@pytest.mark.parametrize(
    ("value", "label"),
    [
        (0, "Excelente"),
        (1, "Muito baixa"),
        (5, "Atenção"),
        (20, "Instável"),
        (40, "Crítica"),
    ],
)
def test_packet_loss_assessment_ranges(value, label) -> None:
    assert assess_packet_loss(value).label == label


def test_latency_assessments_keep_average_and_peak_independent() -> None:
    assert assess_average_latency(3).label == "Excelente"
    assert assess_maximum_latency(52).label == "Atenção"


def test_association_does_not_infer_legacy_authorization() -> None:
    assessment = assess_association(None)

    assert assessment.status == "informational"
    assert assessment.label == "Registrado"


def make_peer(signal_dbm: int, authorized: bool | None = True) -> WiFiPeer:
    return WiFiPeer(
        interface="wifi1",
        mac_address="11:22:33:44:55:66",
        radio_name=None,
        ssid="ORION-Link",
        authorized=authorized,
        signal=str(signal_dbm),
        signal_dbm=signal_dbm,
        tx_rate="120Mbps",
        rx_rate="96Mbps",
        tx_bits_per_second=None,
        rx_bits_per_second=None,
        uptime="6h32m",
        last_activity="10ms",
        band="5ghz-ax",
        signal_assessment=assess_signal(signal_dbm),
        association_assessment=assess_association(authorized),
    )


def make_ping(
    packet_loss: float,
    average_latency: float | None,
    maximum_latency: float | None,
) -> PingResult:
    return PingResult(
        target="10.0.0.2",
        sent=5,
        received=round(5 * (1 - packet_loss / 100)),
        packet_loss_percent=packet_loss,
        minimum_latency_ms=average_latency,
        average_latency_ms=average_latency,
        maximum_latency_ms=maximum_latency,
        samples_ms=[],
        measurement_source="routeros_summary",
        packet_loss_assessment=assess_packet_loss(packet_loss),
        average_latency_assessment=assess_average_latency(average_latency),
        maximum_latency_assessment=assess_maximum_latency(maximum_latency),
    )


def test_weak_signal_can_remain_operational_with_attention() -> None:
    health = calculate_link_health(
        make_peer(-84),
        make_ping(packet_loss=0, average_latency=3, maximum_latency=52),
    )

    assert health.score == 88
    assert health.status == "operational_attention"
    assert "pouca margem" in health.summary
    assert len(health.components) == 5


def test_loss_and_high_latency_make_link_unstable() -> None:
    health = calculate_link_health(
        make_peer(-84),
        make_ping(packet_loss=20, average_latency=80, maximum_latency=150),
    )

    assert health.score == 55
    assert health.status == "unstable"
    assert "20% de perda" in health.summary


def test_missing_peer_is_critical_even_when_ping_responds() -> None:
    health = calculate_link_health(
        None,
        make_ping(packet_loss=0, average_latency=3, maximum_latency=4),
    )

    assert health.status == "critical"
    assert "Não há peer associado" in health.summary
