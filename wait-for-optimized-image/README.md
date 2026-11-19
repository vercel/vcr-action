# Wait for an optimized VCR image

Part of [`vercel/vcr-action`](../README.md), a collection of GitHub Actions
for Vercel Container Registry.

Wait for a pushed image's optimization status to become `ready` before
promoting it to a release tag. Images cannot be used in [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) until they are `ready`.

## Usage: log in, push, wait, and retag

```yaml
name: Publish image

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    env:
      IMAGE: vcr.vercel.com/<team-slug>/<project-slug>/my-image:ci-${{ github.run_id }}-${{ github.run_attempt }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to VCR
        uses: vercel/vcr-action/login@v1
        with:
          team: ${{ vars.VERCEL_TEAM_ID }}

      - name: Build and push a unique tag
        run: |
          docker buildx build \
            --platform linux/amd64 \
            --provenance=false \
            --sbom=false \
            --tag "$IMAGE" \
            --load .
          docker push "$IMAGE"

      - name: Wait for optimization
        id: optimized
        uses: vercel/vcr-action/wait-for-optimized-image@v1
        with:
          image: ${{ env.IMAGE }}
          timeout-seconds: 600

      - name: Promote the optimized image to latest
        run: |
          LATEST_IMAGE="${IMAGE%:*}:latest"
          docker tag "$IMAGE" "$LATEST_IMAGE"
          docker push "$LATEST_IMAGE"
```

## Prerequisites

1. [Create an OIDC policy](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fsettings%2Fbuild-and-deployment%3FaddOidcPolicy%3Dvcr&title=Add+a+VCR+OIDC+Policy)
   on your Vercel team that grants read access to Vercel Container
   Registry (a VCR policy). Ensure your OIDC policy has access the project that the repository is in.
   If using in a workflow that pushes to VCR, read-write access is required.
2. Give the workflow (or job) `id-token: write`
   permission.

## Inputs

Choose exactly one mode:

- **Image reference:** provide `image` only.
- **Manual:** provide `team`, `project`, `repository`, and either `tag` or
  `digest`.

Combining `image` with any manual input, or supplying incomplete manual
inputs, fails before authentication. `audience`, `policy`, and
`timeout-seconds` work in either mode.

| Name              | Required       | Default | Description                                                                                                                                       |
| ----------------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`           | in image mode  |         | Full `vcr.vercel.com/<team-slug>/<project-slug>/<repository>:<tag>` reference, or the same reference with `@sha256:<digest>` in place of the tag. |
| `team`            | in manual mode |         | Vercel team ID (`team_...`) or slug.                                                                                                              |
| `project`         | in manual mode |         | Vercel project ID (`prj_...`) or slug that owns the repository.                                                                                   |
| `repository`      | in manual mode |         | Repository name or ID, without the registry, team, project, or tag.                                                                               |
| `tag`             | in manual mode |         | Tag to wait for. Omit it when you set `digest`.                                                                                                   |
| `digest`          | no             |         | Manifest digest (`sha256:...`) to wait for, in place of `tag`.                                                                                    |
| `audience`        | no             |         | Custom OIDC audience, if your Vercel OIDC policy defines one.                                                                                     |
| `policy`          | no             |         | OIDC policy ID, to disambiguate between multiple matching policies.                                                                               |
| `timeout-seconds` | no             | `300`   | Positive whole number of seconds to poll after authentication, including status requests and retry delays.                                        |

The existing manual form remains supported:

```yaml
- uses: vercel/vcr-action/wait-for-optimized-image@v1
  with:
    team: ${{ vars.VERCEL_TEAM_ID }}
    project: ${{ vars.VERCEL_PROJECT_ID }}
    repository: my-image
    tag: ci-${{ github.run_id }}-${{ github.run_attempt }}
    timeout-seconds: 600
```

## Wait for an image by digest

An image index has no optimization status. VCR optimizes each platform image
in the index, and those images have no tag. To wait for one of them, pass its
digest:

```yaml
- name: Build and push by digest
  id: build
  uses: docker/build-push-action@v6
  with:
    platforms: ${{ matrix.platform }}
    provenance: false
    sbom: false
    outputs: type=image,name=${{ env.REPOSITORY }},push-by-digest=true,name-canonical=true,push=true,oci-mediatypes=true

- uses: vercel/vcr-action/wait-for-optimized-image@v1
  with:
    image: ${{ env.REPOSITORY }}@${{ steps.build.outputs.digest }}
    timeout-seconds: 600
```

For an index that is already pushed, list the digests of its platform images
with `docker buildx imagetools inspect`, then wait for each one. A build
attestation in the index is not an image, and VCR never optimizes it.

The wait action obtains its own short-lived Vercel access token using
GitHub OIDC. Give the job `id-token: write` permission and configure a VCR
OIDC policy with read access to the target project.

## Outputs

Outputs are set only when optimization succeeds.

| Name       | Description                                            |
| ---------- | ------------------------------------------------------ |
| `digest`   | Manifest digest (`sha256:...`) of the optimized image. |
| `image-id` | VCR's internal ID for the optimized image.             |

## Timeouts

The action fails immediately for authentication/authorization errors,
other non-retryable API errors, malformed responses, unexpected statuses,
and images that cannot be optimized:

- `unoptimized`: build for `linux/amd64`.
- `null` status or an image index: wait for each platform image by digest,
  or push a single-platform manifest with provenance and SBOM attestations
  disabled, as in the example above.
- A build attestation: pass the digest of a platform image.

GitHub also supports a step-level
[`timeout-minutes`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps-timeout-minutes)
outside `with:`. You can use it as an additional hard limit. The action's
`timeout-seconds` provides a failure message with the last observed status;
GitHub's timeout terminates the step directly.

```yaml
- uses: vercel/vcr-action/wait-for-optimized-image@v1
  timeout-minutes: 11
  with:
    image: ${{ env.IMAGE }}
    timeout-seconds: 600
```
