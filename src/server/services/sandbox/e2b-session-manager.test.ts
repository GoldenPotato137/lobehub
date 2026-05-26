// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import { getE2BSandboxConfig, isE2BSandboxProviderEnabled } from './e2b-session-manager';

const ORIGINAL_ENV = process.env;

describe('e2b session manager config', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
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
      template: 'code-interpreter',
      timeoutMs: 600_000,
    });
  });
});
