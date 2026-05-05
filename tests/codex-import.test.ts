import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importCodexUsage } from "../src/codex/importer.js";
import { getHourlyFilePath, getSessionFilePath, readJson, readJsonl } from "../src/utils/storage.js";
import type { HourlyAggregate, QuotaState, SessionEntry } from "../src/types.js";

describe("Codex usage import", () => {
  let tempDir: string;
  let codexHome: string;
  let previousStorageDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-burningman-codex-"));
    codexHome = path.join(tempDir, ".codex");
    previousStorageDir = process.env.CLAUDE_USAGE_DIR;
    process.env.CLAUDE_USAGE_DIR = path.join(tempDir, ".token-burningman");
  });

  afterEach(() => {
    if (previousStorageDir === undefined) {
      delete process.env.CLAUDE_USAGE_DIR;
    } else {
      process.env.CLAUDE_USAGE_DIR = previousStorageDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeCodexSession(records: unknown[]): void {
    const sessionDir = path.join(codexHome, "sessions", "2026", "04", "29");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, "rollout-2026-04-29T12-00-00-019ddb78-c78a-7552-952c-3bea70359262.jsonl"),
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );
  }

  it("imports Codex token_count events into shared sessions and hourly aggregates", async () => {
    writeCodexSession([
      {
        timestamp: "2026-04-29T19:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "019ddb78-c78a-7552-952c-3bea70359262",
          cwd: "/Users/example/project-alpha",
        },
      },
      {
        timestamp: "2026-04-29T19:00:01.000Z",
        type: "turn_context",
        payload: {
          cwd: "/Users/example/project-alpha",
          model: "gpt-5.5",
        },
      },
      {
        timestamp: "2026-04-29T19:00:05.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 20,
              output_tokens: 10,
              reasoning_output_tokens: 5,
              total_tokens: 115,
            },
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 20,
              output_tokens: 10,
              reasoning_output_tokens: 5,
              total_tokens: 115,
            },
            model_context_window: 1000,
          },
          rate_limits: {
            primary: { used_percent: 10, window_minutes: 300, resets_at: 1777500000 },
            secondary: { used_percent: 20, window_minutes: 10080, resets_at: 1778000000 },
          },
        },
      },
      {
        timestamp: "2026-04-29T19:01:05.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 180,
              cached_input_tokens: 40,
              output_tokens: 25,
              reasoning_output_tokens: 7,
              total_tokens: 212,
            },
            last_token_usage: {
              input_tokens: 80,
              cached_input_tokens: 20,
              output_tokens: 15,
              reasoning_output_tokens: 2,
              total_tokens: 97,
            },
            model_context_window: 1000,
          },
          rate_limits: {
            primary: { used_percent: 12, window_minutes: 300, resets_at: 1777500000 },
            secondary: { used_percent: 21, window_minutes: 10080, resets_at: 1778000000 },
          },
        },
      },
    ]);

    const result = await importCodexUsage({ codexHome, report: false });

    expect(result.filesScanned).toBe(1);
    expect(result.entriesImported).toBe(2);
    expect(result.sessionsImported).toBe(1);
    expect(result.aggregated.processed).toBe(1);

    const session = readJsonl<SessionEntry>(getSessionFilePath("codex-019ddb78-c78"));
    expect(session).toHaveLength(2);
    expect(session[0]).toMatchObject({
      model: "gpt-5.5",
      proj: "project-alpha",
      tin: 100,
      tout: 15,
      ctx: 12,
    });
    expect(session[1]).toMatchObject({
      tin: 180,
      tout: 32,
      ctx: 21,
    });

    const hour = String(new Date("2026-04-29T19:00:05.000Z").getHours());
    const hourly = readJson<HourlyAggregate>(getHourlyFilePath("2026-04-29"), {});
    expect(hourly[hour]["gpt-5.5"].input).toBe(180);
    expect(hourly[hour]["gpt-5.5"].output).toBe(32);
    expect(hourly[hour]["gpt-5.5"].sessions).toEqual(["codex-019ddb78-c78"]);

    const quota = readJson<QuotaState>(path.join(process.env.CLAUDE_USAGE_DIR!, "quota", "state.json"), {
      lastFetchedAt: 0,
      five_hour: null,
      seven_day: null,
    });
    expect(quota.five_hour?.utilization).toBe(12);
    expect(quota.seven_day?.utilization).toBe(21);
  });

  it("is incremental and does not re-import unchanged Codex files", async () => {
    writeCodexSession([
      {
        timestamp: "2026-04-29T19:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "019ddb78-c78a-7552-952c-3bea70359262",
          cwd: "/Users/example/project-alpha",
        },
      },
      {
        timestamp: "2026-04-29T19:00:01.000Z",
        type: "turn_context",
        payload: { model: "gpt-5.5" },
      },
      {
        timestamp: "2026-04-29T19:00:05.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              output_tokens: 10,
              reasoning_output_tokens: 0,
              total_tokens: 110,
            },
            last_token_usage: {
              input_tokens: 100,
              output_tokens: 10,
              reasoning_output_tokens: 0,
              total_tokens: 110,
            },
            model_context_window: 1000,
          },
        },
      },
    ]);

    await importCodexUsage({ codexHome, report: false });
    const second = await importCodexUsage({ codexHome, report: false });

    expect(second.entriesImported).toBe(0);
    expect(second.sessionsImported).toBe(0);
  });
});
