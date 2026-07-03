/**
 * 跨端 entry chunk 邊界守衛（post-build）。
 *
 * 為什麼需要：prod build 中三個 entry（index / public / parent）各自的「靜態可達」
 * chunk 集合必須維持隔離——否則 rollup 會把三端共用檔（如 ErrorBoundary.vue /
 * chunkSelfHeal.ts）吸進 parent-app chunk，逼 admin（index）與公開報名（public）
 * entry 靜態 import 整包 parent-app（家長 LIFF app boot：殭屍 mount、每次載頁必打
 * /api/parent 401、401 後改寫 location.hash 摧毀 deep link）。同型回歸已發生多次
 * （design-tokens.css / __vitePreload helper / ErrorBoundary+chunkSelfHeal），
 * 此守衛把「entry 邊界不得漂移」變成 build 期可強制的斷言。
 *
 * 做法：
 *  1. 從各 entry HTML 收集 <script src> 與 <link rel=modulepreload href> 引用的 assets
 *     （= 該 entry 首屏「阻塞式」靜態載入的種子集合）。
 *  2. 從種子出發，遞迴解析每個 JS chunk 開頭的「靜態」import / export-from 述句
 *     （動態 import("./x.js") 有括號、不含 from，天然被排除），求靜態可達 chunk 集合。
 *  3. 斷言：index / public 的可達集合不含 parent-app-* 與 liff-*；
 *          parent 的可達集合不含 admin-core-*。
 *  4. 任一違規 → 印出「哪個 entry 經哪條邊到達哪個違規 chunk」的完整路徑，exit 1。
 *
 * 注意：.mjs 為前端 TS-only 規範明列的允許例外（build 工具腳本）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DIST = join(SCRIPT_DIR, '..', 'dist')
const ASSETS = join(DIST, 'assets')

// entry HTML → 規則：該 entry 的靜態可達集合不得命中 forbidden 內任一 pattern
const ENTRIES = [
  {
    name: 'index',
    html: join(DIST, 'index.html'),
    forbidden: [/^parent-app-/, /^liff-/],
    reason: '管理端 index 不得靜態可達家長 App / LIFF chunk',
  },
  {
    name: 'public',
    html: join(DIST, 'public.html'),
    forbidden: [/^parent-app-/, /^liff-/],
    reason: '公開報名 public 不得靜態可達家長 App / LIFF chunk',
  },
  {
    name: 'parent',
    html: join(DIST, 'parent.html'),
    forbidden: [/^admin-core-/],
    reason: '家長端 parent 不得靜態可達 admin-core chunk',
  },
]

// C2（2026-07-02 系統設計檢視）：每 entry「靜態可達（首屏阻塞）」chunk 集合的 gz 大小
// 預算（KB）。超出即 exit 1，防止首屏體積悄悄漂大的回歸（例如 admin index 曾漂到含
// portal+activity-admin+fullcalendar+qrcode 的 eager 載入）。數值以本次真實 build 的
// 印出值 + ~12% headroom 校準；刻意成長時對照印出值上調。
// 校準基準（真實 build 首屏 gz）：index 675.7 / public 174.5（2026-07-02）；
// parent 216.5（2026-07-03，useParentLogout 改 lazy liff 後由 245.9 降下）。
// 下方為 +~12% headroom；刻意成長時對照 build 印出值上調。
const ENTRY_BUDGETS_KB = {
  index: 760,
  public: 200,
  parent: 245,
}

if (!existsSync(ASSETS)) {
  console.error(`[check-entry-chunks] 找不到 ${ASSETS}，請先執行 npm run build`)
  process.exit(1)
}

const assetJsFiles = new Set(readdirSync(ASSETS).filter((f) => f.endsWith('.js')))

/** 把 import 規格（./x.js、/assets/x.js…）解析成 dist/assets 內真實存在的 JS 檔名，否則 null。 */
function resolveAsset(spec) {
  if (!spec) return null
  const clean = spec.split('?')[0].split('#')[0]
  if (!clean.endsWith('.js')) return null
  const b = basename(clean)
  return assetJsFiles.has(b) ? b : null
}

/** 從 entry HTML 收集種子 asset（<script src> + <link rel=modulepreload href>）。 */
function seedAssetsFromHtml(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8')
  const seeds = new Set()
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(m[0])?.[1]
    const a = resolveAsset(src)
    if (a) seeds.add(a)
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/\brel=["']modulepreload["']/i.test(tag)) continue
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]
    const a = resolveAsset(href)
    if (a) seeds.add(a)
  }
  return seeds
}

