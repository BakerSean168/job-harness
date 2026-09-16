import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startJobHarnessServer, type RunningJobHarnessServer } from '../src';

let running: RunningJobHarnessServer | null = null;
let dir: string | null = null;

afterEach(async () => {
  if (running) await running.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  running = null;
  dir = null;
});

describe('standalone Streamable HTTP MCP server', () => {
  it('lists Job Harness tools and executes a real SQLite-backed pipeline read', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-server-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'),
      host: '127.0.0.1',
      port: 0,
    });

    const client = new Client({ name: 'job-harness-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(running.mcpUrl));
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain('career_jobs_search');
    expect(tools.tools.map((tool) => tool.name)).toContain('career_application_record');

    const result = await client.callTool({ name: 'career_pipeline_stats', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ knownJobs: 0, applications: 0 });

    await client.close();
  });

  it('enforces bearer authentication when configured', async () => {
    dir = await mkdtemp(join(tmpdir(), 'job-harness-server-auth-'));
    running = await startJobHarnessServer({
      databasePath: join(dir, 'career.db'),
      host: '127.0.0.1',
      port: 0,
      authToken: 'test-secret',
    });
    const response = await fetch(running.mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(response.status).toBe(401);
  });
});
