import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractEntry, formatStatusline, schemaDriftWarning } from "../src/collector.js";
import { readQuotaState, updateQuotaStateFromStatusline } from "../src/quota.js";
import { DEFAULT_CONFIG, type StatuslineInput } from "../src/types.js";

// Real statusline payload shape as of Claude Code v2.1.215
// (code.claude.com/docs/en/statusline).
function makePayload(): StatuslineInput {
  return {
    hook_event_name: "Status",
    session_id: "abc123def456-full-session-id",
    cwd: "/Users/dev/my-project",
    model: { id: "claude-fable-5", display_name: "Fable 5" },
    workspace: {
      current_dir: "/Users/dev/my-project/src",
      project_dir: "/Users/dev/my-project",
    },
    cost: {
      total_cost_usd: 1.2345,
      total_lines_added: 42,
      total_lines_removed: 7,
    },
    context_window: {
      used_percentage: 8,
      remaining_percentage: 92,
      context_window_size: 200000,
      current_usage: {
        input_tokens: 8500,
        output_tokens: 1200,
        cache_read_input_tokens: 100000,
        cache_creation_input_tokens: 5000,
      },
      total_input_tokens: 15500,
      total_output_tokens: 1200,
    },
    version: "2.1.215",
  };
}

describe("collector statusline parsing", () => {
  let tempDir: string;
  let previousStorageDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-burningman-collector-"));
    previousStorageDir = process.env.CLAUDE_USAGE_DIR;
    process.env.CLAUDE_USAGE_DIR = tempDir;
  });

  afterEach(() => {
    if (previousStorageDir === undefined) {
      delete process.env.CLAUDE_USAGE_DIR;
    } else {
      process.env.CLAUDE_USAGE_DIR = previousStorageDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("maps the v2.1.215 payload into a session entry", () => {
    const entry = extractEntry(makePayload());

    expect(entry.sid).toBe("abc123def456");
    expect(entry.model).toBe("claude-fable-5");
    expect(entry.proj).toBe("my-project");
    expect(entry.in).toBe(8500);
    expect(entry.out).toBe(1200);
    expect(entry.cr).toBe(100000);
    expect(entry.cc).toBe(5000);
    expect(entry.tin).toBe(15500);
    expect(entry.tout).toBe(1200);
    expect(entry.ctx).toBe(8);
    expect(entry.ctxMax).toBe(200000);
    expect(entry.cost).toBe(1.2345);
    expect(entry.la).toBe(42);
    expect(entry.lr).toBe(7);
  });

  it("records zeros for current usage when current_usage is null (post-/compact)", () => {
    const payload = makePayload();
    payload.context_window.current_usage = null;

    const entry = extractEntry(payload);

    expect(entry.in).toBe(0);
    expect(entry.out).toBe(0);
    expect(entry.cr).toBe(0);
    expect(entry.cc).toBe(0);
    expect(entry.tin).toBe(15500);
  });

  it("renders cost and context in the full format", () => {
    const line = formatStatusline(extractEntry(makePayload()), DEFAULT_CONFIG);

    expect(line).toContain("$1.23");
    expect(line).toContain("8% ctx");
    expect(line).toContain("+42/-7");
  });

  it("persists official rate_limits into the quota state", () => {
    updateQuotaStateFromStatusline({
      five_hour: { used_percentage: 23.5, resets_at: 1784550000 },
      seven_day: { used_percentage: 41, resets_at: 1784900000 },
    });

    const state = readQuotaState();
    expect(state.five_hour?.utilization).toBe(23.5);
    expect(state.five_hour?.resets_at).toBe(new Date(1784550000 * 1000).toISOString());
    expect(state.seven_day?.utilization).toBe(41);
  });

  it("renders a genuine sub-1% utilization as ~1%, not scaled x100", () => {
    updateQuotaStateFromStatusline({
      five_hour: { used_percentage: 1, resets_at: 1784550000 },
      seven_day: { used_percentage: 0.5, resets_at: 1784900000 },
    });

    const line = formatStatusline(extractEntry(makePayload()), DEFAULT_CONFIG);

    expect(line).toContain("5h:");
    expect(line).toContain("1%");
    expect(line).not.toContain("100%");
    expect(line).not.toContain("50%");
    expect(line).not.toContain("⚠");
  });

  it("preserves the previous window when one rate-limit window is absent", () => {
    updateQuotaStateFromStatusline({
      five_hour: { used_percentage: 10, resets_at: 1784550000 },
      seven_day: { used_percentage: 40, resets_at: 1784900000 },
    });
    updateQuotaStateFromStatusline({
      five_hour: { used_percentage: 12, resets_at: 1784550000 },
    });

    const state = readQuotaState();
    expect(state.five_hour?.utilization).toBe(12);
    expect(state.seven_day?.utilization).toBe(40);
  });

  it("does not touch quota state when rate_limits is absent", () => {
    updateQuotaStateFromStatusline(undefined);
    expect(readQuotaState().five_hour).toBeNull();
  });

  it("renders fast mode and effort level in the full format", () => {
    const line = formatStatusline(extractEntry(makePayload()), DEFAULT_CONFIG, {
      effortLevel: "high",
      fastMode: true,
    });

    expect(line).toContain("⚡");
    expect(line).toContain("eff:high");
  });

  it("does not flag a complete payload as schema drift", () => {
    expect(schemaDriftWarning(makePayload())).toBeNull();
  });

  it("flags a dropped current_usage key as drift while accepting explicit null", () => {
    const payload = makePayload();
    payload.context_window.current_usage = null;
    expect(schemaDriftWarning(payload)).toBeNull();

    delete (payload.context_window as Partial<StatuslineInput["context_window"]>).current_usage;

    const warning = schemaDriftWarning(payload);

    expect(warning).toContain("context_window.current_usage");
  });

  it("flags missing context_window and cost sections loudly", () => {
    const payload = makePayload() as Partial<StatuslineInput>;
    delete payload.context_window;
    delete payload.cost;

    const warning = schemaDriftWarning(payload as StatuslineInput);

    expect(warning).toContain("context_window");
    expect(warning).toContain("cost");
    expect(warning).toContain("schema");
  });
});
