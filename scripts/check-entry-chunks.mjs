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
 *          index 也不含 portal / activity-admin / fullcalendar / qrcode lazy feature；
 *          parent 的可達集合不含 admin-core-*。
 *  4. 斷言三個 entry 各自只有一個正確 manifest，且 start_url 符合該 entry。
 *  5. 任一違規 → 印出「哪個 entry 經哪條邊到達哪個違規 chunk」的完整路徑，exit 1。
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
    forbidden: [
      /^parent-app-/,
      /^liff-/,
      // Activity / Portal 不再強制併成單一 manual chunk，Rollup 會沿用
      // route view / composable 檔名產生 PortalHomeView-* / activity-* /
      // usePortal*-* 等 lazy chunk。必須禁整個前綴族群，否則只禁舊的
      // portal-* / activity-admin-* 會漏接改名後的 feature 首屏漂移。
      /^(?:Portal|portal|Activity|activity|usePortal|useActivity)/,
      /^fullcalendar-/,
      /^qrcode-/,
    ],
    reason: '管理端 index 不得靜態可達家長 App / LIFF 或 lazy feature chunk',
    routeEntryForbidden: [/^parent-app-/, /^public-app-/],
    manifestHref: '/manifest.webmanifest',
    manifestName: '{{TB_MANIFEST_ADMIN_NAME}}',
    manifestStartUrl: './',
    manifestScope: './',
  },
  {
    name: 'public',
    html: join(DIST, 'public.html'),
    forbidden: [/^parent-app-/, /^liff-/],
    reason: '公開報名 public 不得靜態可達家長 App / LIFF chunk',
    routeEntryForbidden: [/^parent-app-/, /^liff-/],
    manifestHref: '/public.webmanifest',
    manifestName: '{{TB_MANIFEST_PUBLIC_NAME}}',
    manifestStartUrl: '/public.html',
    manifestScope: '/public.html',
  },
  {
    name: 'parent',
    html: join(DIST, 'parent', 'index.html'),
    forbidden: [/^admin-core-/],
    reason: '家長端 parent 不得靜態可達 admin-core chunk',
    routeEntryForbidden: [/^public-app-/],
    manifestHref: '/parent.webmanifest',
    manifestName: '{{TB_MANIFEST_PARENT_NAME}}',
    manifestStartUrl: '/parent/',
    manifestScope: '/parent/',
  },
]

// C2（2026-07-02 系統設計檢視）：每 entry「靜態可達（首屏阻塞）」chunk 集合的 gz 大小
// 預算（KB）。超出即 exit 1，防止首屏體積悄悄漂大的回歸（例如 admin index 曾漂到含
// portal+activity-admin+fullcalendar+qrcode 的 eager 載入）。數值以本次真實 build 的
// 印出值 + ~12% headroom 校準；刻意成長時對照印出值上調。
// 校準基準（真實 build 首屏 gz）：index 276.2（2026-07-20，Element Plus 改依
// import graph 自然分塊，不再把 lazy route 元件全塞入首屏）；public 175.5；
// parent 219.0。下方為約 12% headroom；刻意成長時對照 build 印出值上調。
// 多租戶（4d/fb，scan-frontend GAP-02）：`manifestName` 期望值改為 **token 字面**。
// dist 的 *.webmanifest 現在存的是 `{{TB_MANIFEST_*_NAME}}`，真正的品牌值由 nginx
// `sub_filter` 依 $host 逐請求注入。這條斷言因此反向鎖住「不得退回硬編品牌字面」：
// 有人把中文名寫回 manifest 就會在這裡 exit 1。
// `manifestStartUrl` / `manifestScope` 的斷言**保留原樣**——那是 entry 邊界契約
// （哪個 HTML 對應哪個 PWA scope），與品牌無關，不得一起 token 化。

