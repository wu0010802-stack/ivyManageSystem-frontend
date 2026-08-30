#!/usr/bin/env node
/**
 * 依賴 CVE gate：全樹掃描（含 devDependencies），但允許少數「上游鎖死、
 * 無版本可升」的 advisory 以具名、具到期日的方式豁免。
 *
 * Why 不用 `npm audit --omit=dev`：
 *   build/CI 依賴可讀取原始碼、token 與生成物，是真實的信任邊界，略過整棵
 *   dev 樹等於放棄這個邊界的防護。tests/unit/ci/sentryWorkflow.test.ts 有
 *   對應的守則測試，明確禁止 --omit=dev / --production。
 *
 * Why 需要豁免機制：
 *   若 gate 因為無解的 advisory 永遠紅燈，main 的必要檢查等同卡死、任何 PR
 *   都合不進來，所有掃描反而一起失效。具名豁免讓「已知無解」與「新出現的
 *   漏洞」能夠區分開來。
 *
 * 豁免不是永久的：每筆都必須有 expires，過期即讓 gate 轉紅，強制重新檢討。
 * 另外，當某筆豁免對應的漏洞已經消失（上游修好了），會提示應該把它刪掉，
 * 避免 allowlist 長年累積成為橡皮圖章。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const allowlistPath = resolve(here, '../.github/audit-allowlist.json')

const THRESHOLD = ['moderate', 'high', 'critical']

function runAudit() {
  try {
    // 有漏洞時 npm audit 以非 0 結束，stdout 仍是完整 JSON，故不能讓它拋出。
    return execFileSync('npm', ['audit', '--audit-level=moderate', '--json'], {
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (e) {
    if (typeof e.stdout === 'string' && e.stdout.trim()) return e.stdout
    throw e
  }
}

function parseAuditReport(raw) {
  const report = JSON.parse(raw)
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('npm audit 未回傳物件格式報告')
  }
  if (report.error) {
    const code = typeof report.error.code === 'string' ? ` (${report.error.code})` : ''
    throw new Error(`npm audit 執行失敗${code}`)
  }
  if (
    !Object.hasOwn(report, 'vulnerabilities')
    || !report.vulnerabilities
    || typeof report.vulnerabilities !== 'object'
    || Array.isArray(report.vulnerabilities)
  ) {
    throw new Error('npm audit 報告缺少 vulnerabilities，拒絕視為零弱點')
  }
  if (!report.metadata || typeof report.metadata !== 'object') {
    throw new Error('npm audit 報告缺少 metadata，無法確認掃描完整性')
  }
  return report
}

let report
try {
  report = parseAuditReport(runAudit())
} catch (error) {
  console.error(`✖ 依賴掃描工具執行失敗：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf-8'))
const allowed = new Map(allowlist.allow.map((entry) => [entry.package, entry]))

// 取「台北今天」的 YYYY-MM-DD。不可用 toISOString()——那是 UTC，台北時間
// 08:00 前會落在前一天，讓豁免多活一天。專案的 todayISO / dateToLocalISO 位於
// src/utils/format.ts，是前端 TS，這支 Node CLI 無法直接 import，故就地以
// sv-SE locale 取得等價的 ISO 格式輸出。
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
const blocking = []
const honoured = []
const expired = []

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!THRESHOLD.includes(vuln.severity)) continue
  const exemption = allowed.get(name)
  if (!exemption) {
    blocking.push({ name, severity: vuln.severity })
    continue
  }
  if (exemption.expires < today) {
    expired.push({ name, severity: vuln.severity, expires: exemption.expires })
    continue
  }
  honoured.push({ name, severity: vuln.severity, ...exemption })
}

const seen = new Set(Object.keys(report.vulnerabilities ?? {}))
const stale = allowlist.allow.filter((entry) => !seen.has(entry.package))

for (const entry of honoured) {
  console.log(`· 已豁免 ${entry.package} (${entry.severity}) — ${entry.reason}｜到期 ${entry.expires}`)
}
for (const entry of stale) {
  console.log(`⚠ ${entry.package} 已無對應漏洞，請從 .github/audit-allowlist.json 移除`)
}

if (expired.length) {
  console.error('\n✖ 以下豁免已過期，必須重新檢討（上游是否已可升級？）：')
  for (const entry of expired) console.error(`  - ${entry.name} (${entry.severity})，到期日 ${entry.expires}`)
}
if (blocking.length) {
  console.error('\n✖ 以下 moderate 以上漏洞不在豁免清單內：')
  for (const entry of blocking) console.error(`  - ${entry.name} (${entry.severity})`)
  console.error('\n請升級依賴；確認無版本可升時，才在 .github/audit-allowlist.json 具名豁免並附到期日。')
}

if (expired.length || blocking.length) process.exit(1)

console.log(`\n✓ 依賴掃描通過：${honoured.length} 筆具名豁免，無其他 moderate 以上漏洞。`)
