import { describe, it, expect } from "vitest";
import { formatMoney } from "@/utils/money";

describe("formatMoney helper", () => {
  it("formats standard numbers with 2 decimal places and currency prefix", () => {
    expect(formatMoney(0)).toBe("Rs 0.00");
    expect(formatMoney(500)).toBe("Rs 500.00");
    expect(formatMoney(1250.5)).toBe("Rs 1250.50");
  });

  it("handles null or undefined gracefully with zero fallback", () => {
    expect(formatMoney(null)).toBe("Rs 0.00");
    expect(formatMoney(undefined)).toBe("Rs 0.00");
  });

  it("handles negative numbers", () => {
    expect(formatMoney(-250)).toBe("Rs -250.00");
  });
});
