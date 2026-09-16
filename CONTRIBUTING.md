# Contributing

## Development

Use Node 24 for the build toolchain and the pnpm version pinned in
`package.json`. The compiled package supports Node 20 and newer.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm pack --dry-run
```

`pnpm verify` typechecks source and tests, builds, and runs the deterministic
suite. CI repeats compiled tests on Node 20. Live provider and Codex checks are
opt-in and billable; see [the test plan](doc/TEST_PLAN.md). Never commit API keys
or raw session logs.

See [architecture](doc/ARCHITECTURE.md) for module responsibilities and current
limitations. Update README options/tool behavior and the test plan in the same
change as their implementation. Prefer reproducible commands and assertions to
tracked test-result snapshots or hardcoded counts of passing tests.

## Releases

The `.github/workflows/npm-publish.yml` workflow verifies and packs before
publishing to the npm registry through Trusted Publishing (OIDC). It uses Node
24 and the pinned pnpm; its final publish command uses npm for provenance/OIDC.
No npm token is required when the repository's Trusted Publisher is configured.

For an explicitly authorized release:

1. Update `package.json` with `pnpm version <version> --no-git-tag-version`.
2. Run the verification and package checks above, inspect the diff, and commit
   the release changes.
3. Create and push a matching `v<version>` tag. Stable versions publish to
   `latest`; `-alpha.N` versions publish to `alpha`.
4. Verify the workflow result and registry metadata before reporting publication.

The workflow also supports manual dispatch; use a version-tag ref so channel
selection matches the intended release. The workflow rejects branch refs and
tags that do not match `package.json` before installing or publishing.
