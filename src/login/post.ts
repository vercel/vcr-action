import { spawnSync } from "node:child_process";
import { DEFAULT_VERCEL_API, buildRevokeBody, parseEngines } from "../lib";

async function post(): Promise<void> {
  const logout = (process.env.INPUT_LOGOUT || "true").trim().toLowerCase();
  const registry = process.env.STATE_loggedInRegistry;
  const engines = parseEngines(process.env.STATE_loggedInEngines);
  if (registry && logout !== "false") {
    for (const engine of engines) {
      const result = spawnSync(engine, ["logout", registry], { stdio: "inherit" });
      if (result.status !== 0) {
        console.log(`${engine} logout ${registry} failed (already logged out?).`);
      }
    }
  }

  const token = process.env.STATE_accessToken;
  if (!token) {
    return;
  }
  console.log(`::add-mask::${token}`);

  const vercelApi = process.env.VERCEL_API_ORIGIN || DEFAULT_VERCEL_API;
  try {
    const response = await fetch(`${vercelApi}/login/oauth/token/revoke`, {
      method: "POST",
      body: buildRevokeBody(token),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.log(
        `::warning::Failed to revoke the Vercel access token (HTTP ${response.status}). It will remain valid until it expires.`,
      );
      return;
    }
    console.log("Revoked the Vercel access token.");
  } catch (error) {
    console.log(
      `::warning::Failed to revoke the Vercel access token (${error instanceof Error ? error.message : error}). It will remain valid until it expires.`,
    );
  }
}

post();
