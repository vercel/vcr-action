export const DEFAULT_REGISTRY = "vcr.vercel.com";
export const DEFAULT_VERCEL_API = "https://api.vercel.com";

export const VCR_APP_ID = "cl_inrfNy8noLlhRrGbPEm0z47woXNcJVZ0";

export const VCR_POLICY_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fsettings%2Fbuild-and-deployment%3FaddOidcPolicy%3Dvcr&title=Add+a+VCR+OIDC+Policy";

export const ENGINES = ["docker", "podman", "buildah"] as const;
export type Engine = (typeof ENGINES)[number];

export const ENGINE_INSTALL_HINTS: Record<Engine, string> = {
  docker: "https://docs.docker.com/engine/install/",
  podman: "sudo apt-get install podman",
  buildah: "sudo apt-get install buildah",
};

export function buildExchangeBody(options: {
  team: string;
  githubOidcToken: string;
  policy?: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    client_id: VCR_APP_ID,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    team_id_or_slug: options.team,
    subject_token: options.githubOidcToken,
  });
  if (options.policy) {
    body.set("policy_id", options.policy);
  }
  return body;
}

export function buildRevokeBody(token: string): URLSearchParams {
  return new URLSearchParams({
    client_id: VCR_APP_ID,
    token,
    token_type_hint: "access_token",
  });
}

export function parseEnginesInput(input: string): Engine[] {
  const requested = [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((engine) => engine.trim().toLowerCase())
        .filter((engine) => engine.length > 0),
    ),
  ];
  if (requested.length === 0) {
    return ["docker"];
  }
  for (const engine of requested) {
    if (!(ENGINES as readonly string[]).includes(engine)) {
      throw new Error(
        `Unknown engine "${engine}" in the 'engines' input. Valid values: ${ENGINES.join(", ")}.`,
      );
    }
  }
  return requested as Engine[];
}

export function buildLoginArgs(options: {
  registry: string;
  team: string;
}): string[] {
  return [
    "login",
    "--username",
    options.team,
    "--password-stdin",
    options.registry,
  ];
}

export function serializeEngines(engines: readonly string[]): string {
  return engines.join(" ");
}

export function parseEngines(state: string | undefined): Engine[] {
  if (!state) {
    return [];
  }
  return state
    .split(/\s+/)
    .filter((engine): engine is Engine =>
      (ENGINES as readonly string[]).includes(engine),
    );
}
