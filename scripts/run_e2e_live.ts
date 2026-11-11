/**
 * E2E Live Test Suite Runner (Phase B9a-3)
 *
 * Runs end-to-end browser specs against a real isolated stack (Backend 8100, Frontend 3100).
 * Each spec group gets a fresh scratch database.
 * Supports running one spec or the full sequence.
 *
 * Usage:
 *   npx tsx scripts/run_e2e_live.ts
 *   npx tsx scripts/run_e2e_live.ts 01-auth
 *   npx tsx scripts/run_e2e_live.ts --spec 03-order-flow
 */

import { execSync, spawnSync } from "child_process";
import path from "path";
import fs from "fs";

const ROOT_DIR = path.resolve(__dirname, "..");
const SPECS_DIR = path.join(ROOT_DIR, "e2e-live", "specs");
const STACK_JSON = path.join(ROOT_DIR, "e2e-live", ".stack.json");

interface SpecConfig {
  id: string;
  file: string;
  name: string;
  portrait: boolean;
  demo?: boolean;
  failPrinters?: string;
}

const ALL_SPECS: SpecConfig[] = [
  { id: "01-auth", file: "01-auth.spec.ts", name: "01-auth", portrait: false },
  { id: "02-floors-menus", file: "02-floors-menus.spec.ts", name: "02-floors-menus [P]", portrait: true },
  { id: "03-order-flow", file: "03-order-flow.spec.ts", name: "03-order-flow [P]", portrait: true },
  { id: "04-realtime-two-tablets", file: "04-realtime-two-tablets.spec.ts", name: "04-realtime-two-tablets", portrait: false },
  { id: "05-resilience", file: "05-resilience.spec.ts", name: "05-resilience", portrait: false },
  { id: "06-printer-failure", file: "06-printer-failure.spec.ts", name: "06-printer-failure", portrait: false, failPrinters: "p2" },
  { id: "07-admin", file: "07-admin.spec.ts", name: "07-admin [P]", portrait: true },
  { id: "08-reports", file: "08-reports.spec.ts", name: "08-reports", portrait: false, demo: true },
  { id: "09-a11y-touch", file: "09-a11y-touch.spec.ts", name: "09-a11y-touch [P]", portrait: true },
  { id: "10-business-rules", file: "10-business-rules.spec.ts", name: "10-business-rules", portrait: false },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopStack() {
  try {
    execSync(
      `powershell -ExecutionPolicy Bypass -File scripts/stack_down.ps1 -PidsFile run/stack.pids -Ports @(8100, 3100)`,
      { cwd: ROOT_DIR, stdio: "ignore" }
    );
  } catch {}
}

function startStackForSpec(spec: SpecConfig) {
  stopStack();

  const extraArgs: string[] = [];
  if (spec.demo) {
    extraArgs.push("-Demo");
  }
  if (spec.failPrinters) {
    extraArgs.push("-FailPrinters", spec.failPrinters);
  }

  const cmd = `powershell -ExecutionPolicy Bypass -File scripts/stack_up.ps1 -BackendPort 8100 -FrontendPort 3100 -WriteStackJson e2e-live/.stack.json ${extraArgs.join(" ")}`;
  console.log(`[RUNNER] Starting stack: ${cmd}`);
  const out = execSync(cmd, { cwd: ROOT_DIR, encoding: "utf-8" });
  console.log(out.split("\n").filter((l) => l.includes("[OK]") || l.includes("READY")).join("\n"));
}

interface SpecResult {
  spec: string;
  landscape: "PASS" | "FAIL" | "SKIPPED";
  portrait: "PASS" | "FAIL" | "SKIPPED";
  durationSec: number;
  notes: string;
}

const summary: SpecResult[] = [];

async function runSpec(spec: SpecConfig): Promise<boolean> {
  console.log(`\n======================================================`);
  console.log(`Running Spec: ${spec.name}`);
  console.log(`======================================================`);

  let specPassed = true;
  let landscapeStatus: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  let portraitStatus: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  let notes = "";
  const t0 = performance.now();

  try {
    startStackForSpec(spec);

    // 1. Run landscape project
    console.log(`\n[TEST] ${spec.id} -> project: tablet-landscape`);
    const landscapeRun = spawnSync(
      "cmd.exe",
      [
        "/c",
        "npx",
        "playwright",
        "test",
        `e2e-live/specs/${spec.file}`,
        "--config=playwright.live.config.ts",
        "--project=tablet-landscape",
        "--reporter=list",
        "--workers=1",
      ],
      {
        cwd: ROOT_DIR,
        stdio: "inherit",
        env: {
          ...process.env,
          PLAYWRIGHT_HTML_OPEN: "never",
          PLAYWRIGHT_TEST_BASE_URL: "http://localhost:3100",
        },
      }
    );

    if (landscapeRun.status === 0) {
      landscapeStatus = "PASS";
    } else {
      landscapeStatus = "FAIL";
      specPassed = false;
      notes += "Landscape failed. ";
    }

    // 2. Run portrait project if spec has [P]
    if (spec.portrait) {
      console.log(`\n[TEST] ${spec.id} -> project: tablet-portrait`);
      const portraitRun = spawnSync(
        "cmd.exe",
        [
          "/c",
          "npx",
          "playwright",
          "test",
          `e2e-live/specs/${spec.file}`,
          "--config=playwright.live.config.ts",
          "--project=tablet-portrait",
          "--reporter=list",
          "--workers=1",
        ],
        {
          cwd: ROOT_DIR,
          stdio: "inherit",
          env: {
            ...process.env,
            PLAYWRIGHT_HTML_OPEN: "never",
            PLAYWRIGHT_TEST_BASE_URL: "http://localhost:3100",
          },
        }
      );

      if (portraitRun.status === 0) {
        portraitStatus = "PASS";
      } else {
        portraitStatus = "FAIL";
        specPassed = false;
        notes += "Portrait failed. ";
      }
    } else {
      portraitStatus = "SKIPPED";
    }
  } catch (err: any) {
    specPassed = false;
    landscapeStatus = "FAIL";
    notes += `Error: ${err.message}`;
  } finally {
    stopStack();
  }

  const durationSec = Math.round((performance.now() - t0) / 1000);
  summary.push({
    spec: spec.id,
    landscape: landscapeStatus,
    portrait: portraitStatus,
    durationSec,
    notes: notes.trim() || "All assertions passed",
  });

  return specPassed;
}

async function main() {
  const args = process.argv.slice(2);
  let targetSpecId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--spec" && args[i + 1]) {
      targetSpecId = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      targetSpecId = args[i];
    }
  }

  const specsToRun = targetSpecId
    ? ALL_SPECS.filter((s) => s.id === targetSpecId || s.file.includes(targetSpecId!))
    : ALL_SPECS;

  if (specsToRun.length === 0) {
    console.error(`Unknown spec: ${targetSpecId}. Available: ${ALL_SPECS.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`Starting E2E Live Suite (${specsToRun.length} spec(s))`);
  console.log(`======================================================\n`);

  let anyFailed = false;
  for (const spec of specsToRun) {
    const passed = await runSpec(spec);
    if (!passed) anyFailed = true;
  }

  // Print Summary Table
  console.log(`\n========================================================================`);
  console.log(`                       E2E LIVE TEST RESULTS                            `);
  console.log(`========================================================================`);
  console.log(`Spec                   | Landscape | Portrait  | Duration | Notes`);
  console.log(`-----------------------+-----------+-----------+----------+--------------------------------`);
  for (const row of summary) {
    const padSpec = row.spec.padEnd(22, " ");
    const padL = row.landscape.padEnd(9, " ");
    const padP = row.portrait.padEnd(9, " ");
    const padDur = `${row.durationSec}s`.padStart(8, " ");
    console.log(`${padSpec} | ${padL} | ${padP} | ${padDur} | ${row.notes}`);
  }
  console.log(`========================================================================\n`);

  // Final check for leftover processes
  try {
    const leftovers = execSync("netstat -ano -p tcp | findstr /R \":8100 .*LISTENING :3100 .*LISTENING\"", { encoding: "utf-8" });
    if (leftovers.trim()) {
      console.warn("[WARN] Leftover listening ports detected on 8100/3100. Cleaning up...");
      stopStack();
    }
  } catch {}

  if (anyFailed) {
    console.error("❌ Some E2E live tests failed.");
    process.exit(1);
  } else {
    console.log(" All E2E live tests passed successfully!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error in E2E runner:", err);
  stopStack();
  process.exit(1);
});

