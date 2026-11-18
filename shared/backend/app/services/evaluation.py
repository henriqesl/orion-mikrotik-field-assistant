from app.models.mikrotik import (
    HealthComponent,
    LinkHealthAssessment,
    MetricAssessment,
    PingResult,
    WiFiPeer,
)


HEALTH_WEIGHTS = {
    "packet_loss": 30,
    "association": 25,
    "average_latency": 20,
    "signal": 15,
    "maximum_latency": 10,
}
ASSESSMENT_SCORES = {
    "excellent": 100,
    "good": 85,
    "attention": 65,
    "weak": 40,
    "critical": 0,
    "informational": 85,
    "unavailable": None,
}


def _assessment(
    status: str,
    label: str,
    explanation: str,
) -> MetricAssessment:
    return MetricAssessment(
        status=status,
        label=label,
        explanation=explanation,
    )


def assess_signal(signal_dbm: int | None) -> MetricAssessment:
    if signal_dbm is None:
        return _assessment(
            "unavailable",
            "Indisponível",
            "O equipamento não informou o nível de sinal.",
        )
    if signal_dbm >= -65:
        return _assessment(
            "excellent",
            "Muito bom",
            "Há boa margem de sinal para o enlace.",
        )
    if signal_dbm >= -72:
        return _assessment(
            "good",
            "Bom",
            "O nível de sinal está adequado.",
        )
    if signal_dbm >= -79:
        return _assessment(
            "attention",
            "Atenção",
            "O sinal tem margem reduzida; valide perda e latência.",
        )
    if signal_dbm >= -86:
        return _assessment(
            "weak",
            "Fraco",
            "O enlace pode funcionar, mas tem pouca margem.",
        )
    return _assessment(
        "critical",
        "Muito fraco",
        "O sinal exige alinhamento e validação do desempenho.",
    )


def assess_association(authorized: bool | None) -> MetricAssessment:
    if authorized is True:
        return _assessment(
            "good",
            "Autorizado",
            "O peer concluiu a autenticação.",
        )
    if authorized is False:
        return _assessment(
            "critical",
            "Não autorizado",
            "O peer aparece na tabela, mas não concluiu a autenticação.",
        )
    return _assessment(
        "informational",
        "Registrado",
        "A pilha Wireless não informou a autorização separadamente.",
    )


def assess_packet_loss(packet_loss_percent: float) -> MetricAssessment:
    if packet_loss_percent == 0:
        return _assessment(
            "excellent",
            "Excelente",
            "Todos os pacotes receberam resposta.",
        )
    if packet_loss_percent <= 1:
        return _assessment(
            "good",
            "Muito baixa",
            "A perda foi pequena, mas merece observação.",
        )
    if packet_loss_percent <= 5:
        return _assessment(
            "attention",
            "Atenção",
            "Há perda de pacotes; repita o teste para confirmar.",
        )
    if packet_loss_percent <= 20:
        return _assessment(
            "weak",
            "Instável",
            "A perda compromete a estabilidade; repita e investigue.",
        )
    return _assessment(
        "critical",
        "Crítica",
        "A perda é alta e compromete a comunicação.",
    )


def assess_average_latency(latency_ms: float | None) -> MetricAssessment:
    if latency_ms is None:
        return _assessment(
            "unavailable",
            "Sem resposta",
            "Não houve resposta suficiente para medir a média.",
        )
    if latency_ms <= 5:
        return _assessment(
            "excellent",
            "Excelente",
            "A latência média está muito baixa.",
        )
    if latency_ms <= 20:
        return _assessment(
            "good",
            "Boa",
            "A latência média está adequada.",
        )
    if latency_ms <= 50:
        return _assessment(
            "attention",
            "Atenção",
            "A latência média está acima do ideal para um enlace local.",
        )
    if latency_ms <= 100:
        return _assessment(
            "weak",
            "Alta",
            "A latência média pode afetar o uso do enlace.",
        )
    return _assessment(
        "critical",
        "Muito alta",
        "A latência média indica uma comunicação degradada.",
    )


def assess_maximum_latency(latency_ms: float | None) -> MetricAssessment:
    if latency_ms is None:
        return _assessment(
            "unavailable",
            "Sem resposta",
            "Não houve resposta suficiente para medir o pico.",
        )
    if latency_ms <= 10:
        return _assessment(
            "excellent",
            "Excelente",
            "Não foram observados picos relevantes.",
        )
    if latency_ms <= 50:
        return _assessment(
            "good",
            "Bom",
            "O maior tempo de resposta permanece aceitável.",
        )
    if latency_ms <= 100:
        return _assessment(
            "attention",
            "Atenção",
            "Foi observado um pico de latência.",
        )
    if latency_ms <= 200:
        return _assessment(
            "weak",
            "Alto",
            "O pico pode indicar interferência ou congestionamento.",
        )
    return _assessment(
        "critical",
        "Muito alto",
        "O pico de latência indica instabilidade importante.",
    )


