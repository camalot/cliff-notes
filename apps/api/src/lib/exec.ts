import { spawn } from "node:child_process";

export interface ExecOptions {
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ExecError extends Error {
  constructor(
    message: string,
    public readonly cmd: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly stdout: string,
  ) {
    super(message);
    this.name = "ExecError";
  }
}

export class ExecTimeoutError extends ExecError {
  constructor(cmd: string, stderr: string, stdout: string, public readonly timeoutMs: number) {
    super(`Command '${cmd}' timed out after ${timeoutMs}ms`, cmd, null, stderr, stdout);
    this.name = "ExecTimeoutError";
  }
}

/**
 * Run a subprocess and resolve with its stdio. Rejects with ExecError on
 * non-zero exit, ExecTimeoutError on timeout. stdin is closed after writing
 * the provided string (or immediately if none).
 */
export function execProcess(cmd: string, options: ExecOptions = {}): Promise<ExecResult> {
  const args = options.args ?? [];
  const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutLen = 0;
    let stderrLen = 0;
    let truncated = false;

    const finish = (resolveOrReject: () => void) => {
      clearTimeout(timer);
      resolveOrReject();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ExecTimeoutError(cmd, stderr, stdout, timeoutMs));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen > maxBuffer) {
        truncated = true;
        child.kill("SIGKILL");
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrLen += chunk.length;
      if (stderrLen > maxBuffer) {
        truncated = true;
        child.kill("SIGKILL");
        return;
      }
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      finish(() =>
        reject(new ExecError(`Failed to spawn ${cmd}: ${err.message}`, cmd, null, stderr, stdout)),
      );
    });

    child.on("close", (code) => {
      if (truncated) {
        finish(() =>
          reject(
            new ExecError(
              `Command '${cmd}' produced more than ${maxBuffer} bytes of output`,
              cmd,
              code,
              stderr,
              stdout,
            ),
          ),
        );
        return;
      }
      if (code === 0) {
        finish(() => resolve({ stdout, stderr, exitCode: code }));
      } else {
        finish(() =>
          reject(
            new ExecError(
              `Command '${cmd}' exited with code ${code ?? "null"}: ${stderr.trim() || stdout.trim()}`,
              cmd,
              code,
              stderr,
              stdout,
            ),
          ),
        );
      }
    });

    if (options.stdin !== undefined) {
      child.stdin.end(options.stdin, "utf8");
    } else {
      child.stdin.end();
    }
  });
}
