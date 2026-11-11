// In-memory control state for mock failure toggles

let mockFailedPrinterId: string | null = null;

export function setMockFailedPrinterId(id: string | null): void {
  mockFailedPrinterId = id;
}

export function getMockFailedPrinterId(): string | null {
  return mockFailedPrinterId;
}