const ENTRY_BUDGETS_KB = {
  index: 310,
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

/** 收集 entry HTML 宣告的 web manifest；多入口必須恰好一個且指向該 entry 自己的 manifest。 */
function manifestHrefsFromHtml(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8')
  const hrefs = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/\brel=["']manifest["']/i.test(tag)) continue
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]
    if (href) hrefs.push(href)
  }
  return hrefs
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

/**
 * 解析單一 chunk 的「動態」import 目標：import("./x.js") 與 Vite 的 __vite__mapDeps
 * 依賴表（lazy route 的 preload 清單）。
 *
 * 只看靜態邊會漏掉真正的危害路徑：lazy route chunk 本身雖是動態載入，但它一旦被載入，
 * 它的靜態 import 就會同步執行。公開頁 `/` redirect 到 `/activity`，該 route chunk
 * 等同首屏——它靜態 import parent-app 就會執行家長端 main.ts 並 mount 搶佔畫面。
 */
function dynamicImportsOf(assetFile) {
  const code = readFileSync(join(ASSETS, assetFile), 'utf8')
  const deps = new Set()
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const a = resolveAsset(m[1])
    if (a) deps.add(a)
  }
  // __vite__mapDeps 依賴表：["assets/x.js","assets/y.css",…]
  for (const m of code.matchAll(/["']((?:\.\/|\/)?assets\/[^"']+\.js)["']/g)) {
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

  const manifestHrefs = manifestHrefsFromHtml(entry.html)
  if (manifestHrefs.length !== 1 || manifestHrefs[0] !== entry.manifestHref) {
    failed = true
    console.error(
      `\n[check-entry-chunks] ✗ ${entry.name}：manifest 必須唯一且為 ${entry.manifestHref}；` +
        `實際為 ${manifestHrefs.length ? manifestHrefs.join(', ') : '(無)'}`
    )
  } else {
    const manifestPath = join(DIST, entry.manifestHref.replace(/^\//, ''))
    if (!existsSync(manifestPath)) {
      failed = true
      console.error(`\n[check-entry-chunks] ✗ ${entry.name}：找不到 manifest ${manifestPath}`)
    } else {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const expectedFields = {
          name: entry.manifestName,
          start_url: entry.manifestStartUrl,
          scope: entry.manifestScope,
        }
        for (const [field, expected] of Object.entries(expectedFields)) {
          if (manifest[field] === expected) continue
          failed = true
          console.error(
            `\n[check-entry-chunks] ✗ ${entry.name}：manifest ${field} 必須為 ` +
              `${expected}；實際為 ${String(manifest[field])}`
          )
        }
      } catch (error) {
        failed = true
        console.error(`\n[check-entry-chunks] ✗ ${entry.name}：manifest 不是合法 JSON：${String(error)}`)
      }
    }
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
  if (violations.length > 0) {
    failed = true
    console.error(`\n[check-entry-chunks] ✗ ${entry.name}：${entry.reason}`)
    for (const v of violations) {
      console.error(`  違規 chunk：${v}`)
      console.error(`    靜態可達路徑：\n      ${tracePath(entry.name, v, edgeFrom)}`)
    }
  }

  // 路由層：entry 的 router 直接 dynamic import 的 route chunk，一旦該路由被開啟就會
  // 同步執行它的靜態 import——若那指向 forbidden chunk，等於在本 entry 執行對方 entry
  // 的 main.ts 副作用。2026-08-03 prod 事故：weekdaySchedule.ts 漏 pin 落入 parent-app，
  // 公開頁 ActivityPublicView 靜態 import 之 → 家長 App mount('#app') 搶佔公開報名頁並
  // 導向 LIFF 登入。上面那層只從 entry HTML 種子追靜態邊，看不到這條路徑。
  //
  // 刻意只展開「一跳」dynamic：再往下遞迴會沿著 chunk 間的 lazy 邊走遍全圖
  // （admin 對話框 → admin-core 之類與本 entry 無關的邊），全是雜訊。
  const routeChunks = new Set()
  for (const chunk of visited) {
    for (const dep of dynamicImportsOf(chunk)) {
      if (!visited.has(dep)) routeChunks.add(dep)
    }
  }
  // 只擋「對方 entry chunk」（含該端 main.ts 的 mount 副作用），不擋 admin-core 這類
  // 純 utilities——後者橋接只是體積問題，由上面的靜態層與 gz 預算把關。
  const routeForbidden = entry.routeEntryForbidden || []
  const routeViolations = []
  for (const chunk of routeChunks) {
    if (routeForbidden.some((re) => re.test(chunk))) continue // 自身即禁區，由靜態層回報
    for (const dep of staticImportsOf(chunk)) {
      if (routeForbidden.some((re) => re.test(dep))) routeViolations.push([chunk, dep])
    }
  }
  if (routeViolations.length > 0) {
    failed = true
    console.error(`\n[check-entry-chunks] ✗ ${entry.name}（路由可達）：${entry.reason}`)
    for (const [importer, dep] of routeViolations) {
      console.error(`  違規靜態邊：${importer}\n      → ${dep}`)
    }
    console.error(
      '  修法：把該邊上的跨端共用檔 pin 進 shared-common（vite.config.js manualChunks），' +
        '切斷 route chunk 對他端 entry chunk 的靜態依賴。'
    )
  }
}

if (failed) {
  console.error('\n[check-entry-chunks] 失敗：entry chunk 邊界漂移。')
  console.error('  修法：檢查 vite.config.js manualChunks 與靜態 import 邊；跨端共用檔')
  console.error('  放入 shared-common，lazy feature 不要用過寬的 feature-wide manual chunk 併塊。')
  process.exit(1)
}

console.log('\n[check-entry-chunks] 全部通過：三 entry chunk 邊界與 manifest 隔離正確。')
