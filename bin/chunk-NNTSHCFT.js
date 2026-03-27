#!/usr/bin/env node
import {
  getConfigPath,
  writeJsonAtomic
} from "./chunk-6RWSJQBF.js";

// src/auth.ts
import * as https from "https";
import * as http from "http";
function makeRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const port = url.port || (isHttps ? 443 : 80);
    const options = {
      hostname: url.hostname,
      port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...body ? { "Content-Length": Buffer.byteLength(body) } : {}
      },
      ...isHttps ? { rejectUnauthorized: true } : {},
      timeout: 1e4
    };
    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body: data });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isAuthenticated(config) {
  return config.publicReporting?.cliToken !== null && config.publicReporting?.cliToken !== void 0;
}
async function authenticateCli(config) {
  const serverUrl = config.publicReporting?.serverUrl || "https://sfvibe.fun/api/burningman";
  let sessionId;
  let authUrl;
  try {
    const requestUrl = new URL(`${serverUrl}/cli-auth/request`);
    const { statusCode, body } = await makeRequest("POST", requestUrl, "{}");
    if (statusCode !== 200) {
      return false;
    }
    const parsed = JSON.parse(body);
    sessionId = parsed.session_id;
    const frontendUrl = process.env.BURNINGMAN_FRONTEND_URL || serverUrl.replace("/api/burningman", "");
    authUrl = `${frontendUrl}/burningman/auth?session=${sessionId}`;
  } catch {
    return false;
  }
  const { execFile } = await import("child_process");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const parsed = new URL(authUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      execFile(cmd, [authUrl]);
    }
  } catch {
  }
  const maxAttempts = 100;
  const pollIntervalMs = 3e3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);
    try {
      const statusUrl = new URL(`${serverUrl}/cli-auth/status`);
      statusUrl.searchParams.set("session", sessionId);
      const { statusCode, body } = await makeRequest("GET", statusUrl);
      if (statusCode === 200) {
        const parsed = JSON.parse(body);
        if (parsed.status === "confirmed" && parsed.token) {
          config.publicReporting.cliToken = parsed.token;
          config.publicReporting.enabled = true;
          writeJsonAtomic(getConfigPath(), config);
          return true;
        }
      } else if (statusCode === 404) {
        return false;
      }
    } catch {
    }
  }
  return false;
}

export {
  isAuthenticated,
  authenticateCli
};
