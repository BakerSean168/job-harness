import type { Express, RequestHandler } from 'express';
import type { JobHarnessRestV1RouteContract } from '@job-harness/contracts';

export function registerRestV1Route(
  app: Express,
  apiPrefix: string,
  contract: JobHarnessRestV1RouteContract,
  handler: RequestHandler,
): void {
  const path = `${apiPrefix}${contract.path}`;
  switch (contract.method) {
    case 'get': app.get(path, handler); return;
    case 'post': app.post(path, handler); return;
    case 'put': app.put(path, handler); return;
    case 'patch': app.patch(path, handler); return;
    case 'delete': app.delete(path, handler); return;
  }
}
