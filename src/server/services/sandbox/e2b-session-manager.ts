import { type CommandHandle, Sandbox, type SandboxOpts } from 'e2b';

const DEFAULT_SANDBOX_TIMEOUT_MS = 300_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface E2BSandboxConfig {
  apiKey?: string;
  apiUrl?: string;
  debug?: boolean;
  domain?: string;
  requestTimeoutMs: number;
  sandboxUrl?: string;
  template?: string;
  timeoutMs: number;
}

interface E2BSandboxSession {
  commandHandles: Map<string, CommandHandle>;
  lastAccessAt: number;
  sandbox: Sandbox;
}

const sessions = new Map<string, E2BSandboxSession>();

const optionalString = (value: string | undefined) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readBoolean = (value: string | undefined) => {
  if (!value) return undefined;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

export const isE2BSandboxProviderEnabled = () => {
  const provider = optionalString(process.env.SANDBOX_PROVIDER)?.toLowerCase();
  return provider === 'e2b' || provider === 'local' || provider === 'agent-sandbox';
};

export const getE2BSandboxConfig = (): E2BSandboxConfig => {
  const timeoutSeconds = readPositiveInteger(
    process.env.SANDBOX_TIMEOUT || process.env.E2B_SANDBOX_TIMEOUT,
    DEFAULT_SANDBOX_TIMEOUT_MS / 1000,
  );

  return {
    apiKey: optionalString(process.env.E2B_API_KEY),
    apiUrl: optionalString(process.env.E2B_API_URL),
    debug: readBoolean(process.env.E2B_DEBUG),
    domain: optionalString(process.env.E2B_DOMAIN),
    requestTimeoutMs: readPositiveInteger(
      process.env.E2B_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    sandboxUrl: optionalString(process.env.E2B_SANDBOX_URL),
    template: optionalString(process.env.E2B_TEMPLATE_ID || process.env.E2B_TEMPLATE),
    timeoutMs: timeoutSeconds * 1000,
  };
};

export class E2BSandboxSessionManager {
  private readonly config: E2BSandboxConfig;

  constructor(config: E2BSandboxConfig = getE2BSandboxConfig()) {
    this.config = config;
  }

  async getSandbox(topicId: string, userId: string): Promise<Sandbox> {
    await this.cleanupExpiredSessions();

    const existing = sessions.get(topicId);
    if (existing) {
      try {
        await existing.sandbox.setTimeout(this.config.timeoutMs, {
          requestTimeoutMs: this.config.requestTimeoutMs,
        });
        existing.lastAccessAt = Date.now();
        return existing.sandbox;
      } catch {
        sessions.delete(topicId);
      }
    }

    const opts = this.createSandboxOptions(topicId, userId);
    const sandbox = this.config.template
      ? await Sandbox.create(this.config.template, opts)
      : await Sandbox.create(opts);

    sessions.set(topicId, {
      commandHandles: new Map(),
      lastAccessAt: Date.now(),
      sandbox,
    });

    return sandbox;
  }

  getCommandHandle(topicId: string, commandId: string): CommandHandle | undefined {
    return sessions.get(topicId)?.commandHandles.get(commandId);
  }

  setCommandHandle(topicId: string, commandId: string, handle: CommandHandle) {
    const session = sessions.get(topicId);
    session?.commandHandles.set(commandId, handle);
  }

  deleteCommandHandle(topicId: string, commandId: string) {
    sessions.get(topicId)?.commandHandles.delete(commandId);
  }

  async cleanupExpiredSessions(now = Date.now()) {
    const killPromises: Promise<void>[] = [];

    for (const [topicId, session] of sessions) {
      if (now - session.lastAccessAt <= this.config.timeoutMs) continue;

      sessions.delete(topicId);
      killPromises.push(session.sandbox.kill().catch(() => undefined));
    }

    await Promise.all(killPromises);
  }

  private createSandboxOptions(topicId: string, userId: string): SandboxOpts {
    return {
      allowInternetAccess: true,
      apiKey: this.config.apiKey,
      apiUrl: this.config.apiUrl,
      debug: this.config.debug,
      domain: this.config.domain,
      metadata: {
        topicId,
        userId,
      },
      requestTimeoutMs: this.config.requestTimeoutMs,
      sandboxUrl: this.config.sandboxUrl,
      timeoutMs: this.config.timeoutMs,
    };
  }
}

export const resetE2BSandboxSessionsForTest = () => {
  sessions.clear();
};
