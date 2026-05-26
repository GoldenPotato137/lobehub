import { type CommandHandle, ConnectionConfig, Sandbox, type SandboxOpts } from 'e2b';

const DEFAULT_SANDBOX_TIMEOUT_MS = 300_000;
const DEFAULT_AGENT_SANDBOX_TIMEOUT_MS = 600_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_AGENT_SANDBOX_TEMPLATE = 'code-interpreter';

export interface E2BSandboxConfig {
  apiKey?: string;
  apiUrl?: string;
  debug?: boolean;
  domain?: string;
  requestTimeoutMs: number;
  routerMode?: 'path' | 'wildcard';
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
let isPathRouterApplied = false;

const optionalString = (value: string | undefined) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const getSandboxProvider = () => optionalString(process.env.SANDBOX_PROVIDER)?.toLowerCase();

const isAgentSandboxProvider = (provider: string | undefined) =>
  provider === 'agent-sandbox' || provider === 'local';

const normalizeAgentSandboxApiUrl = (apiUrl: string | undefined, provider: string | undefined) => {
  const trimmed = optionalString(apiUrl);
  if (!trimmed || !isAgentSandboxProvider(provider)) return trimmed;

  const withoutTrailingSlash = trimTrailingSlashes(trimmed);
  if (/\/e2b\/v1$/i.test(new URL(withoutTrailingSlash).pathname)) return withoutTrailingSlash;

  return `${withoutTrailingSlash}/e2b/v1`;
};

const getDomainFromApiUrl = (apiUrl: string | undefined) => {
  if (!apiUrl) return undefined;

  try {
    return new URL(apiUrl).host;
  } catch {
    return undefined;
  }
};

const isPathRouterDomain = (domain: string | undefined) => {
  if (!domain) return false;

  const host = domain
    .replace(/^\[/, '')
    .replace(/\](:\d+)?$/, '')
    .split(':')[0];
  return host === 'localhost' || host === '::1' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
};

const readBoolean = (value: string | undefined) => {
  if (!value) return undefined;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const readRouterMode = (provider: string | undefined, domain: string | undefined) => {
  const routerMode = optionalString(process.env.E2B_SANDBOX_ROUTER)?.toLowerCase();

  if (routerMode && ['path', 'router', 'no-wildcard', 'no_wildcard'].includes(routerMode)) {
    return 'path';
  }

  if (routerMode && ['wildcard', 'domain'].includes(routerMode)) return 'wildcard';

  return isAgentSandboxProvider(provider) && isPathRouterDomain(domain) ? 'path' : 'wildcard';
};

const applyPathRouter = () => {
  if (isPathRouterApplied) return;

  const prototype = ConnectionConfig.prototype as unknown as {
    getHost: (sandboxId: string, port: number, sandboxDomain?: string) => string;
    getSandboxUrl: (
      sandboxId: string,
      opts: { envdPort: number; sandboxDomain?: string },
    ) => string;
  };

  prototype.getHost = function (this: ConnectionConfig, sandboxId, port, sandboxDomain) {
    const domain = sandboxDomain || this.domain;
    return `${domain}/sandboxes/router/${sandboxId}/${port}`;
  };

  prototype.getSandboxUrl = function (
    this: ConnectionConfig,
    sandboxId,
    opts: { envdPort: number; sandboxDomain?: string },
  ) {
    if (this.sandboxUrl) return this.sandboxUrl;

    const protocol = new URL(this.apiUrl).protocol;
    return `${protocol}//${prototype.getHost.call(this, sandboxId, opts.envdPort, opts.sandboxDomain)}`;
  };

  isPathRouterApplied = true;
};

export const isE2BSandboxProviderEnabled = () => {
  const provider = getSandboxProvider();
  return provider === 'e2b' || isAgentSandboxProvider(provider);
};

export const getE2BSandboxConfig = (): E2BSandboxConfig => {
  const provider = getSandboxProvider();
  const apiUrl = normalizeAgentSandboxApiUrl(process.env.E2B_API_URL, provider);
  const domain = optionalString(process.env.E2B_DOMAIN) || getDomainFromApiUrl(apiUrl);
  const defaultTimeoutMs = isAgentSandboxProvider(provider)
    ? DEFAULT_AGENT_SANDBOX_TIMEOUT_MS
    : DEFAULT_SANDBOX_TIMEOUT_MS;
  const timeoutSeconds = readPositiveInteger(
    process.env.SANDBOX_TIMEOUT || process.env.E2B_SANDBOX_TIMEOUT,
    defaultTimeoutMs / 1000,
  );
  const routerMode = readRouterMode(provider, domain);

  return {
    apiKey: optionalString(process.env.E2B_API_KEY),
    apiUrl,
    debug: readBoolean(process.env.E2B_DEBUG),
    domain,
    requestTimeoutMs: readPositiveInteger(
      process.env.E2B_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    routerMode,
    sandboxUrl: optionalString(process.env.E2B_SANDBOX_URL),
    template:
      optionalString(process.env.E2B_TEMPLATE_ID || process.env.E2B_TEMPLATE) ||
      (isAgentSandboxProvider(provider) ? DEFAULT_AGENT_SANDBOX_TEMPLATE : undefined),
    timeoutMs: Math.max(timeoutSeconds * 1000, isAgentSandboxProvider(provider) ? 301_000 : 1),
  };
};

export class E2BSandboxSessionManager {
  private readonly config: E2BSandboxConfig;

  constructor(config: E2BSandboxConfig = getE2BSandboxConfig()) {
    this.config = config;

    if (this.config.routerMode === 'path') applyPathRouter();
  }

  async getSandbox(topicId: string, userId: string): Promise<Sandbox> {
    await this.cleanupExpiredSessions();

    const existing = sessions.get(topicId);
    if (existing) {
      if (this.config.routerMode === 'path') {
        existing.lastAccessAt = Date.now();
        return existing.sandbox;
      }

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
