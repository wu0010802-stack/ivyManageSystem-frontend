#!/usr/bin/env node
/**
 * scripts/lint-tokens.mjs — 跑 stylelint 並輸出每 prefix 違規數 baseline。
 *
 * 用法：`npm run lint:tokens`
 * 產 `.scratch/tokens-baseline.json`（不入 repo），供 follow-up PR diff。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

const OUT_PATH = '.scratch/tokens-baseline.json';

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

function run() {
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
  let totalWarnings = 0;
  for (const fileResult of json) {
    for (const w of fileResult.warnings || []) {
      if (w.rule !== 'ivy/canonical-token-prefix') continue;
      totalWarnings++;
      const m = w.text.match(/'--([a-z0-9]+)-/i);
      if (m) {
        const prefix = m[1];
        counts[prefix] = (counts[prefix] || 0) + 1;
      }
    }
  }

  const baseline = {
    generated_at: new Date().toISOString(),
    total_warnings: totalWarnings,
    by_prefix: counts,
    files_scanned: json.length,
  };

  if (!existsSync(dirname(OUT_PATH))) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
  }
  writeFileSync(OUT_PATH, JSON.stringify(baseline, null, 2));

  console.log(`\n=== Token Lint Baseline (warnings: ${totalWarnings}) ===`);
  for (const [prefix, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  --${prefix}-* : ${count} 處`);
  }
  console.log(`\nWritten: ${OUT_PATH}`);
}

run();
