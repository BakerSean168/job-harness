import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

interface PairingRecord {
  readonly codeHash: string;
  readonly expiresAt: string;
}

interface AgentTokenPayload {
  readonly v: 1;
  readonly aud: 'job-harness-browser-extension';
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export interface BrowserExtensionAuthOptions {
  readonly signingKey: string;
  readonly now?: () => Date;
  readonly pairingTtlMs?: number;
  readonly tokenTtlMs?: number;
}

export class BrowserExtensionAuth {
  private readonly signingKey: Buffer;
  private readonly now: () => Date;
  private readonly pairingTtlMs: number;
  private readonly tokenTtlMs: number;
  private readonly pairings = new Map<string, PairingRecord>();

  constructor(options: BrowserExtensionAuthOptions) {
    const key = options.signingKey.trim();
    if (key.length < 32) throw new Error('Browser extension signing key must contain at least 32 characters');
    this.signingKey = Buffer.from(key, 'utf8');
    this.now = options.now ?? (() => new Date());
    this.pairingTtlMs = options.pairingTtlMs ?? 5 * 60 * 1000;
    this.tokenTtlMs = options.tokenTtlMs ?? 90 * 24 * 60 * 60 * 1000;
  }

  createPairing(): { code: string; expiresAt: string } {
    this.reapPairings();
    if (this.pairings.size >= 20) throw new Error('Too many active browser-extension pairings');
    const raw = randomBytes(6).toString('hex').toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const expiresAt = new Date(this.now().getTime() + this.pairingTtlMs).toISOString();
    const codeHash = sha256(normalizePairingCode(code));
    this.pairings.set(codeHash, { codeHash, expiresAt });
    return { code, expiresAt };
  }

  exchangePairing(code: string, agentId: string): { agentToken: string; tokenExpiresAt: string } {
    this.reapPairings();
    const normalized = normalizePairingCode(code);
    const hash = sha256(normalized);
    const record = this.pairings.get(hash);
    if (!record || record.expiresAt <= this.now().toISOString()) throw new BrowserExtensionAuthError('PAIRING_INVALID', 'Browser extension pairing code is invalid or expired', 401);
    this.pairings.delete(hash); // one-time consumption happens before issuing the durable token
    return this.issueAgentToken(agentId);
  }

  verifyAgentToken(token: string, expectedAgentId: string): boolean {
    try {
      const [prefix, encoded, signature] = token.split('.');
      if (prefix !== 'jhbe1' || !encoded || !signature) return false;
      const signed = `${prefix}.${encoded}`;
      const expected = this.sign(signed);
      const left = Buffer.from(signature, 'base64url');
      const right = Buffer.from(expected, 'base64url');
      if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<AgentTokenPayload>;
      const nowSeconds = Math.floor(this.now().getTime() / 1000);
      return payload.v === 1
        && payload.aud === 'job-harness-browser-extension'
        && payload.sub === expectedAgentId
        && typeof payload.iat === 'number'
        && typeof payload.exp === 'number'
        && payload.iat <= nowSeconds + 60
        && payload.exp > nowSeconds
        && typeof payload.jti === 'string'
        && payload.jti.length >= 16;
    } catch { return false; }
  }

  private issueAgentToken(agentId: string): { agentToken: string; tokenExpiresAt: string } {
    const now = this.now();
    const expires = new Date(now.getTime() + this.tokenTtlMs);
    const payload: AgentTokenPayload = {
      v: 1,
      aud: 'job-harness-browser-extension',
      sub: agentId,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expires.getTime() / 1000),
      jti: randomBytes(16).toString('base64url'),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signed = `jhbe1.${encoded}`;
    return { agentToken: `${signed}.${this.sign(signed)}`, tokenExpiresAt: expires.toISOString() };
  }

  private sign(value: string): string {
    return createHmac('sha256', this.signingKey).update(value).digest('base64url');
  }

  private reapPairings(): void {
    const now = this.now().toISOString();
    for (const [key, record] of this.pairings) if (record.expiresAt <= now) this.pairings.delete(key);
  }
}

export class BrowserExtensionAuthError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'BrowserExtensionAuthError';
  }
}

function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-F0-9]/g, '');
}
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
