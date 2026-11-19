import * as core from "@actions/core";
import { getAccessToken } from "../auth";
import { DEFAULT_VERCEL_API } from "../lib";
import { formatImageReference, resolveImageInputs } from "./inputs";
import { parseTimeoutSeconds, waitForOptimizedImage } from "./wait";

async function main(): Promise<void> {
  const target = resolveImageInputs({
    image: core.getInput("image"),
    team: core.getInput("team"),
    project: core.getInput("project"),
    repository: core.getInput("repository"),
    tag: core.getInput("tag"),
    digest: core.getInput("digest"),
  });
  const reference = formatImageReference(target);
  const timeoutSeconds = parseTimeoutSeconds(core.getInput("timeout-seconds"));
  const vercelApi = process.env.VERCEL_API_ORIGIN || DEFAULT_VERCEL_API;
  const token = await getAccessToken({
    vercelApi,
    team: target.team,
    audience: core.getInput("audience"),
    policy: core.getInput("policy"),
  });
  core.setSecret(token);
  core.saveState("accessToken", token);

  core.info(`Waiting up to ${timeoutSeconds}s for ${reference} to be optimized.`);
  const image = await waitForOptimizedImage({
    vercelApi,
    token,
    ...target,
    timeoutSeconds,
    onProgress: core.info,
  });

  core.setOutput("digest", image.manifestDigest);
  core.setOutput("image-id", image.imageId);
  core.info(`${reference} is optimized (${image.manifestDigest}).`);
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
