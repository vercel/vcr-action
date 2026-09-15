import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import { getAccessToken } from "../src/auth";
import { waitForOptimizedImage } from "../src/wait-for-optimized-image/wait";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  info: vi.fn(),
  setSecret: vi.fn(),
  saveState: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));
vi.mock("../src/auth", () => ({ getAccessToken: vi.fn() }));
vi.mock("../src/wait-for-optimized-image/wait", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/wait-for-optimized-image/wait")>(),
  waitForOptimizedImage: vi.fn(),
}));

let inputs: Record<string, string>;
const image = { imageId: "img_123", manifestDigest: `sha256:${"a".repeat(64)}`, kind: "manifest", status: "ready" };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_API_ORIGIN", "");
  inputs = { team: "team_123", project: "prj_123", repository: "app", tag: "build-123" };
  vi.mocked(core.getInput).mockImplementation((name, options) => {
    if (!inputs[name] && options?.required) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return inputs[name] || "";
  });
  vi.mocked(getAccessToken).mockResolvedValue("wait-token");
  vi.mocked(waitForOptimizedImage).mockResolvedValue(image);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("gets its own token, saves it for revocation, and publishes outputs only after optimization", async () => {
  let resolveImage!: (value: typeof image) => void;
  vi.mocked(waitForOptimizedImage).mockReturnValueOnce(new Promise((resolve) => {
    resolveImage = resolve;
  }));
  await import("../src/wait-for-optimized-image/main");
  expect(getAccessToken).toHaveBeenCalledWith({
    vercelApi: "https://api.vercel.com",
    team: "team_123",
    audience: "",
    policy: "",
  });
  expect(core.setSecret).toHaveBeenCalledWith("wait-token");
  expect(core.saveState).toHaveBeenCalledWith("accessToken", "wait-token");
  expect(core.setOutput).not.toHaveBeenCalled();
  resolveImage(image);
  await vi.waitFor(() => expect(core.setOutput).toHaveBeenCalledWith("digest", image.manifestDigest));
  expect(core.setOutput).toHaveBeenCalledWith("image-id", "img_123");
  expect(waitForOptimizedImage).toHaveBeenCalledWith(expect.objectContaining({
    vercelApi: "https://api.vercel.com",
    token: "wait-token",
    team: "team_123",
    project: "prj_123",
    repository: "app",
    tag: "build-123",
    timeoutSeconds: 300,
  }));
  expect(core.setFailed).not.toHaveBeenCalled();
});

it("supports a custom audience, policy, timeout, and API origin", async () => {
  inputs.audience = "custom-audience";
  inputs.policy = "pol_123";
  inputs["timeout-seconds"] = "600";
  vi.stubEnv("VERCEL_API_ORIGIN", "http://127.0.0.1:8411");
  await import("../src/wait-for-optimized-image/main");
  expect(getAccessToken).toHaveBeenCalledWith({
    vercelApi: "http://127.0.0.1:8411",
    team: "team_123",
    audience: "custom-audience",
    policy: "pol_123",
  });
  expect(waitForOptimizedImage).toHaveBeenCalledWith(expect.objectContaining({
    vercelApi: "http://127.0.0.1:8411",
    token: "wait-token",
    timeoutSeconds: 600,
  }));
});

it("uses the image's team slug for OIDC and its project slug for polling", async () => {
  inputs = {
    image: "vcr.vercel.com/acme/web/my-image:build-123",
    audience: "custom-audience",
    policy: "pol_123",
  };
  await import("../src/wait-for-optimized-image/main");
  expect(getAccessToken).toHaveBeenCalledWith({
    vercelApi: "https://api.vercel.com",
    team: "acme",
    audience: "custom-audience",
    policy: "pol_123",
  });
  expect(waitForOptimizedImage).toHaveBeenCalledWith(expect.objectContaining({
    team: "acme",
    project: "web",
    repository: "my-image",
    tag: "build-123",
  }));
  await vi.waitFor(() => expect(core.setOutput).toHaveBeenCalledWith("digest", image.manifestDigest));
});

it.each(["team", "project", "repository", "tag"])("rejects image combined with %s before authentication", async (name) => {
  inputs = { image: "vcr.vercel.com/acme/web/app:build-123", [name]: inputs[name] };
  await import("../src/wait-for-optimized-image/main");
  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("mutually exclusive")));
  expect(getAccessToken).not.toHaveBeenCalled();
  expect(waitForOptimizedImage).not.toHaveBeenCalled();
  expect(core.setOutput).not.toHaveBeenCalled();
});

it("rejects an image without a tag before authentication", async () => {
  inputs = { image: "vcr.vercel.com/acme/web/app" };
  await import("../src/wait-for-optimized-image/main");
  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("tagged VCR image")));
  expect(getAccessToken).not.toHaveBeenCalled();
  expect(waitForOptimizedImage).not.toHaveBeenCalled();
});

it("fails before polling if OIDC authentication fails", async () => {
  vi.mocked(getAccessToken).mockRejectedValueOnce(new Error("OIDC authentication failed"));
  await import("../src/wait-for-optimized-image/main");
  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith("OIDC authentication failed"));
  expect(waitForOptimizedImage).not.toHaveBeenCalled();
  expect(core.saveState).not.toHaveBeenCalled();
  expect(core.setOutput).not.toHaveBeenCalled();
});

it.each(["team", "project", "repository", "tag"])("requires %s", async (name) => {
  delete inputs[name];
  await import("../src/wait-for-optimized-image/main");
  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(name)));
  expect(waitForOptimizedImage).not.toHaveBeenCalled();
  expect(getAccessToken).not.toHaveBeenCalled();
  expect(core.setOutput).not.toHaveBeenCalled();
});

it("rejects invalid timeouts before making a request", async () => {
  inputs["timeout-seconds"] = "-1";
  await import("../src/wait-for-optimized-image/main");
  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("timeout-seconds")));
  expect(waitForOptimizedImage).not.toHaveBeenCalled();
  expect(getAccessToken).not.toHaveBeenCalled();
});

it("marks the action failed without outputs when polling fails", async () => {
  vi.mocked(waitForOptimizedImage).mockRejectedValueOnce(new Error("optimization timed out"));
  await import("../src/wait-for-optimized-image/main");
  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith("optimization timed out"));
  expect(core.saveState).toHaveBeenCalledWith("accessToken", "wait-token");
  expect(core.setOutput).not.toHaveBeenCalled();
});
