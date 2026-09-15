import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import { getAccessToken } from "../src/auth";
import { VCR_APP_ID } from "../src/lib";
import { revokeSavedToken } from "../src/revoke";

vi.mock("@actions/core", () => ({ getIDToken: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const options = { team: "team_123", vercelApi: "https://api.vercel.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("STATE_accessToken", "");
  vi.stubEnv("VERCEL_API_ORIGIN", "");
  vi.mocked(core.getIDToken).mockResolvedValue("github-oidc-token");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getAccessToken", () => {
  it("exchanges GitHub OIDC for a VCR token with the selected audience and policy", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ access_token: "vercel-token" }));
    await expect(getAccessToken({
      ...options,
      audience: "custom-audience",
      policy: "pol_123",
    })).resolves.toBe("vercel-token");
    expect(core.getIDToken).toHaveBeenCalledWith("custom-audience");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.vercel.com/login/oauth/token");
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("client_id")).toBe(VCR_APP_ID);
    expect(body.get("subject_token")).toBe("github-oidc-token");
    expect(body.get("team_id_or_slug")).toBe("team_123");
    expect(body.get("policy_id")).toBe("pol_123");
  });

  it("explains missing OIDC permissions without attempting an exchange", async () => {
    vi.mocked(core.getIDToken).mockRejectedValueOnce(new Error("missing OIDC request URL"));
    await expect(getAccessToken(options)).rejects.toThrow(/permissions: id-token: write/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails on a rejected exchange with a policy hint", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(getAccessToken(options)).rejects.toThrow(/OIDC policy.*HTTP 403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient exchange failure", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ access_token: "vercel-token" }));
    const result = getAccessToken(options);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("vercel-token");
    expect(core.getIDToken).toHaveBeenCalledWith(undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("revokeSavedToken", () => {
  it("does nothing if authentication did not save a token", async () => {
    await revokeSavedToken();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("masks and revokes the token saved by this action", async () => {
    vi.stubEnv("STATE_accessToken", "wait-token");
    vi.stubEnv("VERCEL_API_ORIGIN", "http://127.0.0.1:8411");
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await revokeSavedToken();
    expect(console.log).toHaveBeenCalledWith("::add-mask::wait-token");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8411/login/oauth/token/revoke");
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("token")).toBe("wait-token");
    expect(body.get("client_id")).toBe(VCR_APP_ID);
    expect(console.log).toHaveBeenCalledWith("Revoked the Vercel access token.");
  });

  it("warns without failing the post step if revocation is unavailable", async () => {
    vi.stubEnv("STATE_accessToken", "wait-token");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(revokeSavedToken()).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("::warning::Failed to revoke"));
  });
});
