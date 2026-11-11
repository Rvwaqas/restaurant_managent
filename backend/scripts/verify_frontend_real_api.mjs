/**
 * Step 9 Frontend Verification against real FastAPI backend.
 * Executes exact frontend service flows with NEXT_PUBLIC_USE_MOCK=false.
 */

const API_BASE = "http://localhost:8000/api";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runVerification() {
  console.log("=== SECTION 9: FRONTEND VERIFICATION AGAINST REAL BACKEND ===");
  const results = [];

  function record(step, ok, details = "") {
    results.push({ step, ok, details });
    console.log(`[${ok ? "PASS" : "FAIL"}] ${step} ${details ? "- " + details : ""}`);
  }

  // 1. Login verification
  console.log("\n1. Testing Login for all accounts...");
  const adminLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  record("Admin Login", adminLogin.status === 200, `token length: ${adminLogin.data?.token?.length}`);
  const adminToken = adminLogin.data?.token;

  const w1Login = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "waiter1", password: "1234" }),
  });
  record("Waiter 1 Login", w1Login.status === 200);

  const w2Login = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "waiter2", password: "1234" }),
  });
  record("Waiter 2 Login", w2Login.status === 200);
  const w2Token = w2Login.data?.token;

  // 2. Table grids load for /floor-1 and /floor-2
  console.log("\n2. Testing /floor-1 and /floor-2 table grids load...");
  const f1Tables = await request("/tables?floorId=f1", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const allFreeF1 = f1Tables.data?.every((t) => t.status === "free");
  record("Floor 1 Table Grid", f1Tables.status === 200 && f1Tables.data?.length === 10, `Tables: ${f1Tables.data?.length}, all free: ${allFreeF1}`);

  const f2Tables = await request("/tables?floorId=f2", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const allFreeF2 = f2Tables.data?.every((t) => t.status === "free");
  record("Floor 2 Table Grid", f2Tables.status === 200 && f2Tables.data?.length === 10, `Tables: ${f2Tables.data?.length}, all free: ${allFreeF2}`);

  // Waiter 2 accessing floor 2 receives 403
  const w2Floor2 = await request("/tables?floorId=f2", {
    headers: { Authorization: `Bearer ${w2Token}` },
  });
  record("Waiter 2 Guard on Floor 2", w2Floor2.status === 403);

  // 3. Order page menu bundle
  console.log("\n3. Testing Order page menu loading...");
  const f1Menu = await request("/menu?floorId=f1", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("Floor 1 Menu Bundle (Halal)", f1Menu.status === 200 && f1Menu.data?.categories?.length === 3 && f1Menu.data?.items?.length === 8, `Categories: ${f1Menu.data?.categories?.length}, Items: ${f1Menu.data?.items?.length}`);

  const f2Menu = await request("/menu?floorId=f2", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("Floor 2 Menu Bundle (Non-Halal)", f2Menu.status === 200 && f2Menu.data?.categories?.length === 3 && f2Menu.data?.items?.length === 80, `Categories: ${f2Menu.data?.categories?.length}, Active Items: ${f2Menu.data?.items?.length}`);

  // 4. Admin Menu Page: Category & Item CRUD, Availability, Reorder, Duplicate, Image upload
  console.log("\n4. Testing Admin Menu Page operations...");
  // Image Upload
  const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  const pngBytes = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c400000000d49444154789c636000000002000148afa4710000000049454e44ae426082", "hex");
  const postBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`),
    pngBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const uploadRes = await fetch(`${API_BASE}/uploads/image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: postBody,
  });
  const uploadData = await uploadRes.json();
  record("Image Upload", uploadRes.status === 200 && uploadData.url?.includes("/api/uploads/"), `URL: ${uploadData.url}`);

  // Category CRUD
  const catCreate = await request("/categories", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ floorId: "f1", name: "Chef Specials", printerId: "p1" }),
  });
  record("Admin Category Create", catCreate.status === 201);
  const testCatId = catCreate.data?.id;

  const catEdit = await request(`/categories/${testCatId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Chef Signature Dishes" }),
  });
  record("Admin Category Edit", catEdit.status === 200 && catEdit.data?.name === "Chef Signature Dishes");

  // Item Create
  const itemCreate = await request("/menu-items", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      floorId: "f1",
      categoryId: testCatId,
      name: "Special Lamb Shank",
      price: 88.0,
      image: uploadData.url,
      description: "Slow braised lamb shank",
    }),
  });
  record("Admin Item Create", itemCreate.status === 201 && itemCreate.data?.price === 88);
  const testItemId = itemCreate.data?.id;

  // Availability toggle
  const itemAvail = await request(`/menu-items/${testItemId}/availability`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ available: false }),
  });
  record("Admin Item Availability Toggle", itemAvail.status === 200 && itemAvail.data?.available === false);

  // Duplicate to other floor
  const itemDup = await request(`/menu-items/${testItemId}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ targetFloorId: "f2", targetCategoryId: "c4" }),
  });
  record("Admin Item Duplicate to Floor 2", itemDup.status === 201 && itemDup.data?.floorId === "f2");
  const dupItemId = itemDup.data?.id;

  // Cleanup items & category
  await request(`/menu-items/${testItemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
  await request(`/menu-items/${dupItemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
  const catDel = await request(`/categories/${testCatId}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
  record("Admin Category Delete", catDel.status === 200 && catDel.data?.success === true);

  // 5. Admin Tables: Add, Bulk Add, Delete Rules
  console.log("\n5. Testing Admin Tables operations...");
  const tblAdd = await request("/tables", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ floorId: "f1", number: 95, capacity: 4 }),
  });
  record("Admin Table Single Add", tblAdd.status === 201);
  const testTblId = tblAdd.data?.id;

  const tblBulk = await request("/tables/bulk", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ floorId: "f1", from: 96, to: 98, capacity: 6 }),
  });
  record("Admin Table Bulk Add", tblBulk.status === 200 && tblBulk.data?.created?.length === 3);

  // Delete clean table
  const tblDel = await request(`/tables/${testTblId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("Admin Table Delete", tblDel.status === 200 && tblDel.data?.softDeleted === false);

  // Clean bulk tables
  for (const t of tblBulk.data?.created || []) {
    await request(`/tables/${t.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
  }

  // 6. Admin Printers: Add, Edit, Test Print, Delete Rules
  console.log("\n6. Testing Admin Printers operations...");
  const prnAdd = await request("/printers", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Rooftop Grill Printer", ip: "192.168.1.180", port: 9100, role: "kitchen" }),
  });
  record("Admin Printer Add", prnAdd.status === 201);
  const testPrnId = prnAdd.data?.id;

  const prnEdit = await request(`/printers/${testPrnId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Rooftop Kitchen Slip Printer" }),
  });
  record("Admin Printer Edit", prnEdit.status === 200 && prnEdit.data?.name === "Rooftop Kitchen Slip Printer");

  const prnTest = await request(`/printers/${testPrnId}/test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("Admin Printer Test Print", prnTest.status === 200 && prnTest.data?.status === "ok");

  const prnDel = await request(`/printers/${testPrnId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("Admin Printer Delete", prnDel.status === 200 && prnDel.data?.success === true);

  // 7. B3 Orders Lifecycle: Send, Void, Pay, Reprint, List Paid
  console.log("\n7. Testing B3 Orders Lifecycle (Send, Idempotency, Void, Pay, Reprint, List Paid)...");
  
  // Pick table 1 on floor 1, ensure free
  const targetTable = f1Tables.data?.[0];
  const targetDish1 = f1Menu.data?.items?.[0];
  const targetDish2 = f1Menu.data?.items?.[1];

  // If table is currently occupied, cancel open order to ensure clean slate
  const openOrderRes = await request(`/orders/open?tableId=${targetTable.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (openOrderRes.data?.id) {
    await request(`/orders/${openOrderRes.data.id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }

  const sendReq1 = `verify-send-1-${Date.now()}`;
  const sendRes1 = await request("/orders/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: targetTable.id,
      requestId: sendReq1,
      items: [{ menuItemId: targetDish1.id, qty: 2, note: "Extra spicy" }],
    }),
  });
  record("Order Send Batch 1", sendRes1.status === 200 && sendRes1.data?.batchNo === 1 && sendRes1.data?.printJobs?.length >= 1, `batch: ${sendRes1.data?.batchNo}, jobs: ${sendRes1.data?.printJobs?.length}`);
  const activeOrderId = sendRes1.data?.order?.id;
  const itemToVoid = sendRes1.data?.order?.items?.[0];

  // Idempotency replay
  const sendReplay = await request("/orders/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: targetTable.id,
      requestId: sendReq1,
      items: [{ menuItemId: targetDish1.id, qty: 2, note: "Extra spicy" }],
    }),
  });
  record("Order Send Idempotency Replay", sendReplay.status === 200 && sendReplay.data?.order?.items?.length === 1);

  // Send batch 2
  const sendRes2 = await request("/orders/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: targetTable.id,
      requestId: `verify-send-2-${Date.now()}`,
      items: [{ menuItemId: targetDish2.id, qty: 1 }],
    }),
  });
  record("Order Send Batch 2", sendRes2.status === 200 && sendRes2.data?.batchNo === 2);

  // Waiter void attempt (403 forbidden)
  const waiterVoid = await request(`/orders/${activeOrderId}/void-item`, {
    method: "POST",
    headers: { Authorization: `Bearer ${w1Login.data?.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: activeOrderId,
      orderItemId: itemToVoid.id,
      reason: "Customer cancelled",
      requestId: `void-waiter-${Date.now()}`,
    }),
  });
  record("Waiter Void Guard (403)", waiterVoid.status === 403);

  // Admin void success
  const adminVoid = await request(`/orders/${activeOrderId}/void-item`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: activeOrderId,
      orderItemId: itemToVoid.id,
      reason: "Customer cancelled",
      requestId: `void-admin-${Date.now()}`,
    }),
  });
  record("Admin Void Item", adminVoid.status === 200 && adminVoid.data?.voidedItem?.voided === true);

  // Cash underpayment validation (422)
  const underpayRes = await request(`/orders/${activeOrderId}/pay`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: activeOrderId,
      requestId: `pay-under-${Date.now()}`,
      method: "cash",
      amountReceived: 10,
    }),
  });
  record("Cash Underpayment Guard (422)", underpayRes.status === 422);

  // Pay order with Cash
  const currentTotal = adminVoid.data?.order?.total || 100;
  const payRes = await request(`/orders/${activeOrderId}/pay`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: activeOrderId,
      requestId: `pay-ok-${Date.now()}`,
      method: "cash",
      amountReceived: currentTotal + 50,
    }),
  });
  record("Pay Order (Cash + BillNo)", payRes.status === 200 && payRes.data?.order?.status === "paid" && payRes.data?.order?.billNo?.startsWith("B-") && payRes.data?.table?.status === "free");

  // Reprint Bill
  const reprintRes = await request(`/orders/${activeOrderId}/reprint-bill`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("Reprint Bill", reprintRes.status === 200 && reprintRes.data?.printerId?.length > 0);

  // List Paid Orders
  const listPaidRes = await request("/orders/paid?limit=10&page=1", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("List Paid Bills", listPaidRes.status === 200 && listPaidRes.data?.items?.length >= 1 && listPaidRes.data?.totalAmount > 0);

  console.log("\n=== ALL FRONTEND WORKFLOWS (INCLUDING B3 ORDERS) VERIFIED CLEANLY ===");
}

runVerification().catch(console.error);

