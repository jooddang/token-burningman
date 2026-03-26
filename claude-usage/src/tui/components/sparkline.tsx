import React from "react";
import { Box, Text } from "ink";

interface SparklineProps {
  data: number[];
  width?: number;
  color?: string;
  label?: string;
  formatValue?: (n: number) => string;
}

const BLOCKS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function Sparkline({
  data,
  width = 40,
  color = "cyan",
  label,
  formatValue,
}: SparklineProps) {
  if (data.length === 0) {
    return <Text dimColor>No data</Text>;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  // Resample data to fit width
  const resampled: number[] = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * data.length);
    resampled.push(data[Math.min(idx, data.length - 1)]);
  }

  const chars = resampled.map((v) => {
    const normalized = (v - min) / range;
    const idx = Math.round(normalized * (BLOCKS.length - 1));
    return BLOCKS[idx];
  });

  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const trend = lastVal > firstVal ? "▲" : lastVal < firstVal ? "▼" : "─";

  return (
    <Box flexDirection="column">
      {label && <Text dimColor>{label}</Text>}
      <Box>
        <Text color={color}>{chars.join("")}</Text>
        <Text dimColor>
          {" "}
          {formatValue ? formatValue(lastVal) : lastVal.toFixed(0)} {trend}
        </Text>
      </Box>
    </Box>
  );
}
