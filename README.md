# Vercel Container Registry Actions

GitHub Actions for
[Vercel Container Registry](https://vercel.com/docs/container-registry)
(`vcr.vercel.com`).

## Actions

### `vercel/vcr-action/login`

Log in to VCR with Docker, Podman, or Buildah using GitHub OIDC:

```yaml
- name: Log in to VCR
  uses: vercel/vcr-action/login@v1
  with:
    team: ${{ vars.VERCEL_TEAM_ID }}

- run: |
    docker build --platform linux/amd64 -t "$IMAGE" .
    docker push "$IMAGE"
  env:
    IMAGE: vcr.vercel.com/<team-slug>/<project-slug>/<repo>:latest
```

**[Full documentation for `login` →](login/README.md)**

### `vercel/vcr-action/wait-for-optimized-image`

Wait for a pushed image to be optimized before promoting its tag:

```yaml
- name: Wait for optimization
  id: optimized
  uses: vercel/vcr-action/wait-for-optimized-image@v1
  with:
    image: ${{ env.IMAGE }}
    timeout-seconds: 600
```

Pass the same full `vcr.vercel.com/<team>/<project>/<repo>:<tag>` reference
used by Docker. Alternatively, provide `team`, `project`, `repository`, and
`tag` together; the two input modes are mutually exclusive.

Uses GitHub OIDC (`id-token: write`) to obtain its own short-lived token and
returns the optimized image's `digest` and `image-id`. Use a unique tag for
the push, then retag the locally built image after optimization succeeds.

**[Full login → push → wait → retag example and documentation →](wait-for-optimized-image/README.md)**

## Development

TypeScript source lives in `src/`; each action's bundled output lives in
`<action>/dist/`.

```sh
pnpm install
pnpm test       # unit tests (vitest)
pnpm typecheck
pnpm build
```

## License

[MIT](LICENSE)
