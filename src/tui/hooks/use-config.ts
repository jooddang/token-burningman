import { useState, useEffect } from "react";
import type { Config } from "../../types.js";
import { DEFAULT_CONFIG } from "../../types.js";
import { readJson, getConfigPath } from "../../utils/storage.js";

export function useConfig(): Config {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);

  useEffect(() => {
    const loaded = readJson<Config>(getConfigPath(), DEFAULT_CONFIG);
    setConfig({ ...DEFAULT_CONFIG, ...loaded });
  }, []);

  return config;
}
