from typing import Any


class ConfigurationConflictError(Exception):
    """The requested configuration cannot be applied safely."""


def _find_row(rows: list[dict], key: str, value: str) -> dict | None:
    return next((row for row in rows if row.get(key) == value), None)


def _record_id(row: dict[str, str], description: str) -> str:
    record_id = row.get(".id")
    if not record_id:
        raise ConfigurationConflictError(
            f"O RouterOS não informou o identificador de {description}."
        )
    return record_id


def _ensure_bridge(client: Any, context: dict[str, Any], name: str) -> None:
    bridge = _find_row(context["bridges"], "name", name)
    if bridge:
        client.run(
            "/interface/bridge/set",
            f"=.id={_record_id(bridge, 'bridge')}",
            "=disabled=no",
        )
        return

    client.run(
        "/interface/bridge/add",
        f"=name={name}",
        "=protocol-mode=rstp",
        "=comment=ORION Field - bridge do enlace",
    )


def _ensure_bridge_port(
    client: Any,
    context: dict[str, Any],
    interface: str,
    bridge: str,
) -> None:
    port = _find_row(context["bridge_ports"], "interface", interface)
    if port:
        client.run(
            "/interface/bridge/port/set",
            f"=.id={_record_id(port, f'porta {interface}')}",
            f"=bridge={bridge}",
            "=disabled=no",
        )
        return

    client.run(
        "/interface/bridge/port/add",
        f"=bridge={bridge}",
        f"=interface={interface}",
        "=comment=ORION Field - porta do enlace",
    )
