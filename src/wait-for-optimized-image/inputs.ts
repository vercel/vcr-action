import { DEFAULT_REGISTRY } from "../lib";

export type ImageTarget = {
  team: string;
  project: string;
  repository: string;
} & ({ tag: string; digest?: undefined } | { digest: string; tag?: undefined });

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const REPOSITORY_PATTERN = /^[a-z0-9]+(?:(?:\.|_|__|-+)[a-z0-9]+)*$/;
const TAG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function formatImageReference(target: ImageTarget): string {
  return target.digest === undefined
    ? `${target.repository}:${target.tag}`
    : `${target.repository}@${target.digest}`;
}

export function resolveImageInputs(
  inputs: Partial<Record<"image" | "team" | "project" | "repository" | "tag" | "digest", string>>,
): ImageTarget {
  const image = inputs.image?.trim();
  const manual = {
    team: inputs.team?.trim() || "",
    project: inputs.project?.trim() || "",
    repository: inputs.repository?.trim() || "",
    tag: inputs.tag?.trim() || "",
  };
  const digest = inputs.digest?.trim() || "";
  const supplied = Object.entries(manual).filter(([, value]) => value);

  if (image) {
    if (supplied.length > 0 || digest) {
      throw new Error(
        "The 'image' input is mutually exclusive with 'team', 'project', " +
          "'repository', 'tag', and 'digest'. Provide only one input mode.",
      );
    }
    return parseImageReference(image);
  }

  if (digest && manual.tag) {
    throw new Error("Provide either 'tag' or 'digest', not both.");
  }
  if (digest && !DIGEST_PATTERN.test(digest)) {
    throw new Error("The 'digest' input must be in the form sha256:<64 hex characters>.");
  }
  const missing = Object.entries(manual)
    .filter(([name, value]) => !value && !(digest && name === "tag"))
    .map(([name]) => `'${name}'`);
  if (missing.length > 0) {
    throw new Error(
      "Provide either 'image' or all of 'team', 'project', 'repository', and 'tag'. " +
        `Missing manual inputs: ${missing.join(", ")}.`,
    );
  }
  const { tag, ...target } = manual;
  return digest ? { ...target, digest } : manual;
}

function parseImageReference(image: string): ImageTarget {
  const [registry, team, project, reference, ...extra] = image.split("/");
  const [name, digest, ...extraDigestParts] = (reference || "").split("@");
  const [repository, tag, ...extraTagParts] = name.split(":");
  if (
    registry !== DEFAULT_REGISTRY ||
    !team || !SLUG_PATTERN.test(team) ||
    !project || !SLUG_PATTERN.test(project) ||
    !repository || !REPOSITORY_PATTERN.test(repository) ||
    (digest === undefined ? !tag || !TAG_PATTERN.test(tag) : tag !== undefined || !DIGEST_PATTERN.test(digest)) ||
    `${team}/${project}/${repository}`.length > 255 ||
    extra.length > 0 || extraTagParts.length > 0 || extraDigestParts.length > 0
  ) {
    throw new Error(
      `The 'image' input must be a tagged VCR image in the form ` +
        `${DEFAULT_REGISTRY}/<team-slug>/<project-slug>/<repository>:<tag>, ` +
        "or the same form with @sha256:<digest> in place of the tag.",
    );
  }
  return digest === undefined ? { team, project, repository, tag } : { team, project, repository, digest };
}
