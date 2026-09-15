import { DEFAULT_VERCEL_API, buildRevokeBody } from "./lib";

export async function revokeSavedToken(): Promise<void> {
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
