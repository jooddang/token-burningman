import type { SessionEntry, DeltaEntry } from "../types.js";

export function computeDelta(
  current: SessionEntry,
  previous: SessionEntry | null,
): DeltaEntry {
  if (previous === null) {
    // First entry: use absolute cumulative values as delta
    return {
      t: current.t,
      sid: current.sid,
      model: current.model,
      proj: current.proj,
      inputDelta: current.tin,
      outputDelta: current.tout,
      costDelta: current.cost,
      lineAddedDelta: current.la,
      lineRemovedDelta: current.lr,
      in: current.in,
      out: current.out,
      cr: current.cr,
      cc: current.cc,
      ctx: current.ctx,
      ctxMax: current.ctxMax,
    };
  }

  let inputDelta = current.tin - previous.tin;
  let outputDelta = current.tout - previous.tout;
  let costDelta = current.cost - previous.cost;
  let lineAddedDelta = current.la - previous.la;
  let lineRemovedDelta = current.lr - previous.lr;

  // Negative delta = session reset (compact, /clear, new context)
  // Treat current values as new baseline
  if (inputDelta < 0 || outputDelta < 0) {
    inputDelta = current.tin;
    outputDelta = current.tout;
    costDelta = current.cost;
    lineAddedDelta = current.la;
    lineRemovedDelta = current.lr;
  }

  return {
    t: current.t,
    sid: current.sid,
    model: current.model,
    proj: current.proj,
    inputDelta,
    outputDelta,
    costDelta,
    lineAddedDelta,
    lineRemovedDelta,
    in: current.in,
    out: current.out,
    cr: current.cr,
    cc: current.cc,
    ctx: current.ctx,
    ctxMax: current.ctxMax,
  };
}

export function computeAllDeltas(entries: SessionEntry[]): DeltaEntry[] {
  if (entries.length === 0) return [];
  const deltas: DeltaEntry[] = [];
  deltas.push(computeDelta(entries[0], null));
  for (let i = 1; i < entries.length; i++) {
    deltas.push(computeDelta(entries[i], entries[i - 1]));
  }
  return deltas;
}
