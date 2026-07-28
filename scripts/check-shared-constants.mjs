#!/usr/bin/env node
/**
 * 跨 repo 共用常數 drift 防護（前後端雙寫常數的單側漂移守衛）。
 *
 * 幾個常數在前後端「各寫一份」（無共用 package），改一邊忘了改另一邊就會
 * 不一致——尤其薪資/金額類常數一旦漂移會造成試算與實算對不上。此 script 在
 * 「兩 repo 並存」時（CI 的 openapi-drift job 會把 ivy-backend checkout 成
 * sibling）直接讀後端 source 值比對前端值，不一致即 exit 1。
 *
 * 這是「真正的」守衛——比各 repo 自己 pin 期望值的測試強，因為它能抓
 * 「只改了一邊」的單側漂移。
 *
 * 用法：
 *   node scripts/check-shared-constants.mjs            # 後端預設在 ../ivy-backend
 *   IVY_BACKEND_DIR=/path/to/ivy-backend node scripts/check-shared-constants.mjs
 *
 * 退出碼：0=一致；1=有漂移或解析失敗；2=找不到後端 repo（設定問題）。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// 每筆：前端檔+符號 ↔ 後端檔（相對 backend root）+符號；值必須一致。
// 排除勞退率 0.06：前端 PENSION_SELF_RATE_MAX（自提上限§14）與後端
// PENSION_EMPLOYER_RATE（雇主提撥§6）法源語意不同，值碰巧相同不可互比。
export const SHARED_CONSTANTS = [
  {
    label: "基本工資（月薪）",
    fe: { file: "src/constants/laborCompliance.ts", symbol: "MINIMUM_MONTHLY_WAGE" },
    be: { file: "services/salary/minimum_wage.py", symbol: "MINIMUM_MONTHLY_WAGE" },
  },
  {
    label: "基本工資（時薪）",
    fe: { file: "src/constants/laborCompliance.ts", symbol: "MINIMUM_HOURLY_WAGE" },
    be: { file: "services/salary/minimum_wage.py", symbol: "MINIMUM_HOURLY_WAGE" },
  },
  {
    label: "退費簽核門檻",
    fe: { file: "src/constants/pos.ts", symbol: "REFUND_APPROVAL_THRESHOLD" },
    be: { file: "utils/activity_constants.py", symbol: "REFUND_APPROVAL_THRESHOLD" },
  },
  {
    label: "才藝達標獎金",
    fe: { file: "src/constants/activity.ts", symbol: "FULL_ATTENDANCE_BONUS" },
    be: { file: "utils/activity_constants.py", symbol: "GRADE_TARGET_BONUS" },
  },
  // 2026-07-28 設計審查：原因字數門檻原本只靠註解人工同步，納入單側漂移守衛。
  // 前端符號是 FIELD_RULES 物件屬性（`voidReasonMin: 5`），parseNumericConst
  // 已支援冒號格式。
  {
    label: "軟刪繳費原因最短字數",
    fe: { file: "src/constants/activity.ts", symbol: "voidReasonMin" },
    be: { file: "utils/activity_constants.py", symbol: "MIN_VOID_REASON_LENGTH" },
  },
  {
    label: "退費原因最短字數",
    fe: { file: "src/constants/activity.ts", symbol: "refundReasonMin" },
    be: { file: "utils/activity_constants.py", symbol: "MIN_REFUND_REASON_LENGTH" },
  },
  {
    label: "日結解鎖原因最短字數",
    fe: { file: "src/constants/activity.ts", symbol: "unlockReasonMin" },
    be: { file: "schemas/activity_admin.py", symbol: "_UNLOCK_REASON_MIN_LENGTH" },
  },
];

/**
 * 解析 `export const NAME = 12345` / python `NAME = 12345` / 物件屬性 `name: 12345`
 * （允許 1_000 底線分隔、小數）。解析不到回 null（呼叫端視為失敗，不可靜默通過）。
 */
export function parseNumericConst(source, symbol) {
  const re = new RegExp(
    `(?:export\\s+const\\s+)?\\b${symbol}\\b\\s*[:=]\\s*([0-9_]+(?:\\.[0-9]+)?)`,
  );
  const m = source.match(re);
  if (!m) return null;
  return Number(m[1].replace(/_/g, ""));
}

/** 純比對：回傳漂移的 rows（值不等、或任一側解析失敗）。 */
export function diffConstants(rows) {
  return rows.filter(
    (r) => r.feValue === null || r.beValue === null || r.feValue !== r.beValue,
  );
}

function readConstValue(rootDir, fileRel, symbol) {
  const path = resolve(rootDir, fileRel);
  if (!existsSync(path)) return null;
  return parseNumericConst(readFileSync(path, "utf8"), symbol);
}

export function main() {
  const feRoot = process.env.IVY_FRONTEND_DIR || ".";
  const beRoot = process.env.IVY_BACKEND_DIR || "../ivy-backend";

  if (!existsSync(beRoot)) {
    console.error(
      `[check-shared-constants] 找不到後端 repo：${beRoot}\n` +
        `CI 的 openapi-drift job 內後端應已 checkout 為 sibling；` +
        `本機請設 IVY_BACKEND_DIR 指向 ivy-backend。`,
    );
    process.exit(2);
  }

  const rows = SHARED_CONSTANTS.map((c) => ({
    label: c.label,
    fe: c.fe,
    be: c.be,
    feValue: readConstValue(feRoot, c.fe.file, c.fe.symbol),
    beValue: readConstValue(beRoot, c.be.file, c.be.symbol),
  }));

  for (const r of rows) {
    const ok = r.feValue !== null && r.beValue !== null && r.feValue === r.beValue;
    console.log(
      `[${ok ? "OK   " : "DRIFT"}] ${r.label}: ` +
        `FE ${r.fe.symbol}=${r.feValue} ↔ BE ${r.be.symbol}=${r.beValue}`,
    );
  }

  const bad = diffConstants(rows);
  if (bad.length) {
    console.error(
      `\n[check-shared-constants] ${bad.length} 個共用常數前後端不一致或解析失敗——` +
        `請修正其中一邊使其相符（兩邊都是 source of truth，值須相同）。`,
    );
    process.exit(1);
  }
  console.log(`\n[check-shared-constants] ${rows.length} 個共用常數前後端一致 ✓`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
