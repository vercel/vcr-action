import * as core from "@actions/core";
import { getAccessToken } from "../auth";
import { DEFAULT_VERCEL_API } from "../lib";
import { resolveImageInputs } from "./inputs";
import { parseTimeoutSeconds, waitForOptimizedImage } from "./wait";

async function main(): Promise<void> {
  const { team, project, repository, tag } = resolveImageInputs({
    image: core.getInput("image"),
    team: core.getInput("team"),
    project: core.getInput("project"),
    repository: core.getInput("repository"),
    tag: core.getInput("tag"),
  });
  const timeoutSeconds = parseTimeoutSeconds(core.getInput("timeout-seconds"));
  const vercelApi = process.env.VERCEL_API_ORIGIN || DEFAULT_VERCEL_API;
  const token = await getAccessToken({
    vercelApi,
    team,
    audience: core.getInput("audience"),
    policy: core.getInput("policy"),
  });
  core.setSecret(token);
  core.saveState("accessToken", token);

  core.info(`Waiting up to ${timeoutSeconds}s for ${repository}:${tag} to be optimized.`);
  const image = await waitForOptimizedImage({
    vercelApi,
    token,
    team,
    project,
    repository,
    tag,
    timeoutSeconds,
    onProgress: core.info,
  });

  core.setOutput("digest", image.manifestDigest);
  core.setOutput("image-id", image.imageId);
  core.info(`${repository}:${tag} is optimized (${image.manifestDigest}).`);
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
