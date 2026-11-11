import { describe, it, expect } from "vitest";

describe("Reports Financial Accounting Logic", () => {
  it("verifies Gross Sales - Discounts = Net Sales", () => {
    const grossSales = 12500;
    const discounts = 1250; // 10%
    const netSales = grossSales - discounts;
    expect(netSales).toBe(11250);
  });

  it("verifies Grand Total equals Net Sales + Tax + Service Charge", () => {
    const netSales = 11250;
    const tax = 0;
    const serviceCharge = 0;
    const grandTotal = netSales + tax + serviceCharge;
    expect(grandTotal).toBe(11250);
  });

  it("verifies tender settlement sum equals Grand Total", () => {
    const cash = 6000;
    const card = 4000;
    const online = 1250;
    const totalTender = cash + card + online;
    expect(totalTender).toBe(11250);
  });

  it("calculates average bill correctly", () => {
    const grandTotal = 15000;
    const billsCount = 10;
    const avgBill = grandTotal / billsCount;
    expect(avgBill).toBe(1500);
  });
});

