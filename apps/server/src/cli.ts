import { startJobHarnessServer } from './server';
import { readServerRuntimeConfig } from './runtime-config';


const config = readServerRuntimeConfig();

const running = await startJobHarnessServer({
  ...config,
});
console.log(`Job Harness listening at ${running.url}`);
console.log(`MCP endpoint: ${running.mcpUrl}`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; shutting down Job Harness`);
  await running.close();
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
