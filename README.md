# renovate-rush-example

A working reference implementation of [Renovate](https://docs.renovatebot.com/) running against a [Rush.js](https://rushjs.io/) monorepo, demonstrating how to make Renovate regenerate Rush's consolidated `pnpm-lock.yaml` after dependency bumps.

## Why this repo exists

Renovate has no native Rush manager ([renovatebot/renovate#3681](https://github.com/renovatebot/renovate/issues/3681) — open since 2019). When Renovate sees a Rush monorepo, it correctly identifies all the `package.json` files via its generic npm manager and proposes dependency bumps. But it has no knowledge of Rush's consolidated lockfile at `common/config/rush/pnpm-lock.yaml`, so the PRs it opens contain only `package.json` changes with no corresponding lockfile update. Every CI build fails at Rush's `rush install` consistency check before any application code runs.

This is solvable via Renovate's general-purpose `postUpgradeTasks` feature, invoking Rush's `install-run-rush.js` bootstrap. The canonical pattern is referenced in Renovate discussion threads but had never been published as a working reference repo. This is that reference.

If you're hitting "Renovate PRs fail my Rush monorepo's CI because the lockfile isn't updated," the answer is in [`renovate.json5`](./renovate.json5) and [`.github/workflows/renovate.yml`](./.github/workflows/renovate.yml).

## What's inside

| File | Purpose |
|---|---|
| [`renovate.json5`](./renovate.json5) | Renovate config. The critical block is `postUpgradeTasks.commands` — three commands invoked in sequence to install a Rush-compatible Node, install npm, and run `rush update`. |
| [`.github/workflows/renovate.yml`](./.github/workflows/renovate.yml) | Self-hosted Renovate workflow using `renovatebot/github-action@v46.1.14` (which bundles Renovate v43+). The critical env var is `RENOVATE_ALLOWED_COMMANDS`, the regex allowlist that permits the three post-upgrade commands. |
| `rush.json`, `common/`, `apps/`, `libraries/`, `tools/` | A minimal Rush monorepo, derived from [microsoft/rush-example](https://github.com/microsoft/rush-example), used as substrate for Renovate to do real lockfile-affecting work on. |

## The load-bearing pieces

### 1. `postUpgradeTasks.commands` runs three steps in sequence

```json5
postUpgradeTasks: {
  commands: [
    'install-tool node 20.14.0',
    'install-tool npm',
    'node common/scripts/install-run-rush.js update',
  ],
  fileFilters: ['common/config/rush/pnpm-lock.yaml', 'common/config/rush/repo-state.json'],
  executionMode: 'branch',
}
```

The Renovate container is built on [containerbase](https://github.com/containerbase/containerbase), which materializes tools on demand via its `install-tool` CLI. We need to invoke it manually for two reasons:

1. **Renovate's container has Node, but doesn't have the npm CLI by default.** Renovate's own npm manager uses pnpm internally and never shells out to npm CLI, so the image was built without it. Rush's `install-run-rush.js` does `command -v npm` at startup and aborts immediately if npm isn't found.

2. **The Node version matters.** containerbase defaults to the latest Node (currently 24.x) when materializing the npm tool. Rush will reject builds running on a Node version outside its `nodeSupportedVersionRange` (this example's rush.json allows Node 18 or 20). Renovate's `installTools` *declarative* config doesn't honor a Node version constraint ([discussion #26387](https://github.com/renovatebot/renovate/discussions/26387)); the maintainer's recommended pattern is to invoke `install-tool node X.Y.Z` explicitly in commands.

The three commands run sequentially in the same shell, so step 2's npm is in PATH for step 3.

### 2. `RENOVATE_ALLOWED_COMMANDS` permits exactly those commands

```yaml
RENOVATE_ALLOWED_COMMANDS: '["^install-tool node [0-9.]+$", "^install-tool npm$", "^node common/scripts/install-run-rush\.js update$"]'
```

Renovate refuses to run *any* postUpgradeTask command unless it matches this regex allowlist — by design, prevents an arbitrary repo config from executing arbitrary commands on the Renovate host. The three regexes match exactly the three commands above and nothing else.

(This option was formerly named `allowedPostUpgradeCommands`; renamed to `allowedCommands` in Renovate 39.131.0.)

### 3. `fileFilters` controls what changes from the post-tasks land in the commit

```json5
fileFilters: ['common/config/rush/pnpm-lock.yaml', 'common/config/rush/repo-state.json']
```

Two paths only. Rush's transient build artifacts in `common/temp/` are gitignored by Rush convention so don't need explicit exclusion.

## How to adopt this in your own Rush monorepo

1. **Fork this repo** (or copy `renovate.json5` and `.github/workflows/renovate.yml` into your existing Rush monorepo).
2. **Adjust the Node version** in `postUpgradeTasks.commands[0]` to match your `rush.json`'s `nodeSupportedVersionRange`. Bottom of the range is usually safest.
3. **Create a GitHub App** with these repository permissions: Contents R/W, Pull requests R/W, Issues R/W, Workflows R/W, Commit statuses R/W, Metadata R. Install it on your repo.
4. **Add the App ID and private key as repo secrets**: `RENOVATE_APP_ID` and `RENOVATE_APP_PRIVATE_KEY`.
5. **If your repo uses private npm packages** (e.g., scope-mapped to GitHub Packages), add `RENOVATE_NPMRC` (for Renovate's own version lookups) and `RENOVATE_CUSTOM_ENV_VARIABLES` (for the post-upgrade child shell, so `rush update` can resolve them). The sandbox uses only public npm packages so neither is needed here, but the pattern is documented in Renovate's [private packages docs](https://docs.renovatebot.com/getting-started/private-packages/).
6. **Trigger the workflow** via Actions → Renovate → Run workflow.
7. **Confirm success** by looking at the resulting PR diff: a real dependency update should include both a `package.json` change *and* a `common/config/rush/pnpm-lock.yaml` change in the same commit. Workflow-only changes (e.g., bumping a GitHub Actions version) won't include a lockfile change, which is correct.

## Sandbox-only settings (NOT for production)

The following knobs are present in `renovate.json5` for fast iteration during sandbox development; copy with caution:

- `recreateWhen: 'always'` — Always recreate previously-closed Renovate PRs. Production: use the default `'auto'`, which respects user intent when a human closes a Renovate PR.
- `prHourlyLimit: 0` and `prConcurrentLimit: 0` — Disable rate limits. Production: set sensible values (e.g., `prHourlyLimit: 2-4`, `prConcurrentLimit: 5-10`) to throttle PR floods.
- `minimumReleaseAge: '0 days'` — Process even newly-published versions immediately. Production: set a delay (e.g., `'14 days'`) to avoid picking up compromised or broken fresh releases.
- `schedule: ['hourly via cron']` (in workflow) — Production: gate routine PRs to a quieter cadence via `renovate.json5`'s `schedule`.

## Acknowledgments

The Rush monorepo scaffolding (everything except `renovate.json5` and `.github/workflows/renovate.yml`) is derived from [microsoft/rush-example](https://github.com/microsoft/rush-example), MIT-licensed. Versions of Rush (5.172.1) and pnpm (10.33.0) in `rush.json` have been bumped from the upstream defaults to current versions.

## License

MIT. See [LICENSE](./LICENSE).
