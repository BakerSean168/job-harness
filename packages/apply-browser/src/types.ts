export interface BrowserBackendDescriptor {
  readonly id: string;
  readonly kind: 'managed-remote' | 'local-cdp' | 'extension';
  readonly persistentSession: boolean;
  readonly humanControl: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface BrowserSessionRequest {
  readonly preferredUrl?: string | null;
  readonly reuseLiveSession?: boolean;
}

export interface BrowserUploadFile {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface BrowserDriverPort {
  navigate(url: string): Promise<void>;
  currentUrl(): string;
  title(): Promise<string>;
  bodyText(limit?: number): Promise<string>;
  exists(selector: string): Promise<boolean>;
  text(selector: string): Promise<string | null>;
  fill(selector: string, value: string): Promise<void>;
  select(selector: string, value: string | readonly string[]): Promise<void>;
  click(selector: string): Promise<void>;
  upload(selector: string, file: BrowserUploadFile): Promise<void>;
  wait(milliseconds: number): Promise<void>;
  screenshot(): Promise<Uint8Array>;
}

export interface BrowserSessionPort {
  readonly backendId: string;
  readonly sessionId: string;
  readonly humanControlUrl: string | null;
  driver(): BrowserDriverPort;
  persist(): Promise<void>;
  release(): Promise<void>;
}

export interface BrowserBackendPort {
  readonly id: string;
  describe(): BrowserBackendDescriptor;
  health(): Promise<{ ok: boolean; detail: string | null }>;
  acquire(request?: BrowserSessionRequest): Promise<BrowserSessionPort>;
}
