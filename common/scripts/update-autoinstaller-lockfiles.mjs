// Regenerates the pnpm-lock.yaml for every Rush autoinstaller, by invoking
// `rush update-autoinstaller --name <name>` for each folder under
// common/autoinstallers.
//
// WHY THIS EXISTS
// ---------------
// This is the autoinstaller counterpart to the main `rush update`
// postUpgradeTask (see renovate.json5). Renovate's npm manager treats every
// package.json as an ordinary npm project, including the ones inside
// common/autoinstallers/<name>/package.json — so it happily bumps a dependency
// version there. But each autoinstaller is an INDEPENDENT mini-project with its
// OWN adjacent pnpm-lock.yaml that the repo-wide `rush update` never touches
// (rush update only regenerates the consolidated workspace lockfile at
// common/config/rush/pnpm-lock.yaml).
//
// The result, without this script: an autoinstaller dependency bump lands as a
// package.json-only change with a stale autoinstaller lockfile. This does NOT
// fail `rush update` or `rush check` (autoinstallers are outside the workspace),
// so it slips through the normal Rush consistency gate — but the next time
// `rush <something>` boots that autoinstaller it does a frozen install against
// the stale lockfile and fails, breaking whatever tool the autoinstaller hosts
// (a linter, formatter, custom command, etc.) for everyone.
//
// `rush update-autoinstaller --name <name>` is the supported way to regenerate
// an autoinstaller's shrinkwrap. Unlike `rush update` it does NOT enforce the
// gitPolicy email check, so no --bypass-policy is needed (the flag does not
// exist on this command).
//
// COVERAGE vs. WASTE
// ------------------
// This regenerates ALL autoinstallers rather than only the one(s) whose
// package.json changed. The cost is just pnpm's resolution pass per
// autoinstaller; when a lockfile is already in sync, update-autoinstaller
// rewrites nothing and Renovate's fileFilters pick up no diff for it. Repos
// have only a handful of autoinstallers, so the simplicity (no dependence on
// Renovate's commit timing or base-branch ref to diff against) is worth the
// few seconds. If that ever matters, this is where you'd add a
// changed-only filter.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AUTOINSTALLERS_DIR = 'common/autoinstallers';

if (!existsSync(AUTOINSTALLERS_DIR)) {
	console.log(`[update-autoinstaller-lockfiles] no ${AUTOINSTALLERS_DIR} directory; nothing to do`);
	process.exit(0);
}

const names = readdirSync(AUTOINSTALLERS_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(join(AUTOINSTALLERS_DIR, entry.name, 'package.json')))
	.map((entry) => entry.name);

if (names.length === 0) {
	console.log(`[update-autoinstaller-lockfiles] no autoinstallers found; nothing to do`);
	process.exit(0);
}

console.log(`[update-autoinstaller-lockfiles] regenerating lockfiles for: ${names.join(', ')}`);

for (const name of names) {
	console.log(`[update-autoinstaller-lockfiles] --> rush update-autoinstaller --name ${name}`);
	execFileSync('node', ['common/scripts/install-run-rush.js', 'update-autoinstaller', '--name', name], {
		stdio: 'inherit',
	});
}

console.log('[update-autoinstaller-lockfiles] done');
