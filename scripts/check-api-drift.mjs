// Verifies src/api/_generated/schema.d.ts is in sync with the committed
// version after `npm run gen:api`. Detects both:
//   (a) schema.d.ts changed since last commit (regen produced a diff), AND
//   (b) schema.d.ts was never committed (untracked produit).
//
// `git diff --exit-code` alone misses (b), so we use `git status --porcelain`.
import { execSync } from "node:child_process";

const TARGET = "src/api/_generated/schema.d.ts";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

let porcelain;
try {
  porcelain = run(`git status --porcelain -- ${TARGET}`);
} catch (err) {
  console.error(`[check-api-drift] git status failed: ${err.message}`);
  process.exit(2);
}

if (porcelain) {
  console.error(
    `\n[check-api-drift] ${TARGET} is not in sync with the committed schema.\n` +
      `git status --porcelain output:\n${porcelain}\n\n` +
      `Fix: commit the regenerated file:\n` +
      `  git add ${TARGET}\n` +
      `  git commit -m "chore(api): regen openapi types"\n`
  );
  process.exit(1);
}

console.log(`[check-api-drift] ${TARGET} matches committed version. ✅`);
