import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname } from 'node:path/posix';

import { type SandboxCallToolResult } from '@lobechat/builtin-tool-cloud-sandbox';
import debug from 'debug';
import { type CommandHandle, type CommandResult, type EntryInfo, type Sandbox } from 'e2b';

import { E2BSandboxSessionManager } from './e2b-session-manager';

const log = debug('lobe-server:sandbox-service:e2b');

const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

const toolNameAliases: Record<string, string> = {
  editLocalFile: 'editFile',
  globLocalFiles: 'globFiles',
  listLocalFiles: 'listFiles',
  moveLocalFiles: 'moveFiles',
  readLocalFile: 'readFile',
  searchLocalFiles: 'searchFiles',
  writeLocalFile: 'writeFile',
};

export interface E2BSandboxProviderOptions {
  sessionManager?: E2BSandboxSessionManager;
  topicId: string;
  userId: string;
}

export class E2BSandboxProvider {
  private readonly sessionManager: E2BSandboxSessionManager;
  private readonly topicId: string;
  private readonly userId: string;

  constructor(options: E2BSandboxProviderOptions) {
    this.sessionManager = options.sessionManager || new E2BSandboxSessionManager();
    this.topicId = options.topicId;
    this.userId = options.userId;
  }

  async callTool(toolName: string, params: Record<string, any>): Promise<SandboxCallToolResult> {
    const normalizedToolName = toolNameAliases[toolName] || toolName;
    log('Calling E2B sandbox tool: %s normalized as %s', toolName, normalizedToolName);

    try {
      const sandbox = await this.getSandbox();

      switch (normalizedToolName) {
        case 'editFile': {
          return this.success(await this.editFile(sandbox, params));
        }
        case 'executeCode': {
          return this.success(await this.executeCode(sandbox, params));
        }
        case 'getCommandOutput': {
          return this.success(this.getCommandOutput(params));
        }
        case 'globFiles': {
          return this.success(await this.globFiles(sandbox, params));
        }
        case 'grepContent': {
          return this.success(await this.grepContent(sandbox, params));
        }
        case 'killCommand': {
          return this.success(await this.killCommand(params));
        }
        case 'listFiles': {
          return this.success(await this.listFiles(sandbox, params));
        }
        case 'moveFiles': {
          return this.success(await this.moveFiles(sandbox, params));
        }
        case 'readFile': {
          return this.success(await this.readFile(sandbox, params));
        }
        case 'runCommand': {
          return this.success(await this.runCommand(sandbox, params));
        }
        case 'searchFiles': {
          return this.success(await this.searchFiles(sandbox, params));
        }
        case 'writeFile': {
          return this.success(await this.writeFile(sandbox, params));
        }
        case 'exportFile': {
          return this.success(await this.exportFile(sandbox, params));
        }
        default: {
          return this.failure(`Unsupported E2B sandbox tool: ${toolName}`);
        }
      }
    } catch (error) {
      log('E2B sandbox tool %s failed: %O', toolName, error);
      return this.failure(error);
    }
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    const sandbox = await this.getSandbox();
    return sandbox.files.read(path, { format: 'bytes' });
  }