def _component(
    metric: str,
    label: str,
    assessment: MetricAssessment,
    metric_score: int | None = None,
) -> HealthComponent:
    score = (
        ASSESSMENT_SCORES[assessment.status]
        if metric_score is None
        else metric_score
    )
    weight = HEALTH_WEIGHTS[metric]
    contribution = 0 if score is None else (score / 100) * weight

    return HealthComponent(
        metric=metric,
        label=label,
        weight=weight,
        metric_score=score,
        contribution=round(contribution, 2),
        assessment=assessment,
    )


def _health_status(
    score: int,
    peer: WiFiPeer | None,
    ping: PingResult,
) -> tuple[str, str]:
    if peer is None or peer.authorized is False:
        return "critical", "Crítico"
    if ping.packet_loss_percent > 20:
        return "critical", "Crítico"
    if (
        ping.packet_loss_percent > 5
        or ping.average_latency_assessment.status == "critical"
        or ping.maximum_latency_assessment.status == "critical"
    ):
        return "unstable", "Instável"
    if score >= 90 and peer.signal_assessment.status in {"excellent", "good"}:
        return "operational", "Operacional"
    if score >= 75:
        return "operational_attention", "Operacional com atenção"
    if score >= 50:
        return "unstable", "Instável"
    return "critical", "Crítico"


def _health_text(
    status: str,
    peer: WiFiPeer | None,
    ping: PingResult,
) -> tuple[str, str]:
    if peer is None:
        return (
            "Não há peer associado, mesmo que o destino de ping possa responder por outra interface.",
            "Verifique a configuração Wi-Fi, o SSID e a associação com o outro rádio.",
        )
    if peer.authorized is False:
        return (
            "O peer foi detectado, mas não concluiu a autenticação.",
            "Confira senha, perfil de segurança e permissões do enlace.",
        )
    if ping.packet_loss_percent > 5:
        return (
            f"O destino respondeu com {ping.packet_loss_percent:g}% de perda de pacotes.",
            "Repita o teste e verifique alinhamento, interferência e configuração da bridge.",
        )
    if (
        peer.signal_assessment.status in {"weak", "critical"}
        and ping.packet_loss_percent == 0
        and ping.average_latency_assessment.status in {"excellent", "good"}
    ):
        return (
            "O enlace está funcionando sem perda e com baixa latência média, mas o sinal tem pouca margem.",
            "Otimize o alinhamento quando possível; a comunicação atual está funcional.",
        )
    if status == "operational":
        return (
            "Associação, perda, latência e sinal estão em faixas adequadas.",
            "O enlace está operacional; continue com as demais validações de campo.",
        )
    if status == "operational_attention":
        return (
            "O enlace responde, mas pelo menos um indicador requer atenção.",
            "Revise os indicadores destacados antes de concluir a instalação.",
        )
    if status == "unstable":
        return (
            "A comunicação apresenta perda, latência ou margem insuficiente.",
            "Investigue os indicadores críticos e repita o teste.",
        )
    return (
        "O enlace não possui condições suficientes para uma validação confiável.",
        "Corrija associação e conectividade antes de continuar.",
    )


def calculate_link_health(
    peer: WiFiPeer | None,
    ping: PingResult,
) -> LinkHealthAssessment:
    association_assessment = (
        peer.association_assessment
        if peer is not None
        else _assessment(
            "critical",
            "Sem associação",
            "Nenhum peer aparece na registration table.",
        )
    )
    association_score = 0 if peer is None or peer.authorized is False else 100
    signal_assessment = (
        peer.signal_assessment
        if peer is not None
        else _assessment(
            "critical",
            "Sem sinal",
            "Não há peer associado para medir o sinal.",
        )
    )
    components = [
        _component(
            "packet_loss",
            "Perda de pacotes",
            ping.packet_loss_assessment,
        ),
        _component(
            "association",
            "Associação",
            association_assessment,
            association_score,
        ),
        _component(
            "average_latency",
            "Latência média",
            ping.average_latency_assessment,
        ),
        _component("signal", "Sinal", signal_assessment),
        _component(
            "maximum_latency",
            "Latência máxima",
            ping.maximum_latency_assessment,
        ),
    ]
    available_weight = sum(
        component.weight
        for component in components
        if component.metric_score is not None
    )
    contribution = sum(component.contribution for component in components)
    score = round((contribution / available_weight) * 100) if available_weight else 0
    status, status_label = _health_status(score, peer, ping)
    summary, recommendation = _health_text(status, peer, ping)

    return LinkHealthAssessment(
        score=score,
        status=status,
        status_label=status_label,
        summary=summary,
        recommendation=recommendation,
        components=components,
    )
