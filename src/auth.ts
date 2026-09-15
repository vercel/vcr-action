import * as core from "@actions/core";
import { VCR_POLICY_URL, buildExchangeBody } from "./lib";

export async function getAccessToken(options: {
  vercelApi: string;
  team: string;
  audience?: string;
  policy?: string;
}): Promise<string> {
  let githubOidcToken: string;
  try {
    githubOidcToken = await core.getIDToken(options.audience || undefined);
  } catch (error) {
    throw new Error(
      "Unable to request the GitHub OIDC token. " +
        'Add "permissions: id-token: write" to the job or workflow. ' +
        `(${error instanceof Error ? error.message : error})`,
    );
  }

  const url = `${options.vercelApi}/login/oauth/token`;
  const body = buildExchangeBody({ ...options, githubOidcToken });

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(1000 * attempt);
      continue;
    }

    if (response.ok) {
      const json = (await response.json().catch(() => ({}))) as {
        access_token?: string;
      };
      if (json.access_token) {
        return json.access_token;
      }
      lastError = "response did not include an access_token";
      break;
    }

    lastError = `HTTP ${response.status}: ${await response.text().catch(() => "")}`;
    if (response.status !== 429 && response.status < 500) {
      break;
    }
    await sleep(1000 * attempt);
  }

  throw new Error(
    "Token exchange with Vercel failed. Check that your team has an OIDC policy " +
      "that grants access to Vercel Container Registry and matches this " +
      `repository and workflow — create one at ${VCR_POLICY_URL} (${lastError})`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
