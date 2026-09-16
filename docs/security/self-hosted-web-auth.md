# Self-hosted Web authentication

Job Harness Web supports an optional single-user session layer for self-hosted deployments.

## Boundary

The credentials are deliberately separate:

```text
Browser
  -> signed HttpOnly Web session cookie
  -> Next.js Web server
  -> server-only JOB_HARNESS_AUTH_TOKEN
  -> Job Harness REST API
```

The browser never receives `JOB_HARNESS_AUTH_TOKEN`, the configured Web password, or the session-signing secret.

## Enable login

Set both:

```bash
JOB_HARNESS_WEB_PASSWORD='use-a-long-password'
JOB_HARNESS_WEB_SESSION_SECRET='at-least-32-random-characters'
```

Generate the signing secret with a cryptographically secure source, for example:

```bash
openssl rand -base64 48
```

Optional settings:

```bash
JOB_HARNESS_WEB_SESSION_TTL_HOURS=168
JOB_HARNESS_WEB_COOKIE_SECURE=true
```

`JOB_HARNESS_WEB_COOKIE_SECURE` defaults to `true` in production and `false` in development. Only set it to `false` for trusted HTTP environments such as local development or a deliberately HTTP-only private Tailnet path. Public/reverse-proxied deployments should use HTTPS and secure cookies.

If `JOB_HARNESS_WEB_PASSWORD` is unset, Web session authentication is disabled so local/Tailnet-only development remains frictionless. If a password is present but the signing secret is missing/too short or the TTL is invalid, the Web layer fails closed and shows a configuration error instead of exposing the workspace.

## Session properties

- HMAC-SHA-256 signed token;
- random nonce per login;
- absolute expiration, seven days by default;
- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` in production by default;
- no password/API credential/user data stored in the cookie;
- logout explicitly expires the cookie.

Login and logout POST handlers compare `Origin` with the external `Host`/`X-Forwarded-Host` and protocol. Redirects also use the external host/protocol so Tailscale and reverse-proxy deployments do not accidentally jump to an internal `localhost` origin.

## Scope

This is intentionally a single-user self-hosted boundary, not a multi-user identity system. It does not add user/tenant ownership to Career domain objects. OAuth/OIDC, organizations, roles and per-record authorization remain outside Web V1 until there is evidence the product needs them.
