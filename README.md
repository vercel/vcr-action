# Log in to Vercel Container Registry

GitHub Action that logs in to
[Vercel Container Registry](https://vercel.com/docs/container-registry)
(`vcr.vercel.com`) with Docker, Podman, and Buildah.

## Usage

```yaml
name: Push to VCR

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to VCR
        uses: vercel/vcr-login-action@v1
        with:
          team: ${{ vars.VERCEL_TEAM_ID }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64
          provenance: false
          tags: vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest
          outputs: type=image,push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true
```

## Prerequisites

1. Create an OIDC policy on your Vercel team that grants read-write access to the
   Vercel Container Registry (a VCR policy).
2. Store your Vercel team ID (`team_...`) as a repository **variable**
   (e.g. `VERCEL_TEAM_ID`) and give the workflow (or job) `id-token: write`
   permission.

## Inputs

| Name         | Required | Default                  | Description                                                                 |
| ------------ | -------- | ------------------------ | --------------------------------------------------------------------------- |
| `team`       | yes      |                          | Vercel team ID (`team_...`) used for the token exchange and registry login. |
| `audience`   | no       |                          | Custom OIDC audience, if your Vercel OIDC policy defines one.               |
| `policy`     | no       |                          | OIDC policy ID, to disambiguate between multiple matching policies.          |
| `engines`    | no       | `docker`                 | Engines to log in with (comma-, space-, or newline-separated): `docker`, `podman`, `buildah`. |
| `registry`   | no       | `vcr.vercel.com`         | Registry host.                                                               |
| `logout`     | no       | `true`                   | Log out from the registry when the job completes.                            |
| `revoke`     | no       | `true`                   | Revoke the access token when the job completes.                              |

## Outputs

| Name       | Description                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| `registry` | Registry host that was logged in to.                                             |
| `engines`  | Newline-separated list of engines that were logged in (docker, podman, buildah). |

## Pushing with each engine

The repository is created automatically on first push. Repository references
have the form `vcr.vercel.com/<team-slug>/<project-slug>/<repo>:<tag>`.

**Docker** (or [docker/build-push-action](https://github.com/docker/build-push-action)
with `push: true`):

```yaml
- run: |
    docker build --platform linux/amd64 -t vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest .
    docker push vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest
```

**Podman**:

```yaml
- uses: vercel/vcr-login-action@v1
  with:
    team: ${{ vars.VERCEL_TEAM_ID }}
    engines: podman

- run: |
    podman build --platform linux/amd64 -t vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest .
    podman push vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest
```

**Buildah**:

```yaml
- uses: vercel/vcr-login-action@v1
  with:
    team: ${{ vars.VERCEL_TEAM_ID }}
    engines: buildah

- run: |
    buildah build --platform linux/amd64 -t vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest .
    buildah push vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest
```

## Development

TypeScript source lives in `src/`; the bundled output in `dist/`.

```sh
pnpm install
pnpm test       # unit tests (vitest)
pnpm typecheck
pnpm build
```

## Notes

- Pushed images can be used with
  [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox), referenced as
  `<repo>:<tag>` within the same project.
- Images must target `linux/amd64` to use in Sandbox; other platforms push
  successfully but are not optimized by Vercel.
- Podman and Buildah share a credential store, so logging in with one also
  logs in the other.
