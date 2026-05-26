// @vitest-environment node
import { Sandbox } from 'e2b';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  E2BSandboxSessionManager,
  getE2BSandboxConfig,
  isE2BSandboxProviderEnabled,
  resetE2BSandboxSessionsForTest,
} from './e2b-session-manager';

const ORIGINAL_ENV = process.env;

describe('e2b session manager config', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetE2BSandboxSessionsForTest();
    vi.restoreAllMocks();
  });

  it('requires an explicit sandbox provider opt-in', () => {
    process.env = { ...ORIGINAL_ENV, SANDBOX_PROVIDER: undefined };
    expect(isE2BSandboxProviderEnabled()).toBe(false);

    process.env = { ...ORIGINAL_ENV, SANDBOX_PROVIDER: 'e2b' };
    expect(isE2BSandboxProviderEnabled()).toBe(true);

    process.env = { ...ORIGINAL_ENV, SANDBOX_PROVIDER: 'agent-sandbox' };
    expect(isE2BSandboxProviderEnabled()).toBe(true);
  });

  it('reads E2B endpoint and timeout settings from environment variables', () => {
    process.env = {
      ...ORIGINAL_ENV,
      E2B_API_KEY: 'sys-token',
      E2B_API_URL: 'http://agent-sandbox.local/e2b/v1',
      E2B_DOMAIN: 'agent-sandbox.local',
      E2B_REQUEST_TIMEOUT_MS: '7000',
      E2B_TEMPLATE_ID: 'code-interpreter',
      SANDBOX_TIMEOUT: '600',
    };

    expect(getE2BSandboxConfig()).toMatchObject({
      apiKey: 'sys-token',
      apiUrl: 'http://agent-sandbox.local/e2b/v1',
      domain: 'agent-sandbox.local',
      requestTimeoutMs: 7000,
      routerMode: 'wildcard',
      template: 'code-interpreter',
      timeoutMs: 600_000,
    });
  });

  it('normalizes Agent-Sandbox nodeport settings for no-wildcard routing', () => {
    process.env = {
      ...ORIGINAL_ENV,
      E2B_API_KEY: 'sys-token',
      E2B_API_URL: 'http://192.168.66.5:30010',
      SANDBOX_PROVIDER: 'agent-sandbox',
      SANDBOX_TIMEOUT: '300',
    };

    expect(getE2BSandboxConfig()).toMatchObject({
      apiKey: 'sys-token',
      apiUrl: 'http://192.168.66.5:30010/e2b/v1',
      domain: '192.168.66.5:30010',
      routerMode: 'path',
      template: 'code-interpreter',
      timeoutMs: 301_000,
    });
  });

  it('reuses path-router sessions without timeout renewal', async () => {
    const sandbox = {
      kill: vi.fn(),
      setTimeout: vi.fn(),
    };
    const createSandbox = vi.spyOn(Sandbox, 'create').mockResolvedValue(sandbox as any);
    const manager = new E2BSandboxSessionManager({
      requestTimeoutMs: 1000,
      routerMode: 'path',
      timeoutMs: 600_000,
    });

    await manager.getSandbox('topic-1', 'user-1');
    await manager.getSandbox('topic-1', 'user-1');

    expect(createSandbox).toHaveBeenCalledTimes(1);
    expect(sandbox.setTimeout).not.toHaveBeenCalled();
  });
});
