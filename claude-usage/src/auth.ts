import * as https from "node:https";
import * as http from "node:http";
import type { Config } from "./types.js";
import { getConfigPath, writeJsonAtomic } from "./utils/storage.js";

/**
 * Make an HTTP/HTTPS request. Returns { statusCode, body }.
 */
function makeRequest(
  method: string,
  url: URL,
  body?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const port = url.port || (isHttps ? 443 : 80);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
      timeout: 10000,
    };

    const req = (transport as typeof https).request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body: data });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the CLI is authenticated (has a valid token in config).
 */
export function isAuthenticated(config: Config): boolean {
  return config.publicReporting?.cliToken !== null && config.publicReporting?.cliToken !== undefined;
}

/**
 * Authenticate the CLI via browser-based SIWE flow.
 *
 * 1. POST to /cli-auth/request -> get session_id and auth_url
 * 2. Open browser at auth_url
 * 3. Poll /cli-auth/status?session=<session_id> every 3 seconds, up to 100 attempts
 * 4. When status === "confirmed": save token to config, write config, return true
 * 5. On timeout: return false
 */
export async function authenticateCli(config: Config): Promise<boolean> {
  const serverUrl = config.publicReporting?.serverUrl || "https://sfvibe.fun/api/burningman";

  // Step 1: Request a new auth session
  let sessionId: string;
  let authUrl: string;

  try {
    const requestUrl = new URL(`${serverUrl}/cli-auth/request`);
    const { statusCode, body } = await makeRequest("POST", requestUrl, "{}");
    if (statusCode !== 200) {
      // Auth session request failed
      return false;
    }
    const parsed = JSON.parse(body);
    sessionId = parsed.session_id;
    // Build auth_url — use BURNINGMAN_FRONTEND_URL for local dev, otherwise derive from serverUrl
    const frontendUrl = process.env.BURNINGMAN_FRONTEND_URL || serverUrl.replace("/api/burningman", "");
    authUrl = `${frontendUrl}/burningman/auth?session=${sessionId}`;
  } catch {
    // Network error
    return false;
  }

  // Step 2: Open browser
  const { execFile } = await import("node:child_process");
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  // Validate URL protocol before opening to prevent command injection
  try {
    const parsed = new URL(authUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      execFile(cmd, [authUrl]);
    }
  } catch {
    // Invalid URL — don't open browser
  }

  // Step 3: Poll /cli-auth/status every 3 seconds, up to 100 attempts (~5 minutes)
  const maxAttempts = 100;
  const pollIntervalMs = 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);

    try {
      const statusUrl = new URL(`${serverUrl}/cli-auth/status`);
      statusUrl.searchParams.set("session", sessionId);
      const { statusCode, body } = await makeRequest("GET", statusUrl);

      if (statusCode === 200) {
        const parsed = JSON.parse(body);

        // Step 4: On confirmed, save token and return true
        if (parsed.status === "confirmed" && parsed.token) {
          config.publicReporting.cliToken = parsed.token;
          config.publicReporting.enabled = true;
          writeJsonAtomic(getConfigPath(), config);
          return true;
        }
        // status === "pending" — keep polling
      } else if (statusCode === 404) {
        // Session expired
        return false;
      }
    } catch {
      // Network error — continue polling
    }
  }

  // Step 5: Timeout
  return false;
}
