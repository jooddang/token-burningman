import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureStorageDirs, getHourlyFilePath, getSessionFilePath } from "../src/utils/storage.js";
import { getOverviewModel, getProjectsModel, getSessionsModel, getTrendsModel } from "../src/dashboard/service.js";
import { renderOverviewMarkdown } from "../src/presenters/text/overview.js";
import { renderProjectsMarkdown } from "../src/presenters/text/projects.js";
import { renderSessionsMarkdown } from "../src/presenters/text/sessions.js";
import { renderTrendsMarkdown } from "../src/presenters/text/trends.js";
import { runHourlyMaintenanceSafe, shouldRunHourlyMaintenance } from "../src/maintenance.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import type { HourlyAggregate, QuotaState, SessionEntry } from "../src/types.js";

describe("dashboard service and native renderers", () => {
  let tempDir: string;
  let previousStorageDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-burningman-"));
    previousStorageDir = process.env.CLAUDE_USAGE_DIR;
    process.env.CLAUDE_USAGE_DIR = tempDir;
    ensureStorageDirs();

    const now = Date.now();
    const d = new Date(now);
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hour = String(d.getHours());

    const entries: SessionEntry[] = [
      {
        t: now - 5 * 60_000,
        sid: "sess12345678",
        model: "claude-sonnet-4-6",
        proj: "alpha",
        in: 20,
        out: 10,
        cr: 10,
        cc: 5,
        tin: 100,
        tout: 50,
        ctx: 30,
        ctxMax: 200000,
        cost: 1.0,
        la: 2,
        lr: 1,
      },
      {
        t: now - 1 * 60_000,
        sid: "sess12345678",
        model: "claude-sonnet-4-6",
        proj: "alpha",
        in: 40,
        out: 15,
        cr: 20,
        cc: 5,
        tin: 160,
        tout: 90,
        ctx: 50,
        ctxMax: 200000,
        cost: 1.5,
        la: 3,
        lr: 1,
      },
    ];

    fs.writeFileSync(
      getSessionFilePath("sess12345678"),
      entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      "utf8",
    );

    const hourly: HourlyAggregate = {
      [hour]: {
        "claude-sonnet-4-6": {
          input: 60,
          output: 40,
          cacheRead: 20,
          cacheCreate: 5,
          cost: 1.5,
          requests: 2,
          linesAdded: 3,
          linesRemoved: 1,
          sessions: ["sess12345678"],
          avgContextPct: 40,
        },
      },
    };
    fs.writeFileSync(getHourlyFilePath(today), JSON.stringify(hourly, null, 2), "utf8");

    const quotaDir = path.join(tempDir, "quota");
    const quota: QuotaState = {
      lastFetchedAt: now,
      five_hour: { utilization: 0.5, resets_at: new Date(now + 60_000).toISOString() },
      seven_day: { utilization: 0.2, resets_at: new Date(now + 120_000).toISOString() },
    };
    fs.writeFileSync(path.join(quotaDir, "state.json"), JSON.stringify(quota, null, 2), "utf8");
  });

  afterEach(() => {
    if (previousStorageDir === undefined) {
      delete process.env.CLAUDE_USAGE_DIR;
    } else {
      process.env.CLAUDE_USAGE_DIR = previousStorageDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds overview and sessions models from shared local data", () => {
    const overview = getOverviewModel();
    const sessions = getSessionsModel("24h");

    expect(overview.totals.totalTokens).toBe(250);
    expect(overview.totals.totalCost).toBe(1.5);
    expect(overview.totals.sessionCount).toBe(1);
    expect(overview.hourly).toHaveLength(1);
    expect(overview.activeSessions[0]?.modelLabel).toBe("Sonnet");

    expect(sessions.sessions).toHaveLength(1);
    expect(sessions.durationBuckets.some((bucket) => bucket.count > 0)).toBe(true);
  });

  it("renders markdown for native Claude Code surfaces", () => {
    const overviewText = renderOverviewMarkdown(getOverviewModel());
    const sessionsText = renderSessionsMarkdown(getSessionsModel("24h"));
    const projectsText = renderProjectsMarkdown(getProjectsModel(30));
    const trendsText = renderTrendsMarkdown(getTrendsModel(30));

    expect(overviewText).toContain("# Token Burningman Overview");
    expect(overviewText).toContain("Tokens: 250");
    expect(sessionsText).toContain("# Session History (24h)");
    expect(projectsText).toContain("# Projects (30d)");
    expect(projectsText).toContain("alpha");
    expect(trendsText).toContain("# Trends (30d)");
  });

  it("runs hourly maintenance once per interval", async () => {
    expect(shouldRunHourlyMaintenance(DEFAULT_CONFIG)).toBe(true);

    const first = await runHourlyMaintenanceSafe(DEFAULT_CONFIG);
    expect(first.ran).toBe(true);

    const second = await runHourlyMaintenanceSafe(DEFAULT_CONFIG);
    expect(second.ran).toBe(false);
    expect(shouldRunHourlyMaintenance(DEFAULT_CONFIG)).toBe(false);
  });
});
