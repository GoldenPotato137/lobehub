// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { E2BSandboxProvider } from './e2b-provider';

const createProvider = () => {
  const files = {
    list: vi.fn().mockResolvedValue([
      { name: 'src', path: '/workspace/src', size: 0, type: 'dir' },
      { name: 'README.md', path: '/workspace/README.md', size: 42, type: 'file' },
    ]),
    read: vi.fn().mockResolvedValue('one\ntwo\nthree'),
    remove: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue({ path: '/tmp/file.txt' }),
  };
  const commands = {
    run: vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: 'ok' }),
  };
  const sandbox = { commands, files, sandboxId: 'sandbox-1' };
  const sessionManager = {
    deleteCommandHandle: vi.fn(),
    getCommandHandle: vi.fn(),
    getSandbox: vi.fn().mockResolvedValue(sandbox),
    setCommandHandle: vi.fn(),
  };

  return {
    commands,
    files,
    provider: new E2BSandboxProvider({
      sessionManager: sessionManager as any,
      topicId: 'topic-1',
      userId: 'user-1',
    }),
    sandbox,
    sessionManager,
  };
};

describe('E2BSandboxProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps ComputerRuntime listLocalFiles calls to E2B file listing', async () => {
    const { files, provider } = createProvider();

    const result = await provider.callTool('listLocalFiles', { directoryPath: '/workspace' });

    expect(result.success).toBe(true);
    expect(files.list).toHaveBeenCalledWith('/workspace');
    expect(result.result.files).toEqual([
      { isDirectory: false, name: 'README.md', path: '/workspace/README.md', size: 42 },
      { isDirectory: true, name: 'src', path: '/workspace/src', size: 0 },
    ]);
  });

  it('reads a requested line range from a sandbox file', async () => {
    const { files, provider } = createProvider();

    const result = await provider.callTool('readLocalFile', {
      endLine: 2,
      path: '/workspace/README.md',
      startLine: 2,
    });

    expect(result.success).toBe(true);
    expect(files.read).toHaveBeenCalledWith('/workspace/README.md');
    expect(result.result.content).toBe('two');
    expect(result.result.totalLines).toBe(3);
  });

  it('runs foreground commands and returns normalized stdout and exit code', async () => {
    const { commands, provider } = createProvider();

    const result = await provider.callTool('runCommand', { command: 'pwd' });

    expect(result.success).toBe(true);
    expect(commands.run).toHaveBeenCalledWith('pwd', { timeoutMs: 120_000 });
    expect(result.result).toMatchObject({ exitCode: 0, output: 'ok', stderr: '', stdout: 'ok' });
  });

  it('tracks background command handles by sandbox id and pid', async () => {
    const { commands, provider, sessionManager } = createProvider();
    const handle = { pid: 123, stderr: '', stdout: '' };
    commands.run.mockResolvedValueOnce(handle);

    const result = await provider.callTool('runCommand', { background: true, command: 'sleep 10' });

    expect(result.success).toBe(true);
    expect(commands.run).toHaveBeenCalledWith('sleep 10', { background: true, timeoutMs: 120_000 });
    expect(sessionManager.setCommandHandle).toHaveBeenCalledWith(
      'topic-1',
      'sandbox-1:123',
      handle,
    );
    expect(result.result.commandId).toBe('sandbox-1:123');
  });
});
