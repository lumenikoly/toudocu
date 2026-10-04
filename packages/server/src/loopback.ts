function validPort(value: string | undefined): boolean {
  return value === undefined || (Number(value) >= 1 && Number(value) <= 65_535);
}

function isLoopbackIPv4(hostname: string): boolean {
  const parts = hostname.split(':');
  if (parts.length > 2) return false;
  const [address, port] = parts;
  const octets = address!.split('.');
  return (
    validPort(port) &&
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)
  );
}

export function isLoopbackHost(authority: string): boolean {
  const host = authority.toLowerCase();
  const localhost = /^(localhost)(?::(\d{1,5}))?$/u.exec(host);
  if (localhost) return validPort(localhost[2]);
  if (host === '::1') return true;
  const ipv6 = /^\[::1\](?::(\d{1,5}))?$/u.exec(host);
  if (ipv6) return validPort(ipv6[1]);
  return isLoopbackIPv4(host);
}
