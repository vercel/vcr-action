# Vercel Container Registry Actions

GitHub Actions for
[Vercel Container Registry](https://vercel.com/docs/container-registry)
(`vcr.vercel.com`).

| Action                                | Description                                                          |
| ------------------------------------- | -------------------------------------------------------------------- |
| [`vercel/vcr-action/login`](login) | Log in to VCR with Docker, Podman, or Buildah using GitHub OIDC. |

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
