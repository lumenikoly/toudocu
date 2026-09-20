import { describe, expect, test } from 'vitest';
import { isLoopbackHost } from './loopback.js';

describe('loopback host validation', () => {
  test.each(['localhost', 'localhost:6419', '127.0.0.1', '127.2.3.4:80', '::1', '[::1]:6419'])(
    'accepts %s',
    (host) => expect(isLoopbackHost(host)).toBe(true),
  );

  test.each(['127.evil.example', 'evil@localhost', 'localhost.evil', '0x7f000001', '[::2]'])(
    'rejects %s',
    (host) => expect(isLoopbackHost(host)).toBe(false),
  );
});
