import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "./server.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Spawns the real server.ts entry point (not createApp() directly) so this
// exercises the actual SIGTERM/SIGINT wiring registered in the
// `import.meta.url === ...` main-module guard — the part createApp()'s
// unit tests deliberately don't cover, since that guard only runs when
// server.ts is the process entry point.
function spawnServer(port: number) {
  return spawn(process.execPath, [path.join(__dirname, "server.ts")], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForListening(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("server did not start listening in time")),
      10_000,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening on")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForExit(
  child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

// Accumulates the child's stdout so a test can assert on log lines emitted
// during shutdown (e.g. the Prisma disconnect confirmation).
function captureStdout(child: ReturnType<typeof spawn>): { text: () => string } {
  let buffer = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
  });
  return { text: () => buffer };
}

describe("server.ts graceful shutdown", () => {
  it("exits cleanly (code 0) on SIGTERM instead of being killed by the default handler", async () => {
    const child = spawnServer(3199);
    await waitForListening(child);

    child.kill("SIGTERM");
    const { code, signal } = await waitForExit(child);

    // A clean `server.close(() => process.exit(0))` produces exit code 0
    // with no signal; if SIGTERM had no handler, Node's default action
    // would report the process as terminated BY the signal instead.
    expect(signal).toBeNull();
    expect(code).toBe(0);
  }, 15_000);

  it("exits cleanly (code 0) on SIGINT", async () => {
    const child = spawnServer(3198);
    await waitForListening(child);

    child.kill("SIGINT");
    const { code, signal } = await waitForExit(child);

    expect(signal).toBeNull();
    expect(code).toBe(0);
  }, 15_000);

  // In-process unit tests for the shutdown handler itself, injecting fakes so
  // the reject path is exercised WITHOUT waiting the real 10s force-exit timer
  // or booting a server. The subprocess tests above cover the real signal
  // wiring; these cover the branch logic.
  describe("createGracefulShutdown handler", () => {
    function fakeServer(): {
      close: (cb: () => void) => void;
    } {
      // Invokes the close callback synchronously, as if connections drained
      // immediately.
      return { close: (cb: () => void) => cb() };
    }

    it("exits 0 after a successful disconnect", async () => {
      const exit = vi.fn();
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const log = vi.fn();
      const errorLog = vi.fn();

      const shutdown = createGracefulShutdown({
        server: fakeServer(),
        disconnect,
        exit: exit as unknown as (code: number) => never,
        log,
        errorLog,
        forceExitAfterMs: 0, // skip arming the real force-exit timer in tests
      });

      await shutdown("SIGTERM");

      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("[web] prisma disconnected");
      expect(exit).toHaveBeenCalledWith(0);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it("still exits 0 and logs the error when disconnect rejects", async () => {
      const exit = vi.fn();
      const disconnectError = new Error("pool already closed");
      const disconnect = vi.fn().mockRejectedValue(disconnectError);
      const log = vi.fn();
      const errorLog = vi.fn();

      const shutdown = createGracefulShutdown({
        server: fakeServer(),
        disconnect,
        exit: exit as unknown as (code: number) => never,
        log,
        errorLog,
        forceExitAfterMs: 0, // skip arming the real force-exit timer in tests
      });

      await shutdown("SIGTERM");

      // A failing disconnect must not wedge shutdown: the error is logged and
      // the process still exits cleanly (0), rather than hanging until the
      // force-exit timer fires with code 1.
      expect(errorLog).toHaveBeenCalledWith(
        "[web] error disconnecting prisma",
        disconnectError,
      );
      expect(exit).toHaveBeenCalledWith(0);
    });
  });

  it("disconnects the Prisma client during shutdown before exiting", async () => {
    const child = spawnServer(3197);
    const stdout = captureStdout(child);
    await waitForListening(child);

    child.kill("SIGTERM");
    const { code } = await waitForExit(child);

    // The shutdown path must release DB connections rather than leaving them
    // dangling until the socket times out. server.ts logs this confirmation
    // once `disconnectPrismaClient()` resolves.
    expect(stdout.text()).toContain("prisma disconnected");
    expect(code).toBe(0);
  }, 15_000);
});
