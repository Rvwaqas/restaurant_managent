import { describe, it, expect } from "vitest";
import { buildCsvFilename } from "@/lib/export/csv";

describe("CSV Export Utilities", () => {
  it("builds consistent standard filenames with date bounds", () => {
    const filename = buildCsvFilename("sales", "2026-11-01", "2026-11-05");
    expect(filename).toBe("pos-report-sales_2026-11-01_to_2026-11-05.csv");
  });

  it("handles single-date filename correctly", () => {
    const filename = buildCsvFilename("daily-closing", "2026-11-05", "2026-11-05");
    expect(filename).toBe("pos-report-daily-closing_2026-11-05_to_2026-11-05.csv");
  });
});

