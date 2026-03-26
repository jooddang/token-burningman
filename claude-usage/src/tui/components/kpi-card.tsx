import React from "react";
import { Box, Text } from "ink";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  width?: number;
}

export function KpiCard({ label, value, sub, color, width }: KpiCardProps) {
  return (
    <Box
      flexDirection="column"
      width={width || 18}
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
    >
      <Text dimColor>{label}</Text>
      <Text bold color={color || "white"}>
        {value}
      </Text>
      {sub && <Text dimColor>{sub}</Text>}
    </Box>
  );
}
