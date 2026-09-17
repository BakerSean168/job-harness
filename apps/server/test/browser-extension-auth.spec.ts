import { describe, expect, it } from 'vitest';
import { BrowserExtensionAuth } from '../src/browser-extension-auth';

describe('browser extension pairing/token auth', () => {
  it('uses a one-time short-lived code and binds the issued token to one agent id', () => {
    let now = new Date('2026-09-17T14:00:00.000Z');
    const auth = new BrowserExtensionAuth({
      signingKey: 'fixture-browser-extension-signing-key-0123456789',
      now: () => now,
      pairingTtlMs: 60_000,
      tokenTtlMs: 120_000,
    });
    const pairing = auth.createPairing();
    expect(pairing.code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    const issued = auth.exchangePairing(pairing.code.toLowerCase(), 'windows-chrome-primary');
    expect(auth.verifyAgentToken(issued.agentToken, 'windows-chrome-primary')).toBe(true);
    expect(auth.verifyAgentToken(issued.agentToken, 'different-agent')).toBe(false);
    expect(() => auth.exchangePairing(pairing.code, 'windows-chrome-primary')).toThrow(/invalid or expired/);
    now = new Date('2026-09-17T14:03:00.000Z');
    expect(auth.verifyAgentToken(issued.agentToken, 'windows-chrome-primary')).toBe(false);
  });

  it('expires unconsumed pairing codes without issuing a token', () => {
    let now = new Date('2026-09-17T14:00:00.000Z');
    const auth = new BrowserExtensionAuth({ signingKey: 'fixture-browser-extension-signing-key-0123456789', now: () => now, pairingTtlMs: 1_000 });
    const pairing = auth.createPairing();
    now = new Date('2026-09-17T14:00:02.000Z');
    expect(() => auth.exchangePairing(pairing.code, 'windows-chrome-primary')).toThrow(/invalid or expired/);
  });
});
