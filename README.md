# renovate-rush-example

A working reference implementation of [Renovate](https://docs.renovatebot.com/) running against a [Rush.js](https://rushjs.io/) monorepo, demonstrating how to make Renovate regenerate Rush's consolidated `pnpm-lock.yaml` after dependency bumps.

## Why this repo exists

Renovate has no native Rush manager ([renovatebot/renovate#3681](https://github.com/renovatebot/renovate/issues/3681) — open since 2019). When Renovate sees a Rush monorepo, it correctly identifies all the `package.json` files via its generic npm manager and proposes dependency bumps. But it has no knowledge of Rush's consolidated lockfile at `common/config/rush/pnpm-lock.yaml`, so the PRs it opens contain only `package.json` changes with no corresponding lockfile update. Every CI build fails at Rush's `rush install` consistency check before any application code runs.

This is solvable, but the canonical pattern (`postUpgradeTasks` invoking `node common/scripts/install-run-rush.js update`) is folklore — referenced in Renovate discussion threads but never published as a working reference. This repo is that reference.

If you're hitting "Renovate PRs fail my Rush monorepo's CI because the lockfile isn't updated," the answer is in [`renovate.json5`](./renovate.json5) and [`.github/workflows/renovate.yml`](./.github/workflows/renovate.yml).

## What's inside

| File | Purpose |
|---|---|
| [`renovate.json5`](./renovate.json5) | Renovate config. The critical block is `postUpgradeTasks`, which runs `rush update` after package.json modifications so the consolidated lockfile is regenerated in the same commit. |
| [`.github/workflows/renovate.yml`](./.github/workflows/renovate.yml) | Self-hosted Renovate workflow using `renovatebot/github-action`. The critical env var is `RENOVATE_ALLOWED_COMMANDS`, which is Renovate's security gate — without it, postUpgradeTasks are silently refused. |
| `rush.json`, `common/`, `apps/`, `libraries/`, `tools/` | A minimal Rush monorepo, derived from [microsoft/rush-example](https://github.com/microsoft/rush-example), used as a substrate for Renovate to do real lockfile-affecting work on. |

The three load-bearing pieces, in order of importance:

1. **`postUpgradeTasks` in `renovate.json5`** — declares the command, the file allowlist for what gets committed, and the per-branch execution mode.
2. **`RENOVATE_ALLOWED_COMMANDS` in the workflow env** — Renovate refuses to run *any* postUpgradeTask command unless it matches this regex allowlist. By design — prevents an arbitrary repo config from executing arbitrary commands on the Renovate host. Without this set, the postUpgradeTasks block in `renovate.json5` is silently a no-op.
3. **The Rush bootstrap script `common/scripts/install-run-rush.js`** — ships with every Rush monorepo; downloads the pinned Rush version into `common/temp/` and then runs `rush update`. The Renovate Docker image has Node already, so no custom image is needed.

If your repo also uses private npm packages, you'll additionally need `RENOVATE_CUSTOM_ENV_VARIABLES` to pass the registry auth token to the `rush update` child process — Renovate doesn't propagate env vars to postUpgradeTasks children by default. See the upstream [`customEnvVariables` docs](https://docs.renovatebot.com/self-hosted-configuration/#customenvvariables). The setup in this repo uses only the public npm registry, so it's omitted here.

## How to try it

1. Fork this repo (or copy the relevant files into your own Rush monorepo).
2. Create a GitHub App with these repository permissions: Contents R/W, Pull requests R/W, Issues R/W, Workflows R/W, Commit statuses R/W, Metadata R. (See [GitHub's docs on creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).) Install it on the fork.
3. Add the App ID and private key as repo secrets: `RENOVATE_APP_ID` and `RENOVATE_APP_PRIVATE_KEY`.
4. Trigger the workflow via Actions → Renovate → Run workflow.
5. Watch for a PR that modifies both a `package.json` AND `common/config/rush/pnpm-lock.yaml` in the same commit. If both files are present in the diff, the post-upgrade hook is working.

## Acknowledgments

The Rush monorepo scaffolding (everything except `renovate.json5` and `.github/workflows/renovate.yml`) is derived from [microsoft/rush-example](https://github.com/microsoft/rush-example), MIT-licensed. Versions of Rush (5.172.1) and pnpm (10.33.0) in `rush.json` have been bumped from the upstream defaults to match a current real-world monorepo's pinned versions; otherwise the structure is unchanged.

## License

MIT. See [LICENSE](./LICENSE).
