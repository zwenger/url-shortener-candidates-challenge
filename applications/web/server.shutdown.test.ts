import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
});
