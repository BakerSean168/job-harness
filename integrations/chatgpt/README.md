# ChatGPT integration package

Job Harness is exposed to ChatGPT as a **custom MCP app**. The integration is intentionally transport-only: ChatGPT never receives SQLite paths, Resume source files, or a direct database capability. Every read/write goes through the same application ports, contracts, idempotency rules, Resume revision model, and `SubmissionIntent` recovery boundary used by the Web UI.

## Recommended production topology

Oracle2 keeps Job Harness private on loopback/Tailnet. ChatGPT should therefore connect through OpenAI **Secure MCP Tunnel**, not by exposing port `20901` to the public Internet.

```text
ChatGPT custom MCP app
        |
        | OpenAI-hosted Secure MCP Tunnel
        v
Oracle2 tunnel-client (outbound HTTPS only)
        |
        | http://127.0.0.1:20901/mcp
        | Authorization: Bearer <Job Harness token>
        v
Job Harness MCP -> application ports -> SQLite / Resume runtime
```

The repository includes `tunnel-client.profile.example.yaml`. A **dedicated tunnel ID** is recommended for Job Harness so its connector's `main` channel maps only to this MCP surface. Do not repoint an unrelated tunnel's `main` channel or merge unrelated filesystem/server administration tools into the Job Harness app.

Current OpenAI guidance says ChatGPT connects to remote MCP servers, and private/local servers should use Secure MCP Tunnel rather than becoming publicly reachable. Full custom-MCP write actions are managed through ChatGPT custom apps/developer mode and may require workspace approval. Product availability and UI can change, so use current OpenAI documentation when activating the connector.

References:

- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/openai/tunnel-client

## What is packaged here

- `workflow-policy.md` — normative AI workflow and recovery rules.
- `app-profile.yaml` — app-facing name, connection and tool-group metadata; contains no credential.
- `tunnel-client.profile.example.yaml` — downstream private MCP binding with secret references only.
- `tunnel-client.env.example` — names of required secret/environment values.
- `starter-prompts.md` — recommended ChatGPT starter prompts.
- `apps/server/scripts/chatgpt-mcp-smoke.ts` — authenticated MCP protocol smoke using the official MCP SDK.
- `scripts/check-chatgpt-integration.ts` — CI/static guard for required tools and safety invariants.

## Activation checklist

1. In OpenAI Tunnels management, create a **dedicated Job Harness tunnel** and a runtime API key. Keep the admin key out of the daemon.
2. Install a current supported `openai/tunnel-client` release on Oracle2.
3. Copy the profile example to the private tunnel-client profile directory and replace only the tunnel ID. Keep `control_plane.api_key` and downstream `Authorization` as `env:`/`file:` secret references.
4. Make the tunnel daemon depend on the Job Harness Server health, run `tunnel-client doctor`, then verify `/readyz` before configuring ChatGPT.
5. In ChatGPT developer/custom-app settings, create the Job Harness app using the dedicated Secure MCP Tunnel and scan the tool catalog.
6. Confirm the tool catalog contains the Career, Resume and SubmissionIntent surfaces expected by `scripts/check-chatgpt-integration.ts`.
7. Test read-only prompts first. Then test a reversible state write such as Job triage. Do not use a real recruiting-site submission as the first write test.
8. Refresh/review the app whenever tool schemas change; do not assume an already-approved app automatically picks up a new tool contract.

## Local authenticated smoke

Against Oracle2 loopback:

```bash
export JOB_HARNESS_CHATGPT_MCP_URL=http://127.0.0.1:20901/mcp
export JOB_HARNESS_CHATGPT_MCP_TOKEN="$JOB_HARNESS_AUTH_TOKEN"
pnpm smoke:chatgpt-mcp
```

The smoke performs MCP discovery and only safe reads (`career_pipeline_stats`, `career_submission_intents_list`, `resume_profiles_list`). It never mutates Career state or calls an external website.

## Current activation boundary

The code/package can be fully validated without a ChatGPT account credential. Creating the dedicated OpenAI tunnel ID and approving the custom app are control-plane/workspace actions and are intentionally not encoded in this repository. Until a dedicated tunnel is provisioned, Oracle2's existing unrelated Secure MCP Tunnel must remain untouched.
