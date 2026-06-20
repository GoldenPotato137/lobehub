import { sandboxEnv } from '@/envs/sandbox';

import { E2BSandboxProvider } from './providers/e2b';
import { MarketSandboxProvider } from './providers/market';
import { OnlyboxesSandboxProvider } from './providers/onlyboxes';
import { SandboxMiddlewareService } from './service';
import type {
  SandboxProvider,
  SandboxProviderKind,
  SandboxService,
  SandboxServiceOptions,
} from './types';

export const getSandboxProviderKind = (): SandboxProviderKind => {
  return sandboxEnv.SANDBOX_PROVIDER || 'market';
};

const createSandboxProvider = (options: SandboxServiceOptions): SandboxProvider => {
  switch (getSandboxProviderKind()) {
    case 'onlyboxes': {
      return new OnlyboxesSandboxProvider(options);
    }

    case 'agent-sandbox': {
      return new E2BSandboxProvider(options);
    }

    case 'market': {
      return new MarketSandboxProvider(options);
    }
  }
};

export const createSandboxService = (options: SandboxServiceOptions): SandboxService => {
  return new SandboxMiddlewareService(createSandboxProvider(options), options);
};
