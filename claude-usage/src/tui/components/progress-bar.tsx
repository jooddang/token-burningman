import React from "react";
import { Box, Text } from "ink";

interface ProgressBarProps {
  value: number;
  max: number;
  width?: number;
  label?: string;
  showPercent?: boolean;
  thresholds?: { warn: number; danger: number };
}

export function ProgressBar({
  value,
  max,
  width = 20,
  label,
  showPercent = true,
  thresholds = { warn: 60, danger: 80 },
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;

  let color: string = "green";
  if (pct >= thresholds.danger) color = "red";
  else if (pct >= thresholds.warn) color = "yellow";

  return (
    <Box>
      {label && <Text dimColor>{label} </Text>}
      <Text>[</Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(empty)}</Text>
      <Text>]</Text>
      {showPercent && <Text> {Math.round(pct)}%</Text>}
    </Box>
  );
}
