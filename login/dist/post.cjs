"use strict";

// src/login/post.ts
var import_node_child_process = require("node:child_process");

// src/lib.ts
var DEFAULT_VERCEL_API = "https://api.vercel.com";
var VCR_APP_ID = "cl_inrfNy8noLlhRrGbPEm0z47woXNcJVZ0";
var ENGINES = ["docker", "podman", "buildah"];
function buildRevokeBody(token) {
  return new URLSearchParams({
    client_id: VCR_APP_ID,
    token,
    token_type_hint: "access_token"
  });
}
function parseEngines(state) {
  if (!state) {
    return [];
  }
  return state.split(/\s+/).filter(
    (engine) => ENGINES.includes(engine)
  );
}

// src/login/post.ts
async function post() {
  const logout = (process.env.INPUT_LOGOUT || "true").trim().toLowerCase();
  const registry = process.env.STATE_loggedInRegistry;
  const engines = parseEngines(process.env.STATE_loggedInEngines);
  if (registry && logout !== "false") {
    for (const engine of engines) {
      const result = (0, import_node_child_process.spawnSync)(engine, ["logout", registry], { stdio: "inherit" });
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
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      console.log(
        `::warning::Failed to revoke the Vercel access token (HTTP ${response.status}). It will remain valid until it expires.`
      );
      return;
    }
    console.log("Revoked the Vercel access token.");
  } catch (error) {
    console.log(
      `::warning::Failed to revoke the Vercel access token (${error instanceof Error ? error.message : error}). It will remain valid until it expires.`
    );
  }
}
post();