/** 解析單一 chunk 開頭的「靜態」import / export-from 目標 chunk（動態 import 不含 from、不以裸引號緊接，天然排除）。 */
function staticImportsOf(assetFile) {
  const code = readFileSync(join(ASSETS, assetFile), 'utf8')
  const deps = new Set()
  // 裸副作用 import"./x.js"（前綴為檔首 / ; / 空白 / } / {，排除 import( 動態）
  for (const m of code.matchAll(/(?:^|[;\s{}])import\s*["']([^"']+)["']/g)) {
    const a = resolveAsset(m[1])
    if (a) deps.add(a)
  }
  // import ... from"./x.js" / export ... from"./x.js"（動態 import() 無 from）
  for (const m of code.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
    const a = resolveAsset(m[1])
    if (a) deps.add(a)
  }
  return deps
}

/** 從種子出發 BFS 求靜態可達集合；edgeFrom 記錄每個 chunk 的首次發現邊供路徑回溯。 */
function computeReachable(entry) {
  const seeds = seedAssetsFromHtml(entry.html)
  const visited = new Set()
  const edgeFrom = new Map() // asset → 上游（chunk 檔名）或 '<html>'
  const queue = []
  for (const s of seeds) {
    if (!visited.has(s)) {
      visited.add(s)
      edgeFrom.set(s, '<html>')
      queue.push(s)
    }
  }
  while (queue.length) {
    const cur = queue.shift()
    for (const dep of staticImportsOf(cur)) {
      if (!visited.has(dep)) {
        visited.add(dep)
        edgeFrom.set(dep, cur)
        queue.push(dep)
      }
    }
  }
  return { visited, edgeFrom }
}

/** 回溯從 entry HTML 到 target chunk 的邊路徑，回傳可讀字串。 */
function tracePath(entryName, target, edgeFrom) {
  const chain = [target]
  let cur = target
  const guard = new Set([target])
  while (true) {
    const up = edgeFrom.get(cur)
    if (!up || up === '<html>') {
      chain.push(`${entryName}.html`)
      break
    }
    if (guard.has(up)) break // 防環（理論上 BFS 首次邊無環）
    guard.add(up)
    chain.push(up)
    cur = up
  }
  return chain.reverse().join('\n      → ')
}

let failed = false
for (const entry of ENTRIES) {
  if (!existsSync(entry.html)) {
    console.error(`[check-entry-chunks] 找不到 entry HTML：${entry.html}`)
    failed = true
    continue
  }
  const { visited, edgeFrom } = computeReachable(entry)

  // C2：量測此 entry 靜態可達集合的 gz 總量（≈ 首屏阻塞 JS 體積）。budget=0 為量測模式
  // （只印不強制），設定實際預算後超標即算 fail。
  let gzBytes = 0
  for (const f of visited) {
    gzBytes += gzipSync(readFileSync(join(ASSETS, f))).length
  }
  const gzKb = gzBytes / 1024
  const budgetKb = ENTRY_BUDGETS_KB[entry.name] || 0
  const overBudget = budgetKb > 0 && gzKb > budgetKb
  console.log(
    `[check-entry-chunks] ${entry.name}：靜態可達 ${visited.size} chunk，` +
      `首屏 gz ${gzKb.toFixed(1)}KB` +
      (budgetKb > 0 ? ` / 預算 ${budgetKb}KB${overBudget ? ' ✗ 超標' : ' ✓'}` : ' (量測模式，未設預算)')
  )
  if (overBudget) {
    failed = true
    console.error(
      `\n[check-entry-chunks] ✗ ${entry.name}：首屏 gz ${gzKb.toFixed(1)}KB 超過預算 ${budgetKb}KB。` +
        `修法：把新拖入首屏的重依賴改 lazy（dynamic import）或 peel 成獨立 chunk；` +
        `若為刻意成長，校準後上調 ENTRY_BUDGETS_KB。`
    )
  }

  const violations = [...visited].filter((f) => entry.forbidden.some((re) => re.test(f)))
  if (violations.length === 0) {
    continue
  }
  failed = true
  console.error(`\n[check-entry-chunks] ✗ ${entry.name}：${entry.reason}`)
  for (const v of violations) {
    console.error(`  違規 chunk：${v}`)
    console.error(`    靜態可達路徑：\n      ${tracePath(entry.name, v, edgeFrom)}`)
  }
}

if (failed) {
  console.error('\n[check-entry-chunks] 失敗：entry chunk 邊界漂移。')
  console.error('  修法：在 vite.config.js manualChunks 把跨端共用檔 pin 進 shared-common，')
  console.error('  切斷其他 entry 對 parent-app / liff / admin-core 的靜態橋接。')
  process.exit(1)
}

console.log('\n[check-entry-chunks] 全部通過：三 entry chunk 邊界隔離正確。')
