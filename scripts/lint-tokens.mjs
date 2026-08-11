#!/usr/bin/env node
/**
 * scripts/lint-tokens.mjs — deprecated design token prefix 的存量棘輪（只准降、不准升）。
 *
 * 為什麼要擋：`stylelint` 的 ivy/canonical-token-prefix 規則把 `--pt-` / `--m3-` /
 * `--neutral-` / `--brand-` / `--ivy-` 這些歷史 prefix 標為 deprecated，正解是
 * `var(--color-*)` 或 design-dimension prefix（見 docs/TOKENS.md）。但這條規則是
 * warning severity，stylelint 一律 exit 0 —— 等於完全沒有防線，存量只會單向增加。
 * 實例：main 上是 1678 處，staging 上已經漲到 1795。
 *
 * 存量不在一次 PR 的範圍內（1795 處散落 200+ 檔，逐一換 token 需要逐處確認視覺
 * 等價），但**不能再長**。這與 eslint `no-explicit-any` 的 inline disable 棘輪、
 * scripts/check-error-detail-ratchet.mjs 的數字 baseline 同構。
 *
 * 為什麼是 per-prefix 而不是單一總數：總數棘輪擋不住「--pt- 減 5、--m3- 加 5」
 * 的假平衡 —— 那看起來是零淨增長，實際上是在新模組裡繼續種新的 deprecated token。
 * 逐 prefix 卡死才能保證每一類都只降不升。
 *
 * 用法：
 *   npm run lint:tokens              # 檢查（CI 用）
 *   npm run lint:tokens -- --list    # 列出所有出現位置
 *   npm run lint:tokens -- --update  # 收斂後把 BASELINE 更新成現況
 *
 * 退出碼：0=與 baseline 相符；1=任一 prefix 超標，或低於 baseline 但未更新數字。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

const OUT_PATH = '.scratch/tokens-baseline.json';
const SELF_PATH = 'scripts/lint-tokens.mjs';

/**
 * 清掉幾處之後**必須**同步調降對應數字（`--update` 會幫你改），否則棘輪會鬆掉。
 * 這一步是刻意的：把成果鎖進版控，等同 eslint 的 reportUnusedDisableDirectives。
 */
const BASELINE = {
  pt: 890,
  m3: 377,
  neutral: 286,
  brand: 213,
  ivy: 29,
};

/**
 * 從 stylelint stderr 提取 JSON array（stylelint v16 透過 console.error 印 JSON formatter
 * 輸出，且 CommonJS plugin deprecation warning 也走 stderr 混在前面）。
 * 取自第一個 `[` 後到結尾、剝離 trailing 非 JSON 內容，找到完整 JSON array。
 */
function extractJsonArray(stderr) {
  // stylelint v16 stderr 開頭可能含 `[stylelint:001] DeprecationWarning: ...`，
  // 真正的 JSON formatter 輸出以 `[{"source":` 起頭，所以 anchor 該字串。
  const start = stderr.indexOf('[{"source"');
  if (start < 0) return null;
  const candidate = stderr.slice(start);
  // 嘗試直接 parse；若仍有 trailing 雜訊，遞退到最後一個 `]`
  try {
    return JSON.parse(candidate);
  } catch {
    const lastBracket = candidate.lastIndexOf(']');
    if (lastBracket < 0) return null;
    try {
      return JSON.parse(candidate.slice(0, lastBracket + 1));
    } catch {
      return null;
    }
  }
}

