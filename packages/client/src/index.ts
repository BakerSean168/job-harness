/**
 * Host-neutral client boundary placeholder.
 * Phase 0 intentionally exports only the transport shape; HTTP/MCP implementations arrive later.
 */
export interface JobHarnessClientTransport {
  request<TResponse>(operation: string, input: unknown): Promise<TResponse>;
}
