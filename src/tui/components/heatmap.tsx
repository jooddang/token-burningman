import React from "react";
import { Box, Text } from "ink";
import type { HeatmapCell } from "../../types.js";

interface HeatmapProps {
  data: HeatmapCell[];
  label?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];
const INTENSITIES = [" . ", " ░ ", " ▓ ", " █ "];

function getIntensity(value: number, max: number): string {
  if (value === 0 || max === 0) return INTENSITIES[0];
  const ratio = value / max;
  if (ratio < 0.25) return INTENSITIES[1];
  if (ratio < 0.6) return INTENSITIES[2];
  return INTENSITIES[3];
}

function getIntensityColor(value: number, max: number): string {
  if (value === 0 || max === 0) return "gray";
  const ratio = value / max;
  if (ratio < 0.25) return "gray";
  if (ratio < 0.6) return "yellow";
  return "green";
}

export function Heatmap({ data, label }: HeatmapProps) {
  if (data.length === 0) {
    return <Text dimColor>No data</Text>;
  }

  const max = Math.max(...data.map((c) => c.value), 1);

  // Build grid: day (rows) × hour (cols, grouped by 3)
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array(8).fill(0),
  );

  for (const cell of data) {
    const colIdx = Math.floor(cell.hour / 3);
    grid[cell.day][colIdx] += cell.value;
  }

  const gridMax = Math.max(...grid.flat(), 1);

  return (
    <Box flexDirection="column">
      {label && <Text bold>{label}</Text>}
      {/* Hour labels */}
      <Box>
        <Text dimColor>{"     "}</Text>
        {HOUR_LABELS.map((h) => (
          <Text key={h} dimColor>
            {String(h).padStart(2)}
            {" "}
          </Text>
        ))}
      </Box>
      {/* Rows: Mon-Sun (reorder so Mon=first) */}
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <Box key={day}>
          <Text dimColor>{DAY_LABELS[day]} </Text>
          {grid[day].map((val, col) => (
            <Text key={col} color={getIntensityColor(val, gridMax)}>
              {getIntensity(val, gridMax)}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
