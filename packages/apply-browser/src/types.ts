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


export interface BrowserControlOption {
  readonly value: string;
  readonly label: string;
  readonly disabled: boolean;
}

export interface BrowserControlSnapshot {
  readonly controlRef: string;
  readonly kind: 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'file' | 'unknown';
  readonly label: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly options: readonly BrowserControlOption[];
  readonly semanticHints: readonly string[];
  readonly accept: string | null;
  readonly multiple: boolean;
  readonly sectionLabel: string | null;
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
  setChecked(selector: string, checked: boolean): Promise<void>;
  click(selector: string): Promise<void>;
  upload(selector: string, file: BrowserUploadFile): Promise<void>;
  wait(milliseconds: number): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  scanControls(): Promise<readonly BrowserControlSnapshot[]>;
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
