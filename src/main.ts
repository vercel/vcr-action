import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { which } from "@actions/io";
import {
  DEFAULT_REGISTRY,
  DEFAULT_VERCEL_API,
  ENGINES,
  type Engine,
  buildExchangeBody,
  buildLoginArgs,
  serializeEngines,
} from "./lib";

async function main(): Promise<void> {
  // ----- Inputs --------------------------------------------------------------
  const team = core.getInput("team", { required: true });
  const registry = core.getInput("registry") || DEFAULT_REGISTRY;
  const revoke = core.getBooleanInput("revoke");
  const audience = core.getInput("audience");
  const policy = core.getInput("policy");
  const vercelApi = process.env.VERCEL_API_ORIGIN || DEFAULT_VERCEL_API;

  if (!team.startsWith("team_")) {
    core.warning(
      `The 'team' input ("${team}") does not look like a Vercel team ID ` +
        "(team_xxxxxxxx). The registry login requires the team ID, not the slug.",
    );
  }

  // ----- Detect container engines ------------------------------------------------
  const engines: Engine[] = [];
  for (const engine of ENGINES) {
    if (await which(engine, false)) {
      engines.push(engine);
    }
  }
  if (engines.length === 0) {
    throw new Error(
      "No container engine found. Install docker, podman, or buildah.",
    );
  }
  core.info(`Detected container engine(s): ${engines.join(", ")}.`);

  // ----- Authenticate ----------------------------------------------------------
  let githubOidcToken: string;
  try {
    githubOidcToken = await core.getIDToken(audience || undefined);
  } catch (error) {
    throw new Error(
      "Unable to request the GitHub OIDC token. " +
        'Add "permissions: id-token: write" to the job or workflow. ' +
        `(${error instanceof Error ? error.message : error})`,
    );
  }

  const vercelToken = await exchangeToken({
    vercelApi,
    team,
    githubOidcToken,
    policy,
  });
  core.setSecret(vercelToken);
  if (revoke) {
    core.saveState("accessToken", vercelToken);
  } else {
    core.info(
      "Revocation is disabled; the access token will remain valid until it expires.",
    );
  }

  // ----- Log in ------------------------------------------------------------------
  const loggedIn: Engine[] = [];
  core.saveState("loggedInRegistry", registry);
  for (const engine of engines) {
    await core.group(`Logging in to ${registry} with ${engine} as ${team}`, async () => {
      await exec(engine, buildLoginArgs({ registry, team }), {
        input: Buffer.from(vercelToken),
      });
    });
    loggedIn.push(engine);
    core.saveState("loggedInEngines", serializeEngines(loggedIn));
  }

  // ----- Outputs -------------------------------------------------------------------
  core.setOutput("registry", registry);
  core.setOutput("engines", loggedIn.join("\n"));
  core.info(`Logged in to ${registry} with ${loggedIn.join(", ")}.`);
}

async function exchangeToken(options: {
  vercelApi: string;
  team: string;
  githubOidcToken: string;
  policy?: string;
}): Promise<string> {
  const url = `${options.vercelApi}/login/oauth/token`;
  const body = buildExchangeBody(options);

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
      `that grants access to the Vercel Container Registry and matches this ` +
      `repository and workflow. (${lastError})`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
