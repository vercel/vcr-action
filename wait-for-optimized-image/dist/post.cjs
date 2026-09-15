"use strict";

// src/lib.ts
var DEFAULT_VERCEL_API = "https://api.vercel.com";
var VCR_APP_ID = "cl_inrfNy8noLlhRrGbPEm0z47woXNcJVZ0";
function buildRevokeBody(token) {
  return new URLSearchParams({
    client_id: VCR_APP_ID,
    token,
    token_type_hint: "access_token"
  });
}

// src/revoke.ts
async function revokeSavedToken() {
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

// src/wait-for-optimized-image/post.ts
revokeSavedToken();
