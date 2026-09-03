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
