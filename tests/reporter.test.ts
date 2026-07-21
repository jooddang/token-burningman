import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { submitPublicReport } from "../src/reporter.js";
import type { Config, HourlyAggregate, HourlyBucket } from "../src/types.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import {
  acquireLock,
  getHourlyFilePath,
  getStorageDir,
  readJson,
  releaseLock,
  writeJsonAtomic,
} from "../src/utils/storage.js";

interface CapturedBatch {
  v: number;
  reports: Array<{ hour: string; model: string }>;
}

function makeBucket(seed: number): HourlyBucket {
  return {
    input: seed,
    output: seed + 1,
    cacheRead: seed + 2,
    cacheCreate: seed + 3,
    cost: seed / 100,
    requests: 1,
    linesAdded: seed,
    linesRemoved: 0,
    sessions: [`session-${seed}`],
    avgContextPct: 25,
  };
}

function makeHour(modelCount: number, offset = 0): Record<string, HourlyBucket> {
  return Object.fromEntries(
    Array.from({ length: modelCount }, (_, index) => [
      `model-${String(offset + index).padStart(3, "0")}`,
      makeBucket(offset + index + 1),
    ]),
  );
}

async function startReportServer(
  respond: (
    requestNumber: number,
    batch: CapturedBatch,
  ) => { status: number; body?: unknown; abortAfterPartialBody?: boolean },
): Promise<{ serverUrl: string; batches: CapturedBatch[]; close: () => Promise<void> }> {
  const batches: CapturedBatch[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const batch = JSON.parse(body) as CapturedBatch;
      batches.push(batch);
      const result = respond(batches.length, batch);
      if (result.abortAfterPartialBody) {
        response.writeHead(result.status, {
          "Content-Type": "application/json",
          "Content-Length": "100",
        });
        response.flushHeaders();
        response.write('{"status":"');
        setImmediate(() => response.destroy());
        return;
      }
      response.writeHead(result.status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result.body ?? { status: "ok" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");

  return {
    serverUrl: `http://127.0.0.1:${address.port}`,
    batches,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

describe("community report batching", () => {
  let tempDir: string;
  let previousStorageDir: string | undefined;
  const servers: Array<{ close: () => Promise<void> }> = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-burningman-reporter-"));
    previousStorageDir = process.env.CLAUDE_USAGE_DIR;
    process.env.CLAUDE_USAGE_DIR = path.join(tempDir, ".token-burningman");
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    if (previousStorageDir === undefined) {
      delete process.env.CLAUDE_USAGE_DIR;
    } else {
      process.env.CLAUDE_USAGE_DIR = previousStorageDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function configFor(serverUrl: string): Config {
    return {
      ...DEFAULT_CONFIG,
      publicReporting: {
        enabled: true,
        serverUrl,
        cliToken: "test-token",
      },
    };
  }

  function writeHourly(hourly: HourlyAggregate, date = "2026-01-01"): void {
    writeJsonAtomic(getHourlyFilePath(date), hourly);
  }

  function readCheckpoint(): string | null {
    return readJson<{ lastReportedHour: string | null }>(
      path.join(getStorageDir(), ".report-state.json"),
      { lastReportedHour: null },
    ).lastReportedHour;
  }

  it("packs complete hours into bounded chronological batches", async () => {
    writeHourly({
      "0": makeHour(60),
      "1": makeHour(40, 60),
      "2": makeHour(30, 100),
    });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    const submitted = await submitPublicReport(configFor(reportServer.serverUrl));

    expect(submitted).toBe(true);
    expect(reportServer.batches.map((batch) => batch.reports.length)).toEqual([100, 30]);
    expect(reportServer.batches.every((batch) => batch.reports.length <= 100)).toBe(true);
    expect(new Set(reportServer.batches[0].reports.map((report) => report.hour))).toEqual(
      new Set(["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"]),
    );
    expect(new Set(reportServer.batches[1].reports.map((report) => report.hour))).toEqual(
      new Set(["2026-01-01T02:00:00Z"]),
    );
    expect(readCheckpoint()).toBe("2026-01-01T02:00:00Z");
  });

  it("checkpoints completed batches and resumes after a later batch fails", async () => {
    writeHourly({
      "0": makeHour(60),
      "1": makeHour(40, 60),
      "2": makeHour(80, 100),
      "3": makeHour(30, 180),
    });
    const reportServer = await startReportServer((requestNumber) => ({
      status: requestNumber === 2 ? 500 : 200,
    }));
    servers.push(reportServer);
    const config = configFor(reportServer.serverUrl);

    expect(await submitPublicReport(config)).toBe(false);
    expect(reportServer.batches.map((batch) => batch.reports.length)).toEqual([100, 80]);
    expect(readCheckpoint()).toBe("2026-01-01T01:00:00Z");

    expect(await submitPublicReport(config)).toBe(true);
    expect(reportServer.batches.map((batch) => batch.reports.length)).toEqual([100, 80, 80, 30]);
    expect(readCheckpoint()).toBe("2026-01-01T03:00:00Z");
  });

  it("stops and preserves the checkpoint when a response aborts mid-body", async () => {
    writeHourly({
      "0": makeHour(60),
      "1": makeHour(40, 60),
      "2": makeHour(80, 100),
      "3": makeHour(30, 180),
    });
    const reportServer = await startReportServer((requestNumber) => ({
      status: 200,
      abortAfterPartialBody: requestNumber === 2,
    }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(false);

    expect(reportServer.batches.map((batch) => batch.reports.length)).toEqual([100, 80]);
    expect(readCheckpoint()).toBe("2026-01-01T01:00:00Z");
  });

  it("sends an oversized single-hour group alone instead of splitting the hour", async () => {
    writeHourly({ "0": makeHour(101) });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(true);

    expect(reportServer.batches).toHaveLength(1);
    expect(reportServer.batches[0].reports).toHaveLength(101);
    expect(new Set(reportServer.batches[0].reports.map((report) => report.hour))).toEqual(
      new Set(["2026-01-01T00:00:00Z"]),
    );
  });

  it("accepts a single-hour group at the exact server hard limit", async () => {
    writeHourly({ "0": makeHour(500) });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(true);

    expect(reportServer.batches).toHaveLength(1);
    expect(reportServer.batches[0].reports).toHaveLength(500);
    expect(readCheckpoint()).toBe("2026-01-01T00:00:00Z");
  });

  it("refuses a single-hour group above the server hard limit without sending it", async () => {
    writeHourly({ "0": makeHour(501) });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(false);

    expect(reportServer.batches).toHaveLength(0);
    expect(readCheckpoint()).toBeNull();
  });

  it("checkpoints valid batches before stopping at a later oversized hour", async () => {
    writeHourly({
      "0": makeHour(60),
      "1": makeHour(40, 60),
      "2": makeHour(501, 100),
    });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(false);

    expect(reportServer.batches.map((batch) => batch.reports.length)).toEqual([100]);
    expect(readCheckpoint()).toBe("2026-01-01T01:00:00Z");
  });

  it("does not start a competing sync while the report lock is held", async () => {
    writeHourly({ "0": makeHour(2) });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);
    const reportLockPath = path.join(getStorageDir(), ".report.lock");
    const reportLockFd = acquireLock(reportLockPath);
    expect(reportLockFd).not.toBeNull();

    try {
      expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(false);
      expect(reportServer.batches).toHaveLength(0);
      expect(readCheckpoint()).toBeNull();
    } finally {
      releaseLock(reportLockPath, reportLockFd);
    }

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(true);
    expect(reportServer.batches).toHaveLength(1);
    expect(readCheckpoint()).toBe("2026-01-01T00:00:00Z");
  });

  it("sorts hours and models on the wire regardless of source insertion order", async () => {
    writeHourly({
      "01": {
        "model-z": makeBucket(3),
        "model-a": makeBucket(2),
      },
      "00": {
        "model-y": makeBucket(1),
        "model-b": makeBucket(0),
      },
    });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(true);

    expect(reportServer.batches).toHaveLength(1);
    expect(reportServer.batches[0].reports.map(({ hour, model }) => `${hour}:${model}`)).toEqual([
      "2026-01-01T00:00:00Z:model-b",
      "2026-01-01T00:00:00Z:model-y",
      "2026-01-01T01:00:00Z:model-a",
      "2026-01-01T01:00:00Z:model-z",
    ]);
    expect(readCheckpoint()).toBe("2026-01-01T01:00:00Z");
  });

  it("filters completed hours from an existing checkpoint", async () => {
    writeHourly({
      "0": makeHour(2),
      "1": makeHour(3, 2),
    });
    writeJsonAtomic(path.join(getStorageDir(), ".report-state.json"), {
      lastReportedHour: "2026-01-01T00:00:00Z",
    });
    const reportServer = await startReportServer(() => ({ status: 200 }));
    servers.push(reportServer);

    expect(await submitPublicReport(configFor(reportServer.serverUrl))).toBe(true);

    expect(reportServer.batches).toHaveLength(1);
    expect(reportServer.batches[0].reports).toHaveLength(3);
    expect(new Set(reportServer.batches[0].reports.map((report) => report.hour))).toEqual(
      new Set(["2026-01-01T01:00:00Z"]),
    );
  });

  it("clears an expired token without advancing the checkpoint", async () => {
    writeHourly({
      "0": makeHour(60),
      "1": makeHour(40, 60),
      "2": makeHour(30, 100),
    });
    const reportServer = await startReportServer((requestNumber) => ({
      status: requestNumber === 2 ? 401 : 200,
    }));
    servers.push(reportServer);
    const config = configFor(reportServer.serverUrl);
    const configPath = path.join(getStorageDir(), "config.json");
    writeJsonAtomic(configPath, config);

    expect(await submitPublicReport(config)).toBe(false);

    expect(readCheckpoint()).toBe("2026-01-01T01:00:00Z");
    expect(config.publicReporting.cliToken).toBeNull();
    expect(fs.existsSync(configPath)).toBe(true);
    expect(readJson<Config>(configPath, DEFAULT_CONFIG)
      .publicReporting.cliToken).toBeNull();
  });
});
