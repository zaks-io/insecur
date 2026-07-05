export type KeyStoreBackend =
  | "macos-keychain"
  | "windows-dpapi"
  | "linux-secret-tool"
  | "file-fallback";

export interface KeyStoreNotice {
  readonly code: "local_store.file_fallback_active";
  readonly summary: string;
}

export interface KeyStore {
  readonly backend: KeyStoreBackend;
  readonly notice: KeyStoreNotice | null;
  getOrCreateMachineRootKey(): Promise<string>;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export interface ExecFileOptions {
  readonly input?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxBuffer?: number;
  readonly windowsHide?: boolean;
}

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options?: ExecFileOptions,
) => Promise<ExecFileResult>;

export interface KeyStorePaths {
  readonly userConfigDir: string;
  readonly machineRootKeyFilePath: string;
  readonly machineRootKeyDpapiFilePath: string;
}

export interface KeyStoreDependencies {
  readonly execFile: ExecFileFn;
  readonly platform: NodeJS.Platform;
  readonly paths: KeyStorePaths;
  readonly env: NodeJS.ProcessEnv;
  readonly randomBytes: (size: number) => Uint8Array;
}

export interface CreateKeyStoreOptions {
  readonly service?: string;
  readonly account?: string;
  readonly execFile?: ExecFileFn;
  readonly platform?: NodeJS.Platform;
  readonly configHome?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly randomBytes?: (size: number) => Uint8Array;
}

export interface KeyStoreAdapter {
  readonly backend: KeyStoreBackend;
  readonly notice: KeyStoreNotice | null;
  getOrCreateMachineRootKey(): Promise<string>;
}
