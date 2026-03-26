import React from "react";
import { Box, Text } from "ink";

interface Column {
  key: string;
  label: string;
  width: number;
  align?: "left" | "right";
  color?: string;
}

interface TableProps {
  columns: Column[];
  data: Record<string, string>[];
  maxRows?: number;
}

function padCell(text: string, width: number, align: "left" | "right" = "left"): string {
  const truncated = text.length > width ? text.slice(0, width - 1) + "…" : text;
  return align === "right" ? truncated.padStart(width) : truncated.padEnd(width);
}

export function Table({ columns, data, maxRows }: TableProps) {
  const rows = maxRows ? data.slice(0, maxRows) : data;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map((col, i) => (
          <Text key={i} bold dimColor>
            {padCell(col.label, col.width, col.align)}{" "}
          </Text>
        ))}
      </Box>
      {/* Separator */}
      <Text dimColor>
        {columns.map((col) => "─".repeat(col.width)).join("─")}
      </Text>
      {/* Rows */}
      {rows.length === 0 ? (
        <Text dimColor>  No data yet</Text>
      ) : (
        rows.map((row, i) => (
          <Box key={i}>
            {columns.map((col, j) => (
              <Text key={j} color={col.color}>
                {padCell(row[col.key] || "", col.width, col.align)}{" "}
              </Text>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}
