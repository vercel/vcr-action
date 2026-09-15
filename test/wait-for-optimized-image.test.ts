import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTimeoutSeconds, waitForOptimizedImage } from "../src/wait-for-optimized-image/wait";

const digest = `sha256:${"a".repeat(64)}`;
const image = {
  imageId: "img_123",
  manifestDigest: digest,
  kind: "manifest",
  status: "ready",
};
const options = {
  vercelApi: "https://api.vercel.com",
  token: "test-token",
  team: "team_123",
  project: "prj_123",
  repository: "my-image",
  tag: "build-123",
  timeoutSeconds: 300,
  onProgress: vi.fn(),
};
const fetchMock = vi.fn<typeof fetch>();

function tagResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ tag: { ...image, ...overrides } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  fetchMock.mockReset();
  options.onProgress.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseTimeoutSeconds", () => {
  it("defaults to five minutes and accepts positive whole seconds", () => {
    expect(parseTimeoutSeconds("")).toBe(300);
    expect(parseTimeoutSeconds("600")).toBe(600);
  });

  it.each(["0", "-1", "1.5", "NaN", "Infinity", "5m", " ", "9007199254740991"])(
    "rejects invalid timeout %s",
    (input) => {
      expect(() => parseTimeoutSeconds(input)).toThrow(/positive whole number/);
    },
  );
});

describe("waitForOptimizedImage", () => {
  it("authenticates and scopes the tag lookup, returning the ready image", async () => {
    fetchMock.mockResolvedValueOnce(tagResponse());

    await expect(waitForOptimizedImage(options)).resolves.toEqual(image);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.vercel.com/v1/vcr/repository/my-image/tags/build-123?projectId=prj_123&teamId=team_123",
    );
    expect(init?.headers).toEqual({ Authorization: "Bearer test-token" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encodes path and query parameters", async () => {
    fetchMock.mockResolvedValueOnce(tagResponse());
    await waitForOptimizedImage({
      ...options,
      repository: "repo/name",
      tag: "build?next=#1",
      project: "prj_123&teamId=other",
    });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/vcr/repository/repo%2Fname/tags/build%3Fnext%3D%231");
    expect(url.searchParams.get("projectId")).toBe("prj_123&teamId=other");
    expect(url.searchParams.get("teamId")).toBe("team_123");
  });

  it("scopes image-reference lookups by team slug and project name", async () => {
    fetchMock.mockResolvedValueOnce(tagResponse());
    await waitForOptimizedImage({ ...options, team: "acme", project: "web" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.vercel.com/v1/vcr/repository/my-image/tags/build-123?projectId=web&slug=acme",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("polls preparing images every five seconds until ready", async () => {
    fetchMock
      .mockResolvedValueOnce(tagResponse({ status: "preparing" }))
      .mockResolvedValueOnce(tagResponse({ status: "preparing" }))
      .mockResolvedValueOnce(tagResponse());

    const result = waitForOptimizedImage(options);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_001);

    await expect(result).resolves.toEqual(image);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(options.onProgress).toHaveBeenCalledWith(expect.stringContaining('status="preparing"'));
  });

  it.each([404, 408, 429, 500, 502, 503])("retries HTTP %s", async (status) => {
    fetchMock
      .mockResolvedValueOnce(new Response("temporary failure", { status }))
      .mockResolvedValueOnce(tagResponse());
    const result = waitForOptimizedImage(options);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toEqual(image);
    expect(options.onProgress).toHaveBeenCalledWith(expect.stringContaining(`HTTP ${status}`));
  });

  it("retries network failures", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(tagResponse());
    const result = waitForOptimizedImage(options);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toEqual(image);
  });

  it.each([400, 401, 403, 410])("fails immediately on HTTP %s", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("failure", { status }));
    await expect(waitForOptimizedImage(options)).rejects.toThrow(`HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unoptimized images immediately", async () => {
    fetchMock.mockResolvedValueOnce(tagResponse({ status: "unoptimized" }));
    await expect(waitForOptimizedImage(options)).rejects.toThrow(/unoptimized.*linux\/amd64/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects image indexes with a build hint", async () => {
    fetchMock.mockResolvedValueOnce(tagResponse({ kind: "index", status: null }));
    await expect(waitForOptimizedImage(options)).rejects.toThrow(/no optimization status.*--provenance=false/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "unknown"])("rejects an unexpected status (%s)", async (status) => {
    fetchMock.mockResolvedValueOnce(tagResponse({ status }));
    await expect(waitForOptimizedImage(options)).rejects.toThrow(/unexpected optimization status/);
  });

  it.each([
    {},
    { tag: {} },
    { tag: { ...image, status: undefined } },
    { tag: { ...image, manifestDigest: "invalid" } },
    { tag: { ...image, imageId: "" } },
  ])("rejects malformed API responses (%j)", async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(waitForOptimizedImage(options)).rejects.toThrow(/invalid tag response/);
  });

  it("rejects invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not JSON"));
    await expect(waitForOptimizedImage(options)).rejects.toThrow(/invalid JSON/);
  });

  it("fails if the tag is moved to a different image during the wait", async () => {
    fetchMock
      .mockResolvedValueOnce(tagResponse({ status: "preparing" }))
      .mockResolvedValueOnce(tagResponse({ manifestDigest: `sha256:${"b".repeat(64)}` }));
    const result = expect(waitForOptimizedImage(options)).rejects.toThrow(/changed from.*unique tag/);
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
  });

  it("bounds the last sleep by the timeout and reports the last status", async () => {
    fetchMock.mockImplementation(async () => tagResponse({ status: "preparing" }));
    const result = expect(
      waitForOptimizedImage({ ...options, timeoutSeconds: 7 }),
    ).rejects.toThrow(/Timed out after 7s.*status="preparing"/);
    await vi.advanceTimersByTimeAsync(7_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now()).toBe(7_000);
  });

  it("times out when a pushed tag never becomes visible", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    const result = expect(
      waitForOptimizedImage({ ...options, timeoutSeconds: 3 }),
    ).rejects.toThrow(/Timed out after 3s.*HTTP 404.*team, project, repository, and tag/);
    await vi.advanceTimersByTimeAsync(3_000);
    await result;
  });

  it.each(["request", "body"])("aborts a stalled %s at the overall deadline", async (stage) => {
    // Native AbortSignal.timeout does not use Vitest's fake timers.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("request timed out")), ms);
      return controller.signal;
    });
    fetchMock.mockImplementation(async (_url, init) => {
      const stalled = new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
      if (stage === "request") {
        return stalled;
      }
      const response = tagResponse();
      vi.spyOn(response, "json").mockReturnValue(stalled);
      return response;
    });
    const result = expect(
      waitForOptimizedImage({ ...options, timeoutSeconds: 40 }),
    ).rejects.toThrow(/Timed out after 40s.*request timed out/);

    await vi.advanceTimersByTimeAsync(40_000);
    await result;
    expect(timeout.mock.calls).toEqual([[30_000], [5_000]]);
  });

  it("does not succeed if ready arrives after the deadline", async () => {
    fetchMock.mockImplementation(async () => {
      vi.setSystemTime(301_000);
      return tagResponse();
    });
    await expect(waitForOptimizedImage(options)).rejects.toThrow(/Timed out after 300s/);
  });
});
