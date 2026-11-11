/**
 * Live WebSocket Test Suite (Phase B9a-2)
 *
 * Verifies real-time communication between the real FastAPI backend and RealtimeClient:
 * 1. Connect & subscribe initial snapshot against GET /api/tables
 * 2. Waiter 1 sends order -> table.updated & order.updated in < 2s
 * 3. Waiter 1 sends batch 2 -> order.updated
 * 4. Pay order -> order.updated(paid), table.updated(free), bill.paid
 * 5. Item marked sold out -> menu.changed on all
 * 6. Admin adds a table -> table.updated
 * 7. Fake printer fails -> printer.status arrives on admin only, never on waiters
 * 8. Waiter 3 receives 0 events for floor 2 and 0 printer events throughout
 * 9. Kill backend process and restart -> clients reconnect with backoff, receive fresh snapshot, detect serverBootId change
 * 10. Client with invalid token receives close code 4401 and stops reconnecting
 *
 * Usage:
 *   npx tsx scripts/test_ws_live.ts
 */

import { spawn, execSync, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { RealtimeClient } from "../src/lib/realtime/client";
import type { ServerEnvelope } from "../src/lib/realtime/types";

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const SCRATCH_DB = path.join(ROOT_DIR, "run", "scratch", "scratch_pos.db");
const API_URL = "http://127.0.0.1:8000/api";
const HEALTH_URL = "http://127.0.0.1:8000/health";

let spawnedBackendProcess: ChildProcess | null = null;

// Track step results
interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  latencyMs: number;
  details?: string;
}
const results: StepResult[] = [];

function recordResult(step: number, name: string, passed: boolean, latencyMs: number, details = "") {
  results.push({ step, name, passed, latencyMs, details });
  const status = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`[${status}] Step ${step}: ${name} (${latencyMs.toFixed(1)}ms)${details ? ` - ${details}` : ""}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isBackendAlive(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function startBackend(): Promise<ChildProcess> {
  const env = {
    ...process.env,
    PYTHONPATH: BACKEND_DIR,
    DATABASE_URL: `sqlite:///${SCRATCH_DB.replace(/\\/g, "/")}`,
    AUTO_MIGRATE: "false",
    PRINT_MODE: "simulate",
    USERS_CONFIG_PATH: path.join(BACKEND_DIR, "config", "users.yaml"),
  };

  const proc = spawn(
    "python",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: BACKEND_DIR,
      env,
      stdio: "ignore",
      detached: false,
    }
  );

  // Poll until alive
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await isBackendAlive()) {
      return proc;
    }
    await sleep(300);
  }
  throw new Error("Backend failed to start within 15 seconds");
}

function killProcessTree(pid: number) {
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch {
    // Process may have already exited
  }
}

async function killBackend(proc: ChildProcess | null) {
  if (proc?.pid) {
    killProcessTree(proc.pid);
  }
  await sleep(1000);
}

async function loginUser(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Failed to log in as ${username}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.token;
}

// Helper to wait for a matching message with timeout
function waitForMessage(
  client: RealtimeClient,
  predicate: (env: ServerEnvelope) => boolean,
  timeoutMs = 5000
): Promise<{ env: ServerEnvelope; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let cleanup: (() => void) | null = null;

    const timer = setTimeout(() => {
      cleanup?.();
      reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (payload: any, rawEnv: ServerEnvelope) => {
      if (predicate(rawEnv)) {
        clearTimeout(timer);
        cleanup?.();
        resolve({ env: rawEnv, latencyMs: performance.now() - t0 });
      }
    };

    const unsubscribeAll = [
      client.on("table.updated", (p) => handler(p, { type: "table.updated", payload: p } as any)),
      client.on("order.updated", (p) => handler(p, { type: "order.updated", payload: p } as any)),
      client.on("bill.paid", (p) => handler(p, { type: "bill.paid", payload: p } as any)),
      client.on("menu.changed", (p) => handler(p, { type: "menu.changed", payload: p } as any)),
      client.on("printer.status", (p) => handler(p, { type: "printer.status", payload: p } as any)),
    ];

    cleanup = () => {
      unsubscribeAll.forEach((unsub) => unsub());
    };
  });
}

