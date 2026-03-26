import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { OverviewView } from "./views/overview.js";
import { SessionsView } from "./views/sessions.js";
import { ProjectsView } from "./views/projects.js";
import { TrendsView } from "./views/trends.js";
import { CommunityView } from "./views/community.js";

const VIEWS = [
  { key: "1", name: "Overview", component: OverviewView },
  { key: "2", name: "Projects", component: ProjectsView },
  { key: "3", name: "Sessions", component: SessionsView },
  { key: "4", name: "Trends", component: TrendsView },
  { key: "5", name: "Community", component: CommunityView },
] as const;

export function App() {
  const { exit } = useApp();
  const [activeView, setActiveView] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useInput(
    useCallback(
      (input: string) => {
        if (input === "q") {
          exit();
          return;
        }
        if (input === "r") {
          setRefreshKey((k) => k + 1);
          return;
        }
        const viewIdx = parseInt(input) - 1;
        if (viewIdx >= 0 && viewIdx < VIEWS.length) {
          setActiveView(viewIdx);
        }
      },
      [exit],
    ),
  );

  const current = VIEWS[activeView];
  const ViewComponent = current.component;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box
        borderStyle="double"
        borderColor="gray"
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold color="cyan">
          token-burningman v0.1.0
        </Text>
        <Text dimColor>
          {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" minHeight={20}>
        {ViewComponent ? (
          <ViewComponent key={refreshKey} />
        ) : (
          <Box paddingX={2} paddingY={2}>
            <Text dimColor>
              {current.name} — Coming in Phase 2/3. Press 1 or 3 for available
              views.
            </Text>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        {VIEWS.map((v, i) => (
          <React.Fragment key={v.key}>
            {i > 0 && <Text> </Text>}
            {i === activeView ? (
              <Text bold color="cyan">
                [{v.key}]{v.name}
              </Text>
            ) : (
              <Text dimColor>
                [{v.key}]{v.name}
              </Text>
            )}
          </React.Fragment>
        ))}
        <Text>  </Text>
        <Text dimColor>[q]Quit [r]Refresh [?]Help</Text>
      </Box>
    </Box>
  );
}