function collect() {
  const result = spawnSync(
    'npx',
    ['stylelint', '--formatter', 'json', 'src/**/*.{css,vue}'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  if (result.error) {
    console.error('stylelint spawn failed:', result.error.message);
    process.exit(1);
  }

  // stylelint v16 將 JSON formatter 輸出寫到 stderr（並 prefix deprecation warning），
  // stdout 留給其他 formatter；exit code 為 0（warning-only）。
  const raw = (result.stderr || '') + (result.stdout || '');
  const json = extractJsonArray(raw);
  if (!json) {
    console.error('stylelint did not produce parseable JSON output.');
    console.error('Exit code:', result.status);
    console.error('Stderr tail:', raw.slice(-500));
    process.exit(1);
  }

  const counts = {};
  const occurrences = [];
  const errors = [];
  let totalWarnings = 0;
  for (const fileResult of json) {
    const rel = (fileResult.source || '').replace(process.cwd() + '/', '');
    for (const w of fileResult.warnings || []) {
      // stylelint 的 error severity 規則（非 token prefix 那條 warning）一律當成
      // 真失敗。`npm run lint:css` 本身也只會在有 error 時 exit 1，這裡一併涵蓋，
      // 免得 CI 為了同一份 stylelint 結果跑兩次。
      if (w.severity === 'error') {
        errors.push(`  ${rel}:${w.line}  [${w.rule}] ${w.text}`);
        continue;
      }
      if (w.rule !== 'ivy/canonical-token-prefix') continue;
      totalWarnings++;
      const m = w.text.match(/'--([a-z0-9]+)-/i);
      if (m) {
        const prefix = m[1];
        counts[prefix] = (counts[prefix] || 0) + 1;
        occurrences.push({ file: rel, line: w.line, prefix, text: w.text });
      }
    }
  }
  return { counts, occurrences, errors, totalWarnings, filesScanned: json.length };
}

const { counts, occurrences, errors, totalWarnings, filesScanned } = collect();

// 舊行為保留：把現況寫到 .scratch（不入 repo），供 follow-up PR diff 用。
if (!existsSync(dirname(OUT_PATH))) mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify(
    { generated_at: new Date().toISOString(), total_warnings: totalWarnings, by_prefix: counts, files_scanned: filesScanned },
    null,
    2,
  ),
);

if (process.argv.includes('--list')) {
  for (const o of occurrences) console.log(`${o.file}:${o.line}  --${o.prefix}-*  ${o.text.slice(0, 90)}`);
  console.log(`\n合計 ${totalWarnings} 處，分佈於 ${new Set(occurrences.map((o) => o.file)).size} 個檔案`);
  process.exit(0);
}

if (errors.length && !process.argv.includes('--update')) {
  console.error(`✗ stylelint 回報 ${errors.length} 個 error severity 違規：\n${errors.join('\n')}`);
  process.exit(1);
}

const prefixes = [...new Set([...Object.keys(BASELINE), ...Object.keys(counts)])].sort();
const over = [];
const under = [];
for (const p of prefixes) {
  const now = counts[p] || 0;
  const base = BASELINE[p];
  if (base === undefined) {
    over.push(`  --${p}-*  ${now} 處（baseline 沒有這個 prefix —— 是新引入的 deprecated 家族）`);
  } else if (now > base) {
    over.push(`  --${p}-*  ${now} > baseline ${base}（+${now - base}）`);
  } else if (now < base) {
    under.push(`  --${p}-*  ${now} < baseline ${base}（-${base - now}）`);
  }
}

if (process.argv.includes('--update')) {
  const src = readFileSync(SELF_PATH, 'utf-8');
  const body = prefixes
    .filter((p) => (counts[p] || 0) > 0)
    .map((p) => `  ${p}: ${counts[p]},`)
    .join('\n');
  const updated = src.replace(/const BASELINE = \{[\s\S]*?\n\};/, `const BASELINE = {\n${body}\n};`);
  writeFileSync(SELF_PATH, updated);
  console.log(`✓ BASELINE 已更新為現況（合計 ${totalWarnings} 處）。記得把 ${SELF_PATH} 一起 commit。`);
  process.exit(0);
}

if (over.length) {
  console.error(
    `✗ deprecated token prefix 的存量增加了：\n${over.join('\n')}\n\n` +
      `新樣式請改用 canonical token（見 docs/TOKENS.md）：\n` +
      `  color / background / border-color → var(--color-*)\n` +
      `  間距、圓角、陰影等 → 對應的 design-dimension prefix\n\n` +
      `跑 \`npm run lint:tokens -- --list\` 看完整清單。\n` +
      `若這批 deprecated token 確實無法避免，請在 PR 說明理由並手動調整 BASELINE。`,
  );
  process.exit(1);
}

if (under.length) {
  console.error(
    `✗ 存量已下降，但 baseline 還沒更新：\n${under.join('\n')}\n\n` +
      `跑 \`npm run lint:tokens -- --update\` 把成果鎖進版控 —— 否則棘輪會鬆掉，\n` +
      `之後有人加回來也不會被擋。`,
  );
  process.exit(1);
}

console.log(`✓ deprecated token 維持 ${totalWarnings} 處，各 prefix 與 baseline 相符`);
for (const p of prefixes) console.log(`    --${p}-* : ${counts[p] || 0}`);