  async writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
    const sandbox = await this.getSandbox();
    const parentDir = dirname(path);
    if (parentDir && parentDir !== '.' && parentDir !== '/') {
      await sandbox.files.makeDir(parentDir).catch(() => undefined);
    }
    // e2b SDK write() accepts ArrayBuffer; use Uint8Array.prototype.slice() which
    // always returns a new Uint8Array backed by a fresh ArrayBuffer (not SharedArrayBuffer).
    const buf = bytes.slice().buffer as ArrayBuffer;
    await sandbox.files.write(path, buf);
  }

  private async getSandbox() {
    return this.sessionManager.getSandbox(this.topicId, this.userId);
  }

  private async executeCode(sandbox: Sandbox, params: Record<string, any>) {
    const language = params.language || 'python';
    const extension = language === 'python' ? 'py' : language === 'typescript' ? 'ts' : 'js';
    const filePath = `/tmp/lobechat-code-${randomUUID()}.${extension}`;

    await sandbox.files.write(filePath, String(params.code || ''));

    const command =
      language === 'python'
        ? `python3 ${shellQuote(filePath)}`
        : language === 'typescript'
          ? `bun ${shellQuote(filePath)}`
          : `node ${shellQuote(filePath)}`;

    const result = await this.runCommandAndCapture(sandbox, command, {
      timeoutMs: params.timeout || DEFAULT_COMMAND_TIMEOUT_MS,
    });

    await sandbox.files.remove(filePath).catch(() => undefined);

    return {
      error: result.error,
      exitCode: result.exitCode,
      output: result.stdout,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }

  private async listFiles(sandbox: Sandbox, params: Record<string, any>) {
    const directoryPath = params.directoryPath || params.path || '.';
    const entries = await sandbox.files.list(directoryPath);
    const files = entries.map(formatEntryInfo);

    if (params.sortBy === 'size') {
      files.sort((a, b) => (a.size || 0) - (b.size || 0));
    } else {
      files.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (params.sortOrder === 'desc') files.reverse();

    return {
      files,
      totalCount: files.length,
    };
  }

  private async readFile(sandbox: Sandbox, params: Record<string, any>) {
    const path = params.path;
    const fullContent = await sandbox.files.read(path);
    const lines = fullContent.split('\n');
    const startLine = params.startLine ? Math.max(1, Number(params.startLine)) : undefined;
    const endLine = params.endLine ? Math.max(1, Number(params.endLine)) : undefined;
    const startIndex = startLine ? startLine - 1 : 0;
    const endIndex = endLine || lines.length;
    const content =
      startLine || endLine ? lines.slice(startIndex, endIndex).join('\n') : fullContent;

    return {
      charCount: content.length,
      content,
      fileType: extname(path).replace(/^\./, ''),
      filename: basename(path),
      loc: startLine || endLine ? [startLine || 1, endLine || lines.length] : undefined,
      totalCharCount: fullContent.length,
      totalLineCount: lines.length,
      totalLines: lines.length,
    };
  }

  private async writeFile(sandbox: Sandbox, params: Record<string, any>) {
    const path = params.path;
    const content = String(params.content || '');

    if (params.createDirectories) {
      const parentDir = dirname(path);
      if (parentDir && parentDir !== '.') {
        await sandbox.files.makeDir(parentDir).catch(() => undefined);
      }
    }

    await sandbox.files.write(path, content);

    return {
      bytesWritten: Buffer.byteLength(content),
      path,
      success: true,
    };
  }

  private async editFile(sandbox: Sandbox, params: Record<string, any>) {
    const path = params.path;
    const search = String(params.search ?? '');
    const replace = String(params.replace ?? '');

    if (!search) throw new Error('editFile requires a non-empty search string');

    const originalContent = await sandbox.files.read(path);
    const replacementCount = params.all
      ? originalContent.split(search).length - 1
      : originalContent.includes(search)
        ? 1
        : 0;

    if (replacementCount === 0) {
      return {
        path,
        replacements: 0,
      };
    }

    const nextContent = params.all
      ? originalContent.split(search).join(replace)
      : originalContent.replace(search, replace);

    await sandbox.files.write(path, nextContent);

    const originalLineCount = originalContent.split('\n').length;
    const nextLineCount = nextContent.split('\n').length;

    return {
      linesAdded: Math.max(0, nextLineCount - originalLineCount),
      linesDeleted: Math.max(0, originalLineCount - nextLineCount),
      path,
      replacements: replacementCount,
    };
  }

  private async moveFiles(sandbox: Sandbox, params: Record<string, any>) {
    const operations = Array.isArray(params.operations) ? params.operations : [];
    const results = [];

    for (const operation of operations) {
      try {
        await sandbox.files.rename(operation.source, operation.destination);
        results.push({
          destination: operation.destination,
          source: operation.source,
          success: true,
        });
      } catch (error) {
        results.push({
          destination: operation.destination,
          error: (error as Error).message,
          source: operation.source,
          success: false,
        });
      }
    }

    return {
      results,
      successCount: results.filter((result) => result.success).length,
      totalCount: operations.length,
    };
  }

  private async runCommand(sandbox: Sandbox, params: Record<string, any>) {
    const timeoutMs = params.timeout || DEFAULT_COMMAND_TIMEOUT_MS;

    if (params.background) {
      const handle = (await sandbox.commands.run(params.command, {
        background: true,
        timeoutMs,
      })) as CommandHandle;
      const commandId = `${sandbox.sandboxId}:${handle.pid}`;
      this.sessionManager.setCommandHandle(this.topicId, commandId, handle);

      return {
        commandId,
        output: handle.stdout,
        running: true,
        shell_id: commandId,
        stderr: handle.stderr,
        stdout: handle.stdout,
      };
    }

    const result = await this.runCommandAndCapture(sandbox, params.command, { timeoutMs });

    return {
      error: result.error,
      exitCode: result.exitCode,
      output: result.stdout,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }

  private getCommandOutput(params: Record<string, any>) {
    const commandId = params.commandId;
    const handle = this.sessionManager.getCommandHandle(this.topicId, commandId);

    if (!handle) throw new Error(`Command not found: ${commandId}`);

    const output = [handle.stdout, handle.stderr].filter(Boolean).join('\n');

    return {
      error: handle.error,
      newOutput: output,
      output,
      running: handle.exitCode === undefined,
      stderr: handle.stderr,
      stdout: handle.stdout,
    };
  }

  private async killCommand(params: Record<string, any>) {
    const commandId = params.commandId;
    const handle = this.sessionManager.getCommandHandle(this.topicId, commandId);

    if (!handle) throw new Error(`Command not found: ${commandId}`);

    const killed = await handle.kill();
    this.sessionManager.deleteCommandHandle(this.topicId, commandId);

    return {
      commandId,
      success: killed,
    };
  }

  private async searchFiles(sandbox: Sandbox, params: Record<string, any>) {
    return this.runPythonJson(sandbox, buildSearchFilesScript(params));
  }

  private async grepContent(sandbox: Sandbox, params: Record<string, any>) {
    return this.runPythonJson(sandbox, buildGrepContentScript(params));
  }

  private async globFiles(sandbox: Sandbox, params: Record<string, any>) {
    return this.runPythonJson(sandbox, buildGlobFilesScript(params));
  }

  private async exportFile(sandbox: Sandbox, params: Record<string, any>) {
    const bytes = await sandbox.files.read(params.path, { format: 'bytes' });
    return {
      content: Buffer.from(bytes).toString('base64'),
      encoding: 'base64',
      path: params.path,
      size: bytes.byteLength,
      success: true,
    };
  }

  private async runPythonJson(sandbox: Sandbox, script: string) {
    const scriptPath = `/tmp/lobechat-script-${randomUUID()}.py`;
    await sandbox.files.write(scriptPath, script);

    const result = await this.runCommandAndCapture(sandbox, `python3 ${shellQuote(scriptPath)}`, {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    });

    await sandbox.files.remove(scriptPath).catch(() => undefined);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.error || 'Sandbox Python helper failed');
    }

    return JSON.parse(result.stdout || '{}');
  }

  private async runCommandAndCapture(
    sandbox: Sandbox,
    command: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<CommandResult> {
    try {
      return (await sandbox.commands.run(command, {
        timeoutMs: opts.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS,
      })) as CommandResult;
    } catch (error) {
      const commandError = error as Partial<CommandResult> & Error;

      if (typeof commandError.exitCode === 'number') {
        return {
          error: commandError.error || commandError.message,
          exitCode: commandError.exitCode,
          stderr: commandError.stderr || '',
          stdout: commandError.stdout || '',
        };
      }

      throw error;
    }
  }

  private success(result: any): SandboxCallToolResult {
    return {
      result,
      sessionExpiredAndRecreated: false,
      success: true,
    };
  }

  private failure(error: unknown): SandboxCallToolResult {
    const resolvedError = error instanceof Error ? error : new Error(String(error));

    return {
      error: {
        message: resolvedError.message,
        name: resolvedError.name,
      },
      result: null,
      sessionExpiredAndRecreated: false,
      success: false,
    };
  }
}

const formatEntryInfo = (entry: EntryInfo) => ({
  isDirectory: String(entry.type) === 'dir',
  name: entry.name,
  path: entry.path,
  size: entry.size,
});

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const jsonForPython = (value: unknown) => JSON.stringify(JSON.stringify(value));

const buildSearchFilesScript = (params: Record<string, any>) => `
import json
import os

args = json.loads(${jsonForPython(params)})
directory = args.get('directory') or '.'
keywords = args.get('keywords') or args.get('keyword') or ''
keywords = [item.strip().lower() for item in str(keywords).split(',') if item.strip()]
file_types = args.get('fileTypes') or args.get('fileType') or []
if isinstance(file_types, str):
    file_types = [item.strip() for item in file_types.split(',') if item.strip()]
file_types = [item if item.startswith('.') else '.' + item for item in file_types]
limit = int(args.get('limit') or 200)
results = []

for root, _, files in os.walk(directory):
    for name in files:
        path = os.path.join(root, name)
        lower_path = path.lower()
        if keywords and not any(keyword in lower_path for keyword in keywords):
            continue
        if file_types and not any(name.lower().endswith(file_type.lower()) for file_type in file_types):
            continue
        try:
            stat = os.stat(path)
            results.append({
                'isDirectory': False,
                'modifiedAt': str(int(stat.st_mtime)),
                'name': name,
                'path': path,
                'size': stat.st_size,
            })
        except OSError:
            results.append({'isDirectory': False, 'name': name, 'path': path})

print(json.dumps({'results': results[:limit], 'totalCount': len(results)}))
`;

const buildGlobFilesScript = (params: Record<string, any>) => `
import glob
import json
import os

args = json.loads(${jsonForPython(params)})
pattern = args.get('pattern') or '*'
directory = args.get('directory') or ''
resolved_pattern = pattern if os.path.isabs(pattern) or not directory else os.path.join(directory, pattern)
files = glob.glob(resolved_pattern, recursive=True)
print(json.dumps({'files': files, 'totalCount': len(files)}))
`;

const buildGrepContentScript = (params: Record<string, any>) => `
import fnmatch
import json
import os
import re

args = json.loads(${jsonForPython(params)})
directory = args.get('directory') or '.'
file_pattern = args.get('filePattern') or '*'
recursive = args.get('recursive') is not False
try:
    pattern = re.compile(args.get('pattern') or '')
except re.error:
    pattern = re.compile(re.escape(args.get('pattern') or ''))

matches = []
iterator = os.walk(directory) if recursive else [(directory, [], os.listdir(directory))]
for root, _, files in iterator:
    for name in files:
        if not fnmatch.fnmatch(name, file_pattern):
            continue
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as file:
                for line_number, line in enumerate(file, 1):
                    if pattern.search(line):
                        matches.append({
                            'content': line.rstrip('\\n'),
                            'lineNumber': line_number,
                            'path': path,
                        })
        except OSError:
            pass

print(json.dumps({'matches': matches, 'totalMatches': len(matches)}))
`;
