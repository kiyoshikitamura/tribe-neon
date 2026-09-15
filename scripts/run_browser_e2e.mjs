import { spawn } from "node:child_process";

const port = process.env.PLAYWRIGHT_PORT || "3100";
const baseUrl = `http://127.0.0.1:${port}`;
const isWindows = process.platform === "win32";
const spawned = new Set();
let shuttingDown = false;

const spawnOwned = (command, args, env = process.env) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    env,
    // Unixでは子ごとにprocess groupを作り、timeout時も孫まで終了する。
    detached: !isWindows,
  });
  spawned.add(child);
  child.once("exit", () => spawned.delete(child));
  return child;
};

const stopProcessTree = async (child) => {
  if (!child?.pid || child.exitCode != null) return;
  if (isWindows) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  const signalGroup = (signal) => {
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  };
  signalGroup("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode == null) signalGroup("SIGKILL");
};

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, KPI_BASIC_AUTH_USER: "m3", KPI_BASIC_AUTH_PASSWORD: "local-only" },
  detached: !isWindows,
});
spawned.add(server);
server.once("exit", () => spawned.delete(server));
const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode != null) throw new Error(`Next server exited with ${server.exitCode}`);
    try { const response = await fetch(baseUrl); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the browser E2E server");
};
const stopServer = async () => {
  await stopProcessTree(server);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await fetch(baseUrl);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      return;
    }
  }
  throw new Error(`Browser E2E server still owns ${baseUrl} after shutdown`);
};

const shutdownFromSignal = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.allSettled([...spawned].map(stopProcessTree));
  process.exitCode = signal === "SIGINT" ? 130 : 143;
};
process.once("SIGINT", () => void shutdownFromSignal("SIGINT"));
process.once("SIGTERM", () => void shutdownFromSignal("SIGTERM"));

let status = 1;
try {
  await waitForServer();
  status = await new Promise((resolve, reject) => {
    const runner = spawnOwned(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
      { ...process.env, PLAYWRIGHT_REUSE_SERVER: "true" },
    );
    runner.once("error", reject);
    runner.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await Promise.allSettled([...spawned].filter((child) => child !== server).map(stopProcessTree));
  await stopServer();
}
if (!shuttingDown) process.exitCode = status;
