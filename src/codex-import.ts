import { importCodexUsage } from "./codex/importer.js";

async function main(): Promise<void> {
  const result = await importCodexUsage();
  process.stdout.write(
    [
      `Scanned ${result.filesScanned} Codex session file(s).`,
      `Imported ${result.entriesImported} token event(s) from ${result.sessionsImported} session(s).`,
      `Aggregated ${result.aggregated.processed} session file(s), ${result.aggregated.skipped} up-to-date.`,
      result.reported ? "Submitted community report to sfvibe.fun." : "No community report submitted.",
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`token-burningman Codex import failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
