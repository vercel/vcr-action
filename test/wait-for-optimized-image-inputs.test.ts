import { describe, expect, it } from "vitest";
import { resolveImageInputs } from "../src/wait-for-optimized-image/inputs";

const image = "vcr.vercel.com/acme/web/my-image:build-123";
const manual = {
  team: "team_123",
  project: "prj_123",
  repository: "repo_123",
  tag: "build-123",
};

describe("resolveImageInputs", () => {
  it("resolves a full tagged image into team/project slugs and repository/tag", () => {
    expect(resolveImageInputs({ image })).toEqual({
      team: "acme",
      project: "web",
      repository: "my-image",
      tag: "build-123",
    });
  });

  it("preserves valid repository separators and case-sensitive tags", () => {
    expect(resolveImageInputs({
      image: "vcr.vercel.com/my-team/my-project/my.image__name--v2:Release_1.2-rc1",
    })).toEqual({
      team: "my-team",
      project: "my-project",
      repository: "my.image__name--v2",
      tag: "Release_1.2-rc1",
    });
  });

  it("keeps the manual input mode, including repository IDs", () => {
    expect(resolveImageInputs(manual)).toEqual(manual);
  });

  it("trims inputs and treats blank optional inputs as omitted", () => {
    expect(resolveImageInputs({ image: ` ${image}\n`, team: " " })).toEqual(
      resolveImageInputs({ image }),
    );
    expect(resolveImageInputs({ ...manual, image: " ", team: " team_123 " })).toEqual(manual);
  });

  it.each(Object.keys(manual))("rejects image combined with %s", (name) => {
    expect(() => resolveImageInputs({ image, [name]: "value" })).toThrow(/mutually exclusive/);
  });

  it("rejects image even when all manual inputs are supplied", () => {
    expect(() => resolveImageInputs({ image, ...manual })).toThrow(/mutually exclusive/);
  });

  it.each(Object.keys(manual))("requires %s in manual mode", (name) => {
    expect(() => resolveImageInputs({ ...manual, [name]: "" })).toThrow(
      `Missing manual inputs: '${name}'`,
    );
  });

  it("rejects missing inputs", () => {
    expect(() => resolveImageInputs({})).toThrow(/Provide either 'image' or all of/);
  });

  it.each([
    "my-image:latest",
    "acme/web/my-image:latest",
    "docker.io/acme/web/my-image:latest",
    "https://vcr.vercel.com/acme/web/my-image:latest",
    "vcr.vercel.com:443/acme/web/my-image:latest",
    "vcr.vercel.com/acme/web/my-image",
    "vcr.vercel.com/acme/web/my-image:",
    "vcr.vercel.com/acme/web/my-image:latest:extra",
    "vcr.vercel.com/acme/web/my-image:latest/extra",
    "vcr.vercel.com/acme/web/nested/my-image:latest",
    "vcr.vercel.com/acme//my-image:latest",
    "vcr.vercel.com/Acme/web/my-image:latest",
    "vcr.vercel.com/acme/-web/my-image:latest",
    "vcr.vercel.com/acme/web/my-image:-latest",
    "vcr.vercel.com/acme/web/my-image:latest?foo=bar",
    "vcr.vercel.com/acme/web/my-image@sha256:abcdef",
    `vcr.vercel.com/acme/web/my-image:latest@sha256:${"a".repeat(64)}`,
    `vcr.vercel.com/acme/web/my-image:${"a".repeat(129)}`,
    `vcr.vercel.com/${"a".repeat(49)}/web/my-image:latest`,
    `vcr.vercel.com/acme/web/${"a".repeat(250)}:latest`,
  ])("rejects invalid or untagged image %s", (image) => {
    expect(() => resolveImageInputs({ image })).toThrow(/must be a tagged VCR image/);
  });
});
