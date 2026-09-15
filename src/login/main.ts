import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { which } from "@actions/io";
import { getAccessToken } from "../auth";
import {
  DEFAULT_REGISTRY,
  DEFAULT_VERCEL_API,
  ENGINE_INSTALL_HINTS,
  type Engine,
  buildLoginArgs,
  parseEnginesInput,
  serializeEngines,
} from "../lib";

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

  // ----- Validate container engines ------------------------------------------------
  const engines = parseEnginesInput(core.getInput("engines"));
  for (const engine of engines) {
    if (!(await which(engine, false))) {
      throw new Error(
        `Engine "${engine}" was requested but was not found on the PATH. ` +
          `Install it first (${ENGINE_INSTALL_HINTS[engine]}); ` +
          "GitHub-hosted Ubuntu runners include docker, podman, and buildah.",
      );
    }
  }
  core.info(`Logging in with: ${engines.join(", ")}.`);

  // ----- Authenticate ----------------------------------------------------------
  const vercelToken = await getAccessToken({
    vercelApi,
    team,
    audience,
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

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
