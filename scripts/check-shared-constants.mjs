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
    fe: { file: "src/constants/activity.ts", symbol: "GRADE_TARGET_BONUS" },
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
  // 2026-10-30：產假／流產假扣薪說明文字以此門檻組字（滿 N 個月不扣、未滿減半）。
  {
    label: "產假全薪年資門檻（月）",
    fe: { file: "src/utils/leaves.ts", symbol: "MATERNITY_FULL_PAY_SENIORITY_MONTHS" },
    be: { file: "services/leave_quota_calc.py", symbol: "MATERNITY_FULL_PAY_SENIORITY_MONTHS" },
  },
];

// 假別代碼集合：前端 LEAVE_TYPES 的 value 必須與後端 LEAVE_TYPE_LABELS 的鍵完全相同，
// 避免後端新增／改名假別後前端下拉選單與扣薪說明沒跟上。
export const SHARED_KEY_SETS = [
  {
    label: "假別代碼",
    fe: { file: "src/utils/leaves.ts", symbol: "LEAVE_TYPES" },
    be: { file: "utils/constants.py", symbol: "LEAVE_TYPE_LABELS" },
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

/** 以頂層逗號切欄（略過巢狀括號內的逗號，如 `date(2026, 1, 1)`）。 */
function splitTopLevel(text) {
  const cells = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * 解析 python `NAME = TABLE[-1][i]`：取 `TABLE … = (` 這張 tuple 表最後一列的第 i 欄。
 * 後端基本工資 2026-10-22 起改年度表（services/salary/minimum_wage.py），常數取表尾一列。
 * 只支援 [-1]；表不存在、欄位不是數字一律回 null（呼叫端視為失敗）。
 */
export function parseTableLastRowRef(source, symbol) {
  const ref = source.match(new RegExp(`^${symbol}\\s*=\\s*(\\w+)\\[-1\\]\\[(\\d+)\\]`, "m"));
  if (!ref) return null;
  const [, table, col] = ref;
  const start = source.match(new RegExp(`^${table}\\b[^=\\n]*=\\s*\\(`, "m"));
  if (!start) return null;

  // 逐字追括號深度，收集表內每一列（深度 2 的 `( … )`）
  const rows = [];
  let depth = 1;
  let rowStart = -1;
  for (let i = start.index + start[0].length; i < source.length && depth > 0; i++) {
    const ch = source[i];
    if (ch === "(") {
      depth++;
      if (depth === 2) rowStart = i + 1;
    } else if (ch === ")") {
      if (depth === 2 && rowStart >= 0) rows.push(source.slice(rowStart, i));
      depth--;
    }
  }
  if (!rows.length) return null;

  const cell = splitTopLevel(rows[rows.length - 1])[Number(col)]?.trim();
  if (!cell || !/^[0-9_]+(?:\.[0-9]+)?$/.test(cell)) return null;
  return Number(cell.replace(/_/g, ""));
}

/** 取出 `NAME … = {` 或 `NAME … = [` 開頭、到配對收尾括號為止的區塊文字；找不到回 null。 */
function sliceBlock(source, symbol) {
  const start = source.match(new RegExp(`^(?:export\\s+const\\s+)?${symbol}\\b[^=\\n]*=\\s*([\\[{])`, "m"));
  if (!start) return null;
  const open = start[1];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start.index + start[0].length - 1; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return source.slice(start.index, i + 1);
  }
  return null;
}

/** 解析 python dict `NAME: dict[str, str] = { "key": ... }` 的字串鍵；解析不到回 null。 */
export function parseObjectKeys(source, symbol) {
  const block = sliceBlock(source, symbol);
  if (!block) return null;
  const keys = [...block.matchAll(/^\s*["']([A-Za-z0-9_]+)["']\s*:/gm)].map((m) => m[1]);
  return keys.length ? keys : null;
}

/** 解析 TS 陣列 `export const NAME = [ { value: 'key', ... }, ... ]` 的 value 欄；解析不到回 null。 */
export function parseArrayValueKeys(source, symbol) {
  const block = sliceBlock(source, symbol);
  if (!block) return null;
  const keys = [...block.matchAll(/\bvalue:\s*["']([A-Za-z0-9_]+)["']/g)].map((m) => m[1]);
  return keys.length ? keys : null;
}

/** 兩邊鍵集合差異；任一側為 null 視為解析失敗。 */
export function diffKeySet(feKeys, beKeys) {
  if (!feKeys || !beKeys) return { ok: false, onlyFe: [], onlyBe: [] };
  const fe = new Set(feKeys);
  const be = new Set(beKeys);
  const onlyFe = [...fe].filter((k) => !be.has(k));
  const onlyBe = [...be].filter((k) => !fe.has(k));
  return { ok: onlyFe.length === 0 && onlyBe.length === 0, onlyFe, onlyBe };
}

function readSource(rootDir, fileRel) {
  const path = resolve(rootDir, fileRel);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
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
  const source = readFileSync(path, "utf8");
  return parseNumericConst(source, symbol) ?? parseTableLastRowRef(source, symbol);
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

  let keySetBad = 0;
  for (const k of SHARED_KEY_SETS) {
    const feSrc = readSource(feRoot, k.fe.file);
    const beSrc = readSource(beRoot, k.be.file);
    const feKeys = feSrc === null ? null : parseArrayValueKeys(feSrc, k.fe.symbol);
    const beKeys = beSrc === null ? null : parseObjectKeys(beSrc, k.be.symbol);
    const d = diffKeySet(feKeys, beKeys);
    if (!d.ok) keySetBad++;
    const detail = !feKeys || !beKeys
      ? `FE ${k.fe.symbol}=${feKeys ? feKeys.length : "null"} ↔ BE ${k.be.symbol}=${beKeys ? beKeys.length : "null"}`
      : `僅前端 [${d.onlyFe.join(", ")}]；僅後端 [${d.onlyBe.join(", ")}]`;
    console.log(`[${d.ok ? "OK   " : "DRIFT"}] ${k.label}: ${d.ok ? `${feKeys.length} 個一致` : detail}`);
  }

  const bad = diffConstants(rows);
  if (bad.length || keySetBad) {
    console.error(
      `\n[check-shared-constants] ${bad.length + keySetBad} 個共用常數／代碼集合前後端不一致或解析失敗——` +
        `請修正其中一邊使其相符（兩邊都是 source of truth，值須相同）。`,
    );
    process.exit(1);
  }
  console.log(`\n[check-shared-constants] ${rows.length} 個共用常數前後端一致 ✓`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
