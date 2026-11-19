function ipv4Network(cidr) {
  const match = String(cidr || "").trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return null;
  const octets = match[1].split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  const address = octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
  const prefix = Number(match[2]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { address, mask, network: (address & mask) >>> 0 };
}

export function managementNetworksDiffer(first, second) {
  const a = ipv4Network(first);
  const b = ipv4Network(second);
  return Boolean(a && b && (((a.address & b.mask) >>> 0) !== b.network || ((b.address & a.mask) >>> 0) !== a.network));
}