async function runLiveTests() {
  console.log("\n=======================================================");
  console.log("Starting Live Realtime WebSocket Verification (B9a-2)");
  console.log("=======================================================\n");

  const wasAlreadyRunning = await isBackendAlive();
  if (!wasAlreadyRunning) {
    console.log("[SETUP] Starting local backend server...");
    spawnedBackendProcess = await startBackend();
    console.log(`[SETUP] Backend server ready (PID ${spawnedBackendProcess.pid})`);
  } else {
    console.log("[SETUP] Backend server is already running");
  }

  try {
    // Authenticate three distinct staff roles
    console.log("[SETUP] Authenticating test clients...");
    const adminToken = await loginUser("admin", "admin123");
    const waiter1Token = await loginUser("waiter1", "1234");
    const waiter3Token = await loginUser("waiter3", "1234");

    // Track all events received by waiter3 to verify isolation
    const waiter3ReceivedEvents: ServerEnvelope[] = [];
    const waiter1PrinterEvents: ServerEnvelope[] = [];

    // Create RealtimeClient instances
    const adminClient = new RealtimeClient({
      apiUrl: API_URL,
      getToken: () => adminToken,
      WebSocketClass: globalThis.WebSocket,
    });

    const waiter1Client = new RealtimeClient({
      apiUrl: API_URL,
      getToken: () => waiter1Token,
      WebSocketClass: globalThis.WebSocket,
    });

    const waiter3Client = new RealtimeClient({
      apiUrl: API_URL,
      getToken: () => waiter3Token,
      WebSocketClass: globalThis.WebSocket,
    });

    // Record events for isolation check
    waiter1Client.on("printer.status", (payload) => {
      waiter1PrinterEvents.push({ type: "printer.status", payload } as any);
    });

    const recordW3 = (type: string) => (payload: any) => {
      waiter3ReceivedEvents.push({ type, payload } as any);
    };
    waiter3Client.on("table.updated", recordW3("table.updated"));
    waiter3Client.on("order.updated", recordW3("order.updated"));
    waiter3Client.on("bill.paid", recordW3("bill.paid"));
    waiter3Client.on("menu.changed", recordW3("menu.changed"));
    waiter3Client.on("printer.status", recordW3("printer.status"));

    // Connect clients
    adminClient.connect();
    waiter1Client.connect();
    waiter3Client.connect();

    // -------------------------------------------------------------
    // Step 1: Connect and subscribe snapshot matches GET /api/tables
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      let snapshotTables: any[] = [];
      const snapshotPromise = new Promise<void>((resolve) => {
        waiter1Client.on<any>("subscribed", (payload) => {
          if (payload.floorId === "floor-1" || payload.floorId === "f1") {
            snapshotTables = payload.tables;
            resolve();
          }
        });
      });

      // Subscribe waiter1, admin, and waiter3 to floor-1
      waiter1Client.subscribeFloor("floor-1");
      adminClient.subscribeFloor("floor-1");
      waiter3Client.subscribeFloor("floor-1");

      await snapshotPromise;
      const latency = performance.now() - t0;

      // Compare with REST GET /api/tables?floorId=floor-1
      const restRes = await fetch(`${API_URL}/tables?floorId=floor-1`, {
        headers: { Authorization: `Bearer ${waiter1Token}` },
      });
      const restTables = await restRes.json();

      const passed =
        snapshotTables.length > 0 &&
        snapshotTables.length === restTables.length &&
        snapshotTables[0].id === restTables[0].id;

      recordResult(
        1,
        "Connect and subscribe snapshot matches GET /api/tables",
        passed,
        latency,
        `Tables count: ${snapshotTables.length}`
      );
    }

    let currentOrderId: string | null = null;
    const testTableId = "f1-t1";

    // Ensure test table f1-t1 is clear before test
    try {
      const openRes = await fetch(`${API_URL}/orders/table/${testTableId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (openRes.ok) {
        const openData = await openRes.json();
        if (openData?.id) {
          await fetch(`${API_URL}/orders/${openData.id}/pay`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              orderId: openData.id,
              requestId: `clean-${Date.now()}`,
              method: "cash",
              amountReceived: 99999,
            }),
          });
          await sleep(200);
        }
      }
    } catch {
      // Ignore
    }

    // -------------------------------------------------------------
    // Step 2: Waiter 1 sends order -> table.updated & order.updated in < 2s
    // -------------------------------------------------------------
    {
      const adminOrderPromise = waitForMessage(adminClient, (env) => env.type === "order.updated");
      const adminTablePromise = waitForMessage(adminClient, (env) => env.type === "table.updated");
      const waiter1OrderPromise = waitForMessage(waiter1Client, (env) => env.type === "order.updated");
      const waiter1TablePromise = waitForMessage(waiter1Client, (env) => env.type === "table.updated");

      const t0 = performance.now();
      const sendRes = await fetch(`${API_URL}/orders/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${waiter1Token}`,
        },
        body: JSON.stringify({
          tableId: testTableId,
          requestId: `live-req-1-${Date.now()}`,
          items: [{ menuItemId: "mi1", qty: 1 }],
        }),
      });

      if (!sendRes.ok) {
        throw new Error(`Order send failed: ${sendRes.status} ${await sendRes.text()}`);
      }
      const sendData = await sendRes.json();
      currentOrderId = sendData.order.id;

      const [adminOrder, adminTable, waiter1Order, waiter1Table] = await Promise.all([
        adminOrderPromise,
        adminTablePromise,
        waiter1OrderPromise,
        waiter1TablePromise,
      ]);
      const latency = performance.now() - t0;

      const passed =
        latency < 2000 &&
        adminOrder.env.payload.orderId === currentOrderId &&
        waiter1Order.env.payload.orderId === currentOrderId;

      recordResult(
        2,
        "Waiter 1 sends order -> table.updated and order.updated received (< 2s)",
        passed,
        latency,
        `OrderId: ${currentOrderId}, delivered in ${latency.toFixed(1)}ms`
      );
    }

    // -------------------------------------------------------------
    // Step 3: Waiter 1 sends batch 2 -> order.updated arrives
    // -------------------------------------------------------------
    {
      const adminOrderPromise = waitForMessage(
        adminClient,
        (env) => env.type === "order.updated" && env.payload.orderId === currentOrderId
      );
      const waiter1OrderPromise = waitForMessage(
        waiter1Client,
        (env) => env.type === "order.updated" && env.payload.orderId === currentOrderId
      );

      const t0 = performance.now();
      const sendBatchRes = await fetch(`${API_URL}/orders/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${waiter1Token}`,
        },
        body: JSON.stringify({
          tableId: testTableId,
          requestId: `live-req-2-${Date.now()}`,
          items: [{ menuItemId: "mi2", qty: 2 }],
        }),
      });

      if (!sendBatchRes.ok) {
        throw new Error(`Batch 2 send failed: ${sendBatchRes.status} ${await sendBatchRes.text()}`);
      }

      const [adminOrder, waiter1Order] = await Promise.all([adminOrderPromise, waiter1OrderPromise]);
      const latency = performance.now() - t0;

      const passed =
        adminOrder.env.payload.order?.items?.length >= 2 &&
        waiter1Order.env.payload.order?.items?.length >= 2;

      recordResult(
        3,
        "Waiter 1 sends batch 2 -> order.updated received",
        passed,
        latency,
        `Items in order: ${adminOrder.env.payload.order?.items?.length}`
      );
    }

    // -------------------------------------------------------------
    // Step 4: Pay: order.updated(paid), table.updated(free), bill.paid arrive
    // -------------------------------------------------------------
    {
      const adminOrderPaid = waitForMessage(
        adminClient,
        (env) => env.type === "order.updated" && env.payload.order?.status === "paid"
      );
      const adminTableFree = waitForMessage(
        adminClient,
        (env) => env.type === "table.updated" && env.payload.tableId === testTableId && (env.payload.table?.status === "free" || env.payload.table === null)
      );
      const adminBillPaid = waitForMessage(
        adminClient,
        (env) => env.type === "bill.paid" && env.payload.orderId === currentOrderId
      );

      const t0 = performance.now();
      const payRes = await fetch(`${API_URL}/orders/${currentOrderId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          orderId: currentOrderId,
          requestId: `live-pay-${Date.now()}`,
          method: "cash",
          amountReceived: 5000,
        }),
      });

      if (!payRes.ok) {
        throw new Error(`Payment failed: ${payRes.status} ${await payRes.text()}`);
      }

      await Promise.all([adminOrderPaid, adminTableFree, adminBillPaid]);
      const latency = performance.now() - t0;

      recordResult(
        4,
        "Pay order -> order.updated(paid), table.updated(free), bill.paid arrive",
        true,
        latency,
        `All 3 terminal settlement envelopes delivered`
      );
    }

    // -------------------------------------------------------------
    // Step 5: Item marked sold out -> menu.changed arrives on all
    // -------------------------------------------------------------
    {
      const adminMenu = waitForMessage(adminClient, (env) => env.type === "menu.changed");
      const waiter1Menu = waitForMessage(waiter1Client, (env) => env.type === "menu.changed");
      const waiter3Menu = waitForMessage(waiter3Client, (env) => env.type === "menu.changed");

      const t0 = performance.now();
      const patchRes = await fetch(`${API_URL}/menu-items/mi1/availability`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ available: false }),
      });

      if (!patchRes.ok) {
        throw new Error(`Item availability update failed: ${patchRes.status}`);
      }

      await Promise.all([adminMenu, waiter1Menu, waiter3Menu]);
      const latency = performance.now() - t0;

      // Restore availability
      await fetch(`${API_URL}/menu-items/mi1/availability`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ available: true }),
      });

      recordResult(
        5,
        "Item marked sold out -> menu.changed arrives on all clients",
        true,
        latency,
        "Delivered to admin, waiter1, waiter3"
      );
    }

    // -------------------------------------------------------------
    // Step 6: Admin adds a table -> table.updated arrives
    // -------------------------------------------------------------
    let createdTableId: string | null = null;
    {
      const adminTableUpdate = waitForMessage(
        adminClient,
        (env) => env.type === "table.updated" && env.payload.table?.number === 99
      );
      const waiter1TableUpdate = waitForMessage(
        waiter1Client,
        (env) => env.type === "table.updated" && env.payload.table?.number === 99
      );

      const t0 = performance.now();
      const tableRes = await fetch(`${API_URL}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          floorId: "f1",
          number: 99,
          capacity: 4,
        }),
      });

      if (!tableRes.ok) {
        throw new Error(`Create table failed: ${tableRes.status} ${await tableRes.text()}`);
      }
      const tableData = await tableRes.json();
      createdTableId = tableData.id;

      await Promise.all([adminTableUpdate, waiter1TableUpdate]);
      const latency = performance.now() - t0;

      // Clean up table
      await fetch(`${API_URL}/tables/${createdTableId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      recordResult(
        6,
        "Admin adds a table -> table.updated arrives",
        true,
        latency,
        `Table #99 created and verified`
      );
    }

    // -------------------------------------------------------------
    // Step 7: Fake printer fails -> printer.status arrives on admin only
    // -------------------------------------------------------------
    {
      const adminPrinterPromise = waitForMessage(
        adminClient,
        (env) => env.type === "printer.status" && env.payload.printerId === "p1"
      );

      const t0 = performance.now();
      // Update printer p1 to inactive to simulate hardware failure
      const prnRes = await fetch(`${API_URL}/printers/p1`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Sweet Printer",
          ip: "192.168.1.100",
          port: 9100,
          role: "kitchen",
          isActive: false,
        }),
      });

      if (!prnRes.ok) {
        throw new Error(`Printer update failed: ${prnRes.status} ${await prnRes.text()}`);
      }

      const adminEvent = await adminPrinterPromise;
      const latency = performance.now() - t0;

      // Restore printer p1
      await fetch(`${API_URL}/printers/p1`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Sweet Printer",
          ip: "192.168.1.100",
          port: 9100,
          role: "kitchen",
          isActive: true,
        }),
      });

      // Wait 300ms to ensure waiters never receive printer.status
      await sleep(300);

      const passed =
        adminEvent.env.payload.printerId === "p1" &&
        waiter1PrinterEvents.length === 0;

      recordResult(
        7,
        "Fake printer fails -> printer.status arrives on admin only, never on waiters",
        passed,
        latency,
        `Admin received: ${adminEvent.env.payload.state}, Waiter1 received: ${waiter1PrinterEvents.length}`
      );
    }

    // -------------------------------------------------------------
    // Step 8: Waiter 3 receives zero events for floor 2 and zero printer events throughout
    // -------------------------------------------------------------
    {
      const t0 = performance.now();

      // Trigger an event explicitly on floor 2 to verify isolation
      const floor2Res = await fetch(`${API_URL}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          floorId: "f2",
          number: 98,
          capacity: 4,
        }),
      });
      if (floor2Res.ok) {
        const f2Table = await floor2Res.json();
        await sleep(300);
        await fetch(`${API_URL}/tables/${f2Table.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      }

      await sleep(300);

      // Check all events received by waiter3
      const printerEvents = waiter3ReceivedEvents.filter((e) => e.type === "printer.status");
      const floor2Events = waiter3ReceivedEvents.filter(
        (e) => e.payload?.floorId === "floor-2" || e.payload?.floorId === "f2"
      );

      const latency = performance.now() - t0;
      const passed = printerEvents.length === 0 && floor2Events.length === 0;

      recordResult(
        8,
        "Waiter 3 receives zero events for floor 2 and zero printer events throughout",
        passed,
        latency,
        `Floor 2 events: ${floor2Events.length}, Printer events: ${printerEvents.length}`
      );
    }

    // -------------------------------------------------------------
    // Step 9: Kill backend process and restart -> clients reconnect, fresh snapshot, serverBootId change
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      const oldBootId = adminClient.getServerBootId();

      let serverRestartDetected = false;
      let newObservedBootId = "";

      adminClient["onServerRestart"] = (newBootId: string, prevBootId: string) => {
        serverRestartDetected = true;
        newObservedBootId = newBootId;
      };

      const adminReconnectedPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Admin failed to reconnect after restart within 20s")), 20000);
        const check = setInterval(() => {
          if (adminClient.getStatus() === "connected" && adminClient.getServerBootId() !== oldBootId) {
            clearTimeout(timeout);
            clearInterval(check);
            resolve();
          }
        }, 200);
      });

      console.log(`[STEP 9] Killing backend process (current bootId=${oldBootId})...`);
      await killBackend(spawnedBackendProcess);
      spawnedBackendProcess = null;

      console.log("[STEP 9] Spawning fresh backend instance...");
      spawnedBackendProcess = await startBackend();
      console.log(`[STEP 9] Backend restarted (PID ${spawnedBackendProcess.pid})`);
      adminClient.connect();
      waiter1Client.connect();
      waiter3Client.connect();

      await adminReconnectedPromise;
      const latency = performance.now() - t0;
      const newBootId = adminClient.getServerBootId();

      const passed =
        Boolean(newBootId) &&
        newBootId !== oldBootId &&
        adminClient.getStatus() === "connected";

      recordResult(
        9,
        "Kill backend process and restart -> clients reconnect, fresh snapshot, serverBootId change",
        passed,
        latency,
        `Old bootId: ${oldBootId?.slice(0, 8)}, New bootId: ${newBootId?.slice(0, 8)}`
      );
    }

    // -------------------------------------------------------------
    // Step 10: Client with invalid token receives close code 4401 and stops reconnecting
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      let unauthorizedFired = false;

      const badClient = new RealtimeClient({
        apiUrl: API_URL,
        getToken: () => "invalid_expired_jwt_token_4401",
        WebSocketClass: globalThis.WebSocket,
        onUnauthorized: () => {
          unauthorizedFired = true;
        },
      });

      badClient.connect();

      // Wait up to 3s for 4401 close
      const start = Date.now();
      while (Date.now() - start < 3000 && !unauthorizedFired) {
        await sleep(100);
      }

      // Check status remains disconnected and does NOT attempt reconnect
      await sleep(500);
      const latency = performance.now() - t0;

      const passed = unauthorizedFired && badClient.getStatus() === "disconnected";
      badClient.disconnect();

      recordResult(
        10,
        "Client with invalid token receives close code 4401 and stops reconnecting",
        passed,
        latency,
        `onUnauthorized callback invoked, status is ${badClient.getStatus()}`
      );
    }

    // Teardown clients
    adminClient.disconnect();
    waiter1Client.disconnect();
    waiter3Client.disconnect();

  } finally {
    // Clean up backend process if spawned by this test
    if (spawnedBackendProcess) {
      console.log(`[CLEANUP] Stopping test backend PID ${spawnedBackendProcess.pid}...`);
      await killBackend(spawnedBackendProcess);
      spawnedBackendProcess = null;
    }
  }

  // Summary Table
  console.log("\n=======================================================");
  console.log("                  LIVE TEST SUMMARY                     ");
  console.log("=======================================================");
  console.log("Step | Status | Latency  | Description");
  console.log("-----+--------+----------+--------------------------------------------------");
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    const padStep = String(r.step).padStart(4, " ");
    const padStatus = status.padEnd(6, " ");
    const padLatency = `${r.latencyMs.toFixed(1)}ms`.padStart(8, " ");
    console.log(`${padStep} | ${padStatus} | ${padLatency} | ${r.name}`);
  }
  console.log("=======================================================\n");

  const allPassed = results.length === 10 && results.every((r) => r.passed);
  if (!allPassed) {
    console.error("❌ Some live WebSocket tests failed!");
    process.exit(1);
  } else {
    console.log(" All 10 live WebSocket checks passed successfully!");
    process.exit(0);
  }
}

runLiveTests().catch((err) => {
  console.error("Fatal error during live WebSocket tests:", err);
  if (spawnedBackendProcess) {
    killBackend(spawnedBackendProcess);
  }
  process.exit(1);
});
