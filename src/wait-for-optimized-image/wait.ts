const POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

interface VcrTag {
  imageId: string;
  manifestDigest: string;
  kind: string;
  status: string | null;
}

interface WaitOptions {
  vercelApi: string;
  token: string;
  team: string;
  project: string;
  repository: string;
  tag: string;
  timeoutSeconds: number;
  onProgress: (message: string) => void;
}

export function parseTimeoutSeconds(input: string): number {
  const seconds = Number(input || "300");
  if (!Number.isSafeInteger(seconds * 1_000) || !Number.isInteger(seconds) || seconds <= 0) {
    throw new Error("The 'timeout-seconds' input must be a positive whole number of seconds.");
  }
  return seconds;
}

export async function waitForOptimizedImage(options: WaitOptions): Promise<VcrTag> {
  const url = new URL(
    `/v1/vcr/repository/${encodeURIComponent(options.repository)}/tags/${encodeURIComponent(options.tag)}`,
    options.vercelApi,
  );
  url.searchParams.set("projectId", options.project);
  url.searchParams.set(options.team.startsWith("team_") ? "teamId" : "slug", options.team);

  const reference = `${options.repository}:${options.tag}`;
  const deadline = Date.now() + options.timeoutSeconds * 1_000;
  let lastStatus = "not checked";
  let digest: string | undefined;

  while (Date.now() < deadline) {
    const result = await getTag(url, options.token, deadline - Date.now());
    if ("retry" in result) {
      lastStatus = result.retry;
    } else {
      const image = result.tag;
      lastStatus = `status=${JSON.stringify(image.status)}`;

      if (digest && image.manifestDigest !== digest) {
        throw new Error(
          `Tag ${reference} changed from ${digest} to ${image.manifestDigest} while waiting. ` +
            "Use a unique tag for each build so the image being promoted is the one that was checked.",
        );
      }
      digest = image.manifestDigest;

      if (image.kind === "index" || image.status === null) {
        throw new Error(
          `Image ${reference} has no optimization status (kind=${image.kind}). ` +
            "Push a single-platform linux/amd64 image, with provenance and SBOM attestations disabled " +
            "(--provenance=false --sbom=false), instead of an image index.",
        );
      }

      switch (image.status) {
        case "ready":
          if (Date.now() < deadline) {
            return image;
          }
          break;
        case "preparing":
          break;
        case "unoptimized":
          throw new Error(
            `Image ${reference} is unoptimized and cannot be optimized by VCR. ` +
              "Build and push a single-platform linux/amd64 image.",
          );
        default:
          throw new Error(`Image ${reference} has an unexpected optimization status: ${JSON.stringify(image.status)}.`);
      }
    }

    options.onProgress(`${reference}: ${lastStatus}; waiting for optimization.`);
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)));
    }
  }

  throw new Error(
    `Timed out after ${options.timeoutSeconds}s waiting for ${reference} to be optimized. ` +
      `Last observation: ${lastStatus}.`,
  );
}

async function getTag(
  url: URL,
  token: string,
  remainingMs: number,
): Promise<{ tag: VcrTag } | { retry: string }> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, remainingMs))),
    });
    if (response.ok) {
      body = await response.json();
    } else {
      await response.body?.cancel();
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("VCR returned invalid JSON while checking image optimization.");
    }
    return { retry: `request failed (${error instanceof Error ? error.message : String(error)})` };
  }

  if (response.ok) {
    return { tag: parseTag(body) };
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `VCR status request failed (HTTP ${response.status}). ` +
        "Check that the token is valid and has Container Registry read access to the specified team and project.",
    );
  }
  if (response.status === 404) {
    return { retry: "image tag not found (HTTP 404); check the team, project, repository, and tag if this persists" };
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return { retry: `VCR status request failed (HTTP ${response.status})` };
  }
  throw new Error(`VCR status request failed (HTTP ${response.status}).`);
}

function parseTag(body: unknown): VcrTag {
  const tag = body && typeof body === "object" && "tag" in body ? body.tag : undefined;
  if (
    !tag || typeof tag !== "object" ||
    !("imageId" in tag) || typeof tag.imageId !== "string" || !tag.imageId ||
    !("manifestDigest" in tag) || typeof tag.manifestDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(tag.manifestDigest) ||
    !("kind" in tag) || typeof tag.kind !== "string" ||
    !("status" in tag) || (tag.status !== null && typeof tag.status !== "string")
  ) {
    throw new Error("VCR returned an invalid tag response while checking image optimization.");
  }
  return {
    imageId: tag.imageId,
    manifestDigest: tag.manifestDigest,
    kind: tag.kind,
    status: tag.status,
  };
}
