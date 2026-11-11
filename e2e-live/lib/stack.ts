import { execSync, spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

export interface StackConfig {
  backendPort: number;
  frontendPort: number;
  backendPid: number;
  frontendPid: number;
  scratchFolder: string;
  scratchDb: string;
  printSimFolder: string;
}

const ROOT_DIR = path.resolve(__dirname, "../..");
const STACK_JSON_PATH = path.join(ROOT_DIR, "e2e-live", ".stack.json");
const PRINT_SIM_DIR = path.join(ROOT_DIR, "data", "print_sim");

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getStackConfig(): StackConfig {
  if (!fs.existsSync(STACK_JSON_PATH)) {
    throw new Error(`e2e-live/.stack.json does not exist. Is the live stack running?`);
  }
  const raw = fs.readFileSync(STACK_JSON_PATH, "utf-8");
  return JSON.parse(raw);
}

export function killProcessTree(pid: number) {
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch {
    // Process already exited
  }
}

export async function isPortListening(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function restartBackend(options: { failPrinters?: string } = {}): Promise<void> {
  const config = getStackConfig();
  console.log(`[STACK] Restarting backend on port ${config.backendPort} (killing PID ${config.backendPid})...`);
  killProcessTree(config.backendPid);
  await sleep(1000);

  const env = {
    ...process.env,
    PYTHONPATH: path.join(ROOT_DIR, "backend"),
    DATABASE_URL: `sqlite:///${config.scratchDb.replace(/\\/g, "/")}`,
    AUTO_MIGRATE: "false",
    PRINT_MODE: "simulate",
    PRINT_SIM_DIR: config.printSimFolder,
    USERS_CONFIG_PATH: path.join(ROOT_DIR, "backend", "config", "users.yaml"),
    SIMULATE_FAIL_PRINTERS: options.failPrinters ?? "",
  };

  const proc = spawn(
    "python",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(config.backendPort)],
    {
      cwd: path.join(ROOT_DIR, "backend"),
      env,
      stdio: "ignore",
      detached: false,
    }
  );

  // Poll until healthy
  const start = Date.now();
  let healthy = false;
  while (Date.now() - start < 15000) {
    if (await isPortListening(config.backendPort)) {
      healthy = true;
      break;
    }
    await sleep(300);
  }

  if (!healthy) {
    throw new Error(`Backend failed to become healthy on port ${config.backendPort} after restart`);
  }

  // Update .stack.json with new PID
  config.backendPid = proc.pid!;
  fs.writeFileSync(STACK_JSON_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(`[STACK] Backend restarted successfully (new PID ${proc.pid})`);
}

export function clearPrintSim(): void {
  if (fs.existsSync(PRINT_SIM_DIR)) {
    const files = fs.readdirSync(PRINT_SIM_DIR);
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(PRINT_SIM_DIR, f));
      } catch {}
    }
  }
}

