import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStore } from "@/store/connectionStore";

describe("useConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: "online",
      consecutiveFailures: 0,
      lastOnlineAt: Date.now(),
      lastStatusChangeAt: Date.now(),
      isBrowserOnline: true,
      wsStatus: "connected",
    });
  });

  it("initializes with online status", () => {
    expect(useConnectionStore.getState().status).toBe("online");
  });

  it("transitions to unstable on 1 failure", () => {
    useConnectionStore.getState().reportFailure();
    expect(useConnectionStore.getState().status).toBe("unstable");
    expect(useConnectionStore.getState().consecutiveFailures).toBe(1);
  });

  it("transitions to offline on 3 consecutive failures", () => {
    useConnectionStore.getState().reportFailure();
    useConnectionStore.getState().reportFailure();
    useConnectionStore.getState().reportFailure();
    expect(useConnectionStore.getState().status).toBe("offline");
    expect(useConnectionStore.getState().consecutiveFailures).toBe(3);
  });

  it("recovers to online on reportSuccess", () => {
    useConnectionStore.getState().reportFailure();
    useConnectionStore.getState().reportFailure();
    expect(useConnectionStore.getState().status).toBe("unstable");

    useConnectionStore.getState().reportSuccess();
    expect(useConnectionStore.getState().status).toBe("online");
    expect(useConnectionStore.getState().consecutiveFailures).toBe(0);
  });
});

