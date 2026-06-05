import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getServicePrincipal: vi.fn() }));
vi.mock("@/lib/maintenance", () => ({
  scanForMaintenance: vi.fn(),
  DEFAULT_MAINTENANCE_CAP: 10,
}));
vi.mock("@/lib/tasks", () => ({ enqueueTask: vi.fn() }));

import { getServicePrincipal } from "@/lib/auth";
import { scanForMaintenance } from "@/lib/maintenance";
import { enqueueTask } from "@/lib/tasks";

const mockedGetService = vi.mocked(getServicePrincipal);
const mockedScan = vi.mocked(scanForMaintenance);
const mockedEnqueue = vi.mocked(enqueueTask);

const SAMPLE = [
  { kind: "maintain" as const, op: "staleness" as const, slug: "stale" },
  { kind: "maintain" as const, op: "reconcile" as const, slug: "disp", threadIndex: 0 },
];

async function scan(query = "") {
  const { POST } = await import("@/app/api/tasks/scan/route");
  return POST(
    new Request(`http://localhost/api/tasks/scan${query}`, { method: "POST" }),
  );
}

let savedFlag: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  savedFlag = process.env.AUTONOMOUS_MAINTENANCE;
  delete process.env.AUTONOMOUS_MAINTENANCE;
  mockedGetService.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
  mockedScan.mockResolvedValue(SAMPLE);
  mockedEnqueue.mockResolvedValue(true);
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.AUTONOMOUS_MAINTENANCE;
  else process.env.AUTONOMOUS_MAINTENANCE = savedFlag;
});

describe("POST /api/tasks/scan", () => {
  it("401s without the service token", async () => {
    mockedGetService.mockReturnValue(null);
    expect((await scan()).status).toBe(401);
    expect(mockedScan).not.toHaveBeenCalled();
  });

  it("dry-runs (enqueues nothing) when AUTONOMOUS_MAINTENANCE is off", async () => {
    const res = await scan();
    const body = await res.json();
    expect(body).toMatchObject({ enabled: false, dry: true, found: 2, enqueued: 0 });
    expect(mockedEnqueue).not.toHaveBeenCalled();
    // Still reports what it WOULD enqueue.
    expect(body.tasks).toHaveLength(2);
  });

  it("enqueues when AUTONOMOUS_MAINTENANCE=on", async () => {
    process.env.AUTONOMOUS_MAINTENANCE = "on";
    const res = await scan();
    const body = await res.json();
    expect(body).toMatchObject({ enabled: true, dry: false, found: 2, enqueued: 2 });
    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
  });

  it("?dry=1 forces a dry-run even when enabled", async () => {
    process.env.AUTONOMOUS_MAINTENANCE = "on";
    const res = await scan("?dry=1");
    const body = await res.json();
    expect(body).toMatchObject({ enabled: true, dry: true, enqueued: 0 });
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("honors a ?cap override", async () => {
    await scan("?cap=3");
    expect(mockedScan).toHaveBeenCalledWith(3);
  });
});
