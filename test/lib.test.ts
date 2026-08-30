import { describe, expect, it } from "vitest";
import {
  VCR_APP_ID,
  buildExchangeBody,
  buildLoginArgs,
  buildRevokeBody,
  parseEngines,
  parseEnginesInput,
  serializeEngines,
} from "../src/lib";

describe("buildExchangeBody", () => {
  it("builds the RFC 8693 token-exchange body", () => {
    const body = buildExchangeBody({
      team: "team_123",
      githubOidcToken: "gh-jwt",
    });
    expect(body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:token-exchange",
    );
    expect(body.get("client_id")).toBe(VCR_APP_ID);
    expect(body.get("subject_token_type")).toBe(
      "urn:ietf:params:oauth:token-type:id_token",
    );
    expect(body.get("requested_token_type")).toBe(
      "urn:ietf:params:oauth:token-type:access_token",
    );
    expect(body.get("team_id_or_slug")).toBe("team_123");
    expect(body.get("subject_token")).toBe("gh-jwt");
    expect(body.has("policy_id")).toBe(false);
  });

  it("includes the policy when provided", () => {
    const body = buildExchangeBody({
      team: "team_123",
      githubOidcToken: "gh-jwt",
      policy: "pol_1",
    });
    expect(body.get("policy_id")).toBe("pol_1");
  });
});

describe("buildRevokeBody", () => {
  it("builds the revocation body", () => {
    const body = buildRevokeBody("tok_123");
    expect(body.get("client_id")).toBe(VCR_APP_ID);
    expect(body.get("token")).toBe("tok_123");
    expect(body.get("token_type_hint")).toBe("access_token");
  });
});

describe("buildLoginArgs", () => {
  it("builds login arguments with the password on stdin", () => {
    expect(buildLoginArgs({ registry: "vcr.vercel.com", team: "team_123" })).toEqual([
      "login",
      "--username",
      "team_123",
      "--password-stdin",
      "vcr.vercel.com",
    ]);
  });
});

describe("parseEnginesInput", () => {
  it("splits on commas, spaces, and newlines, and dedupes", () => {
    expect(parseEnginesInput("docker, podman\nbuildah docker")).toEqual([
      "docker",
      "podman",
      "buildah",
    ]);
  });

  it("is case-insensitive", () => {
    expect(parseEnginesInput("Docker")).toEqual(["docker"]);
  });

  it("defaults to docker for empty input", () => {
    expect(parseEnginesInput("")).toEqual(["docker"]);
    expect(parseEnginesInput(" \n , ")).toEqual(["docker"]);
  });

  it("rejects unknown engines", () => {
    expect(() => parseEnginesInput("docker nerdctl")).toThrow(
      /Unknown engine "nerdctl".*docker, podman, buildah/,
    );
  });
});

describe("serializeEngines / parseEngines", () => {
  it("round-trips a list of engines", () => {
    const state = serializeEngines(["docker", "podman", "buildah"]);
    expect(state).toBe("docker podman buildah");
    expect(parseEngines(state)).toEqual(["docker", "podman", "buildah"]);
  });

  it("returns an empty list for missing state", () => {
    expect(parseEngines(undefined)).toEqual([]);
    expect(parseEngines("")).toEqual([]);
  });

  it("ignores unknown engines", () => {
    expect(parseEngines("docker nerdctl")).toEqual(["docker"]);
  });
});
