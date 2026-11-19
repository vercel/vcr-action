import type { ImageTarget } from "./inputs";

const POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

interface VcrImage {
  imageId: string;
  manifestDigest: string;
  kind: string;
  status: string | null;
}

type WaitOptions = ImageTarget & {
  vercelApi: string;
  token: string;
  timeoutSeconds: number;
  onProgress: (message: string) => void;
};

export function parseTimeoutSeconds(input: string): number {
  const seconds = Number(input || "300");
  if (!Number.isSafeInteger(seconds * 1_000) || !Number.isInteger(seconds) || seconds <= 0) {
    throw new Error("The 'timeout-seconds' input must be a positive whole number of seconds.");
  }
  return seconds;
}

export async function waitForOptimizedImage(options: WaitOptions): Promise<VcrImage> {
  const lookup = options.digest === undefined ? "tag" : "image";
  const url = new URL(
    `/v1/vcr/repository/${encodeURIComponent(options.repository)}/` +
      (options.digest === undefined
        ? `tags/${encodeURIComponent(options.tag)}`
        : `images/${encodeURIComponent(options.digest)}`),
    options.vercelApi,
  );
  url.searchParams.set("projectId", options.project);
  url.searchParams.set(options.team.startsWith("team_") ? "teamId" : "slug", options.team);

  const reference =
    options.digest === undefined
      ? `${options.repository}:${options.tag}`
      : `${options.repository}@${options.digest}`;
  const deadline = Date.now() + options.timeoutSeconds * 1_000;
  let lastStatus = "not checked";
  let digest: string | undefined;

  while (Date.now() < deadline) {
    const result = await getImage(url, options.token, deadline - Date.now(), lookup);
    if ("retry" in result) {
      lastStatus = result.retry;
    } else {
      const image = result.image;
      lastStatus = `status=${JSON.stringify(image.status)}`;

      if (digest && image.manifestDigest !== digest) {
        throw new Error(
          `Tag ${reference} changed from ${digest} to ${image.manifestDigest} while waiting. ` +
            "Use a unique tag for each build so the image being promoted is the one that was checked.",
        );
      }
      digest = image.manifestDigest;

      if (image.kind === "attestation") {
        throw new Error(
          `Image ${reference} is a build attestation, which VCR never optimizes. ` +
            "Pass the digest of a platform image instead.",
        );
      }
      if (image.kind === "index" || image.status === null) {
        throw new Error(
          `Image ${reference} has no optimization status (kind=${image.kind}). ` +
            "Wait for each platform image in an image index by digest, or push a single-platform " +
            "linux/amd64 image, with provenance and SBOM attestations disabled " +
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

async function getImage(
  url: URL,
  token: string,
  remainingMs: number,
  lookup: "tag" | "image",
): Promise<{ image: VcrImage } | { retry: string }> {
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
    return { image: parseImage(body, lookup) };
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `VCR status request failed (HTTP ${response.status}). ` +
        "Check that the token is valid and has Container Registry read access to the specified team and project.",
    );
  }
  if (response.status === 404) {
    return {
      retry:
        lookup === "tag"
          ? "image tag not found (HTTP 404); check the team, project, repository, and tag if this persists"
          : "image not found (HTTP 404); check the team, project, repository, and digest if this persists",
    };
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return { retry: `VCR status request failed (HTTP ${response.status})` };
  }
  throw new Error(`VCR status request failed (HTTP ${response.status}).`);
}

function parseImage(body: unknown, lookup: "tag" | "image"): VcrImage {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>)[lookup] : undefined;
  const { manifestDigest, kind, status, imageId, id } =
    record && typeof record === "object" ? (record as Record<string, unknown>) : {};
  const identifier = lookup === "tag" ? imageId : id;
  if (
    typeof identifier !== "string" || !identifier ||
    typeof manifestDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(manifestDigest) ||
    typeof kind !== "string" ||
    (status !== null && typeof status !== "string")
  ) {
    throw new Error(`VCR returned an invalid ${lookup} response while checking image optimization.`);
  }
  return { imageId: identifier, manifestDigest, kind, status };
}
