"""Minimal non-interactive RouterOS MAC-Telnet client.

Protocol authentication was adapted from MarginResearch/mikrotik_authentication,
Copyright 2019 Margin Research, licensed under Apache-2.0. The ORION adaptation
removes the interactive terminal and restricts the client to short-lived commands.
See THIRD_PARTY_NOTICES.md.
"""

from __future__ import annotations

import hashlib
import secrets
import socket
import struct
import time
from dataclasses import dataclass, field

import ecdsa


PORT = 20561
HEADER_LENGTH = 22
MAGIC = b"\x56\x34\x12\xff"
START, DATA, ACK, END = 0, 1, 2, 255
CP_BEGIN, CP_KEY, CP_PASSWORD, CP_USERNAME = 0, 1, 2, 3
CP_TERMINAL, CP_WIDTH, CP_HEIGHT, CP_END = 4, 5, 6, 9


class MacTelnetError(Exception):
    pass


class MacTelnetTimeoutError(MacTelnetError):
    pass


class MacTelnetAuthenticationError(MacTelnetError):
    pass


def _inverse(value: int, modulus: int) -> int:
    return pow(value, -1, modulus)


def _legendre(value: int, prime: int) -> int:
    result = pow(value, (prime - 1) // 2, prime)
    return -1 if result == prime - 1 else result


def _square_roots(value: int, prime: int) -> list[int]:
    value %= prime
    if value == 0:
        return [0]
    if _legendre(value, prime) != 1:
        return []
    if prime % 4 == 3:
        root = pow(value, (prime + 1) // 4, prime)
        return [root, prime - root]
    q, shifts = prime - 1, 0
    while q % 2 == 0:
        shifts += 1
        q //= 2
    non_residue = 2
    while _legendre(non_residue, prime) != -1:
        non_residue += 1
    c = pow(non_residue, q, prime)
    root = pow(value, (q + 1) // 2, prime)
    residue = pow(value, q, prime)
    order = shifts
    while residue != 1:
        exponent = 2
        index = 1
        while index < order and pow(residue, exponent, prime) != 1:
            exponent *= 2
            index += 1
        factor = pow(c, 2 ** (order - index - 1), prime)
        root = root * factor % prime
        residue = residue * factor * factor % prime
        c = factor * factor % prime
        order = index
    return [root, prime - root]


class _RouterOsCurve:
    def __init__(self) -> None:
        self.prime = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFED
        self.order = 0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED
        self.montgomery_a = 486662
        self.from_montgomery = self.montgomery_a * _inverse(3, self.prime) % self.prime
        self.conversion = (self.prime - self.from_montgomery) % self.prime
        a = 0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA984914A144
        b = 0x7B425ED097B425ED097B425ED097B425ED097B425ED097B4260B5E9C7710C864
        self.curve = ecdsa.ellipticcurve.CurveFp(self.prime, a, b, 8)
        self.generator = self.lift_x(9, 0)

    def lift_x(self, x_value: int, parity: int):
        x_value %= self.prime
        y_squared = (x_value**3 + self.montgomery_a * x_value**2 + x_value) % self.prime
        x_weierstrass = (x_value + self.from_montgomery) % self.prime
        roots = _square_roots(y_squared, self.prime)
        if not roots:
            return None
        for root in roots:
            if root & 1 == parity:
                return ecdsa.ellipticcurve.PointJacobi(
                    self.curve, x_weierstrass, root, 1, self.order
                )
        return None

    def public_key(self, private: bytes) -> tuple[bytes, int]:
        point = int.from_bytes(private, "big") * self.generator
        return self.to_montgomery(point)

    def to_montgomery(self, point) -> tuple[bytes, int]:
        x_value = (point.x() + self.conversion) % self.prime
        return x_value.to_bytes(32, "big"), point.y() & 1

    def password_point(self, value: bytes):
        candidate = hashlib.sha256(value).digest()
        while True:
            hashed = hashlib.sha256(candidate).digest()
            point = self.lift_x(int.from_bytes(hashed, "big"), 1)
            if point is not None:
                return point
            candidate = (int.from_bytes(candidate, "big") + 1).to_bytes(32, "big")


def _control(packet_type: int, data: bytes = b"") -> bytes:
    return struct.pack(">4sbI", MAGIC, packet_type, len(data)) + data


@dataclass
class _Packet:
    message_type: int
    src: bytes
    dst: bytes
    session_id: int
    counter: int = 0
    data: bytes = b""
    controls: list[tuple[int, bytes]] = field(default_factory=list)

    def encode(self) -> bytes:
        body = b"".join(_control(kind, value) for kind, value in self.controls) if self.controls else self.data
        return struct.pack(">BB6s6sHHI", 1, self.message_type, self.src, self.dst, self.session_id, 21, self.counter) + body

    @classmethod
    def decode(cls, raw: bytes) -> "_Packet":
        if len(raw) < HEADER_LENGTH:
            raise ValueError("short packet")
        version, message_type, src, dst, session_id, _client_type, counter = struct.unpack(">BB6s6sHHI", raw[:HEADER_LENGTH])
        if version != 1:
            raise ValueError("unsupported protocol version")
        body = raw[HEADER_LENGTH:]
        controls: list[tuple[int, bytes]] = []
        if body.startswith(MAGIC):
            while body:
                if len(body) < 9:
                    raise ValueError("short control packet")
                magic, kind, length = struct.unpack(">4sbI", body[:9])
                if magic != MAGIC or length > len(body) - 9:
                    raise ValueError("invalid control packet")
                controls.append((kind, body[9 : 9 + length]))
                body = body[9 + length :]
        return cls(message_type, src, dst, session_id, counter, body, controls)

    @property
    def payload_length(self) -> int:
        return len(self.encode()) - HEADER_LENGTH


class MacTelnetClient:
    """Execute one command and close the layer-2 session immediately."""

    def __init__(self, target_mac: str, source_mac: str, local_ip: str, username: str, password: str, timeout: float = 8.0):
        self.target = bytes.fromhex(target_mac.replace(":", ""))
        self.source = bytes.fromhex(source_mac.replace(":", ""))
        self.local_ip = local_ip
        self.username = username
        self.password = password
        self.timeout = timeout
        self.session_id = secrets.randbits(16)
        self.sent_counter = 0
        self.received_counter = 0
        self.curve = _RouterOsCurve()

    def _packet(self, message_type: int, *, data: bytes = b"", controls=None) -> _Packet:
        return _Packet(message_type, self.source, self.target, self.session_id, self.sent_counter, data, controls or [])

    def _confirmation(self, client_private: bytes, client_public: bytes, server_data: bytes) -> bytes:
        if len(server_data) < 49:
            raise MacTelnetAuthenticationError("O RouterOS enviou uma autenticação MAC inválida.")
        server_public, parity, salt = server_data[:32], server_data[32], server_data[33:]
        if len(salt) != 16:
            raise MacTelnetAuthenticationError("Usuário não encontrado no MikroTik.")
        validator = hashlib.sha256(salt + hashlib.sha256(f"{self.username}:{self.password}".encode()).digest()).digest()
        validator_point = self.curve.password_point(self.curve.public_key(validator)[0])
        server_point = self.curve.lift_x(int.from_bytes(server_public, "big"), parity)
        if server_point is None:
            raise MacTelnetAuthenticationError("Chave de autenticação MAC inválida.")
        combined = server_point + validator_point
        key_hash = hashlib.sha256(client_public + server_public).digest()
        scalar = (int.from_bytes(validator, "big") * int.from_bytes(key_hash, "big") + int.from_bytes(client_private, "big")) % self.curve.order
        shared, _ = self.curve.to_montgomery(scalar * combined)
        return hashlib.sha256(key_hash + shared).digest()

    def execute(self, command: str, sentinel: str) -> str:
        if len(command.encode("utf-8")) > 1200:
            raise ValueError("Comando MAC excede o limite seguro do ORION.")
        deadline = time.monotonic() + self.timeout
        private = secrets.token_bytes(32)
        public, parity = self.curve.public_key(private)
        output = bytearray()
        command_sent = False
        authenticated = False
        authentication_started = False
        last_packet: bytes | None = None
        last_send = 0.0
        retries = 0

        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
            udp.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            udp.bind((self.local_ip, PORT))
            udp.settimeout(0.4)

            def send(packet: _Packet, track: bool = True) -> None:
                nonlocal last_packet, last_send, retries
                raw = packet.encode()
                udp.sendto(raw, ("255.255.255.255", PORT))
                if track:
                    self.sent_counter = (self.sent_counter + packet.payload_length) % 65536
                    last_packet, last_send, retries = raw, time.monotonic(), 0

            send(self._packet(START))
            while time.monotonic() < deadline:
                try:
                    raw, _address = udp.recvfrom(4096)
                except socket.timeout:
                    if last_packet and time.monotonic() - last_send >= 0.8 and retries < 3:
                        udp.sendto(last_packet, ("255.255.255.255", PORT))
                        last_send, retries = time.monotonic(), retries + 1
                    continue
                try:
                    packet = _Packet.decode(raw)
                except ValueError:
                    continue
                if packet.session_id != self.session_id or packet.src != self.target or packet.dst != self.source:
                    continue
                if packet.message_type == ACK and not authenticated and not authentication_started:
                    auth_data = self.username.encode() + b"\0" + public + bytes([parity])
                    send(self._packet(DATA, controls=[(CP_BEGIN, b""), (CP_KEY, auth_data)]))
                    authentication_started = True
                elif packet.message_type == DATA:
                    ack = self._packet(ACK)
                    ack.counter = (packet.counter + packet.payload_length) % 65536
                    send(ack, track=False)
                    if packet.controls:
                        for kind, value in packet.controls:
                            if kind == CP_KEY:
                                confirmation = self._confirmation(private, public, value)
                                send(self._packet(DATA, controls=[
                                    (CP_PASSWORD, confirmation), (CP_USERNAME, self.username.encode()),
                                    (CP_TERMINAL, b"xterm"), (CP_WIDTH, (120).to_bytes(2, "little")),
                                    (CP_HEIGHT, (40).to_bytes(2, "little")),
                                ]))
                            elif kind == CP_END:
                                authenticated = True
                    else:
                        output.extend(packet.data)
                    decoded = output.decode("utf-8", errors="replace")
                    if authenticated and not command_sent:
                        send(self._packet(DATA, data=(command + "\r\n").encode()))
                        command_sent = True
                    if sentinel in decoded:
                        send(self._packet(DATA, data=b"/quit\r\n"), track=False)
                        return decoded
                    lowered = decoded.lower()
                    if "login failed" in lowered or "invalid user name or password" in lowered:
                        raise MacTelnetAuthenticationError("Usuário ou senha não foram aceitos pelo MikroTik.")
                elif packet.message_type == END:
                    if sentinel in output.decode("utf-8", errors="replace"):
                        return output.decode("utf-8", errors="replace")
                    break
        raise MacTelnetTimeoutError(
            "O MikroTik não respondeu ao acesso MAC. Confirme a mesma LAN e se o MAC Server está habilitado."
        )
