import React from "react";
import { Box, Text } from "ink";

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  maxWidth?: number;
  showValues?: boolean;
}

const FULL_BLOCK = "█";
const HALF_BLOCK = "▓";

export function BarChart({ data, maxWidth = 40, showValues = true }: BarChartProps) {
  if (data.length === 0) {
    return <Text dimColor>No data</Text>;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const maxLabelLen = Math.max(...data.map((d) => d.label.length));

  return (
    <Box flexDirection="column">
      {data.map((item, i) => {
        const barLen = Math.round((item.value / maxVal) * maxWidth);
        const bar = FULL_BLOCK.repeat(Math.max(barLen, 0));
        return (
          <Box key={i}>
            <Text dimColor>{item.label.padEnd(maxLabelLen + 1)}</Text>
            <Text color={item.color || "cyan"}>{bar}</Text>
            {showValues && (
              <Text dimColor> {item.value.toLocaleString()}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

interface StackedBarData {
  label: string;
  segments: { value: number; color: string; char?: string }[];
}

interface StackedBarChartProps {
  data: StackedBarData[];
  maxWidth?: number;
}

export function StackedBarChart({ data, maxWidth = 40 }: StackedBarChartProps) {
  if (data.length === 0) {
    return <Text dimColor>No data</Text>;
  }

  const maxTotal = Math.max(
    ...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)),
    1,
  );
  const maxLabelLen = Math.max(...data.map((d) => d.label.length));

  return (
    <Box flexDirection="column">
      {data.map((item, i) => {
        const total = item.segments.reduce((s, seg) => s + seg.value, 0);
        return (
          <Box key={i}>
            <Text dimColor>{item.label.padEnd(maxLabelLen + 1)}</Text>
            {item.segments.map((seg, j) => {
              const segLen = Math.round((seg.value / maxTotal) * maxWidth);
              const ch = seg.char || FULL_BLOCK;
              return (
                <Text key={j} color={seg.color}>
                  {ch.repeat(Math.max(segLen, 0))}
                </Text>
              );
            })}
            <Text dimColor> {total.toLocaleString()}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
