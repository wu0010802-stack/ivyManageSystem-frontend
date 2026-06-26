# 手機端優化 Phase 1（共用基建 Quick Wins）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用最少、最低風險的共用基建改動，關掉跨三端最廣的手機破口（safe-area 失效、iOS 輸入放大、離線白屏、box-sizing 溢出），並折進唯一 P0（Portal 手機側欄功能不可達）。

**Architecture:** 改動集中在四份全域 CSS / 三個 entry HTML+main.ts / vite PWA 設定 / 單一 `PortalLayout`。`index.html` 補 `viewport-fit=cover` 是 safe-area 根因（既有 `env()` 規則立即復活）；chunk self-heal 抽成共用 util 三端各呼叫一次；Portal 加漢堡 opener（既有側欄機制只缺觸發點）。純基建/additive，不重設計頁面、不碰 RWD 軌的 isMobile 收斂。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Vite 5、Element Plus 2.5、PostCSS、Vitest 4 + @vue/test-utils（happy-dom）、vite-plugin-pwa（workbox）。

## Global Constraints

- **繁體中文**：所有註解、commit message、docstring、noscript 文案一律繁中。
- **TS-only / strict**：`src/` 業務碼 100% TypeScript；新檔/新 SFC `<script setup lang="ts">`；**禁 `: any` / `as any`**，用 `: unknown` + narrow。`noUnusedLocals: true` + CI typecheck blocking——移除 inline self-heal 後若有未使用 import 必須刪除。
- **手機斷點**：新增手機 `@media` **一律寫 `max-width: 767.98px`**（= RWD canonical `MOBILE_MAX_PX`）；**不**自行接 postcss custom-media（RWD 軌基建）。
- **PortalLayout additive 邊界**：**只**加漢堡鍵 template / CSS 與 bottom-nav safe-area；**不碰** `isMobile` ref / `checkMobile` / resize listener（`PortalLayout.vue:41-46,181,213`，屬 RWD P0 範圍）。
- **不可**用 `maximum-scale=1` 關縮放（傷無障礙）。
- **測試指令**：單檔 `npx vitest run <path>`；全量 `npm run test`；型別 `npm run typecheck`；CSS lint `npm run lint:css`；build `npm run build`。
- **家長端三測試樹**：改動觸及家長元件 markup 時，回歸需跑 `npm run test -- --run src/parent tests/unit/parent tests/parent`（本 Phase C2/C3 觸及家長全域 CSS，回歸以全量 `npm run test` 涵蓋）。
- **Conventional Commits**：一個 commit 一件事；繁中訊息；trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **共用 main 多 session 並行**：commit 前 `git add` **只加本任務檔**，**不** `git add -A`；遇 `index.lock` 先確認無 active git 程序再重試，勿強刪。

---

### Task 1: `index.html` 補 viewport-fit + theme-color + noscript（C1，safe-area 根因）

**Files:**
- Modify: `index.html:9-10`（viewport + theme-color）、`index.html:18-20`（body 加 noscript）
- Test: `tests/unit/mobile/viewportMeta.spec.ts`（新建，三 entry drift guard）

**Interfaces:**
- Produces: 無程式介面；解鎖 admin/portal 既有 `env(safe-area-inset-*)` 規則（C7 的 bottom-nav 與 `el-main:897` 依賴此根因）。

- [ ] **Step 1: 寫失敗測試**（三 entry HTML 都必須有 `viewport-fit=cover`）

`tests/unit/mobile/viewportMeta.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('viewport meta — 三 entry 對齊（safe-area 生效前提）', () => {
  it.each(['index.html', 'parent.html', 'public.html'])(
    '%s 的 viewport 含 viewport-fit=cover',
    (file) => {
      const html = read(file)
      const viewport = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? ''
      expect(viewport).toContain('viewport-fit=cover')
    },
  )

  it('index.html theme-color 為 admin indigo #4f46e5', () => {
    expect(read('index.html')).toContain('content="#4f46e5"')
  })

  it('index.html 提供 noscript fallback', () => {
    expect(read('index.html')).toContain('<noscript>')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/viewportMeta.spec.ts`
Expected: FAIL（`index.html` 無 `viewport-fit=cover`、theme-color 仍 `#3f7d48`、無 noscript）

- [ ] **Step 3: 改 `index.html`**

`:9` 改為：
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```
`:10` 改為：
```html
    <meta name="theme-color" content="#4f46e5">
```
`<body>` 內（`<div id="app"></div>` 前）加：
```html
    <noscript>本系統需啟用 JavaScript 才能使用。請開啟瀏覽器的 JavaScript 後重新整理。</noscript>
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npx vitest run tests/unit/mobile/viewportMeta.spec.ts`
Expected: PASS（5 例全綠）

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/mobile/viewportMeta.spec.ts
git commit -m "fix(mobile): index.html 補 viewport-fit=cover + theme-color + noscript

iOS 無 viewport-fit 時 env(safe-area-inset-*) 一律回 0，
讓 admin/portal 既有 safe-area 規則失效；補齊後整批立即生效。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: iOS 輸入框 16px 保底（C2，三端最普遍痛點）

**Files:**
- Modify: `src/parent/styles/globals.css`（家長端全域 input 保底）、`src/assets/main.css`（portal/admin 手機 el-input）
- Test: `tests/unit/mobile/inputFontSize.spec.ts`（新建，regression guard）

**Interfaces:**
- Consumes: 無。
- Produces: 無程式介面。

> 註：全域 CSS 在 happy-dom 單元測試不會套用 computed style，故以「檔案內容 regression guard」+ build/裝置模擬驗證，非 computed-style 測試。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/mobile/inputFontSize.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('iOS 輸入 16px 保底（消除聚焦放大）', () => {
  it('家長端 globals.css 有全域 input/textarea/select 16px 保底', () => {
    const css = read('src/parent/styles/globals.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px/)
  })

  it('portal/admin main.css 在手機斷點放大 el-input 至 16px', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toContain('max-width: 767.98px')
    expect(css).toMatch(/\.el-input__inner[^}]*font-size:\s*16px/)
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/inputFontSize.spec.ts`
Expected: FAIL（兩處規則皆未存在）

- [ ] **Step 3: 改家長端 `src/parent/styles/globals.css`**

在檔案合適的全域元素區塊加（沿用既有註解風格）：
```css
/* iOS / LINE LIFF WebView：font-size < 16px 的表單欄位聚焦會自動放大整頁。
   家長端為 100% 手機受眾，全域保底 16px（視覺密度由各元件 line-height 控制）。 */
input,
textarea,
select {
  font-size: 16px;
}
```

- [ ] **Step 4: 改 `src/assets/main.css`**（portal/admin 共用，只手機放大，桌機維持 14px 密度）

於檔案尾端（或既有 Element Plus override 區塊）加：
```css
/* iOS 聚焦放大防制：手機把 Element Plus 輸入欄位字級提到 16px；
   桌機維持 14px 密度。767.98px = RWD canonical MOBILE_MAX_PX。 */
@media (max-width: 767.98px) {
  .el-input__inner,
  .el-textarea__inner,
  .el-select__wrapper input {
    font-size: 16px;
  }
}
```

- [ ] **Step 5: 跑測試確認 GREEN + lint**

Run: `npx vitest run tests/unit/mobile/inputFontSize.spec.ts && npm run lint:css`
Expected: 測試 PASS；CSS lint 無新錯。

- [ ] **Step 6: Commit**

```bash
git add src/parent/styles/globals.css src/assets/main.css tests/unit/mobile/inputFontSize.spec.ts
git commit -m "fix(mobile): iOS 輸入框 16px 保底消除聚焦放大

家長端全域 input 保底 16px；portal/admin 手機斷點放大 el-input。
不用 maximum-scale 關縮放（傷無障礙）。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 全域 box-sizing reset + el-card hover 觸控守衛（C3+C4）

**Files:**
- Modify: `src/assets/design-tokens.css`（`:root` 之前加全域 reset）、`src/assets/main.css:166-169`（`.el-card:hover` 包 hover 守衛）
- Test: `tests/unit/mobile/sharedCssReset.spec.ts`（新建，regression guard）

**Interfaces:**
- Produces: 無；`design-tokens.css` 被 admin/parent/public 三端 entry 皆 import → reset 跨端生效。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/mobile/sharedCssReset.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('shared CSS 基建 reset', () => {
  it('design-tokens.css 有全域 box-sizing:border-box reset', () => {
    const css = read('src/assets/design-tokens.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/)
  })

  it('main.css 的 .el-card:hover 被 hover 能力守衛包覆', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[^@]*\.el-card:hover/)
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/sharedCssReset.spec.ts`
Expected: FAIL（無全域 reset；`.el-card:hover` 未被守衛）

- [ ] **Step 3: 改 `src/assets/design-tokens.css`**（檔案最前、`:root` 之前）

```css
/* 全域 box-sizing reset：含 padding 的全寬卡片/輸入框在窄機不再 content-box 溢出。
   三端 entry 皆 import 本檔，一次跨端生效。 */
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

- [ ] **Step 4: 改 `src/assets/main.css:166-169`**（`.el-card:hover` 包進 hover 守衛）

把：
```css
.el-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md) !important;
}
```
改為：
```css
/* 只在有真 hover 能力的指標裝置抬升；觸控裝置點過卡片不再卡在 hover 抬起態。 */
@media (hover: hover) and (pointer: fine) {
  .el-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md) !important;
  }
}
```

- [ ] **Step 5: 跑測試 + 型別 + build（box-sizing 為本 Phase 最需驗證項）**

Run: `npx vitest run tests/unit/mobile/sharedCssReset.spec.ts && npm run test && npm run build`
Expected: guard 測試 PASS；**全量回歸綠**（含家長三測試樹）；build 成功。
> 若 build/回歸出現非預期破版，個案在該元件局部 `box-sizing: content-box` 還原，不回退全域 reset。

- [ ] **Step 6: Commit**

```bash
git add src/assets/design-tokens.css src/assets/main.css tests/unit/mobile/sharedCssReset.spec.ts
git commit -m "fix(mobile): 全域 box-sizing reset + el-card hover 觸控守衛

design-tokens.css 全域 border-box 消除窄機橫向溢出；
.el-card:hover 包 @media(hover:hover) 避免觸控點擊卡 hover 態。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: chunk self-heal 抽共用 util 三端統一（C5）

**Files:**
- Create: `src/utils/chunkSelfHeal.ts`
- Modify: `src/main.ts:4-37`（移除 inline 版、改呼叫）、`src/parent/main.ts`（加呼叫）、`src/public/main.ts`（加呼叫）
- Test: `src/utils/__tests__/chunkSelfHeal.spec.ts`（新建）

**Interfaces:**
- Produces:
  - `looksLikeChunkLoadError(message?: string): boolean` — 純函式。
  - `installChunkSelfHeal(): void` — 掛 `error` + `unhandledrejection` 監聽，命中即清 SW+caches reload（`sessionStorage` flag 防迴圈）。

- [ ] **Step 1: 寫失敗測試**

`src/utils/__tests__/chunkSelfHeal.spec.ts`：
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { looksLikeChunkLoadError, installChunkSelfHeal } from '@/utils/chunkSelfHeal'

describe('looksLikeChunkLoadError', () => {
  it.each([
    'ChunkLoadError: Loading chunk 12 failed',
    'Loading chunk vendor-abc failed.',
    'Failed to fetch dynamically imported module: https://x/assets/a-123.js',
    'error loading dynamically imported module',
  ])('命中 chunk 載入錯誤：%s', (msg) => {
    expect(looksLikeChunkLoadError(msg)).toBe(true)
  })

  it('忽略無關錯誤與空字串', () => {
    expect(looksLikeChunkLoadError('TypeError: undefined is not a function')).toBe(false)
    expect(looksLikeChunkLoadError('')).toBe(false)
    expect(looksLikeChunkLoadError()).toBe(false)
  })
})

describe('installChunkSelfHeal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('掛上 error 與 unhandledrejection 兩個 window 監聽', () => {
    const spy = vi.spyOn(window, 'addEventListener')
    installChunkSelfHeal()
    const events = spy.mock.calls.map((c) => c[0])
    expect(events).toContain('error')
    expect(events).toContain('unhandledrejection')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/utils/__tests__/chunkSelfHeal.spec.ts`
Expected: FAIL（`Cannot find module '@/utils/chunkSelfHeal'`）

- [ ] **Step 3: 實作 `src/utils/chunkSelfHeal.ts`**

```ts
/**
 * PWA 升級自救：偵測到 chunk hash 已被新部署移除（dynamic import 失敗、
 * 或瀏覽器丟 ChunkLoadError）時，主動清掉 SW + caches 再 reload 一次，
 * 避免舊 SW 命中已死的 chunk 造成白屏。sessionStorage flag 防迴圈。
 *
 * 原僅 admin entry（src/main.ts）；抽成共用 util 供三端 entry 各呼叫一次。
 */
const SELF_HEAL_FLAG = '__ivy_chunk_self_heal__'

/** 純函式：訊息是否像 chunk 載入失敗（供測試與 listener 共用）。 */
export function looksLikeChunkLoadError(message = ''): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    message,
  )
}

async function selfHealAndReload(): Promise<void> {
  if (sessionStorage.getItem(SELF_HEAL_FLAG)) return
  sessionStorage.setItem(SELF_HEAL_FLAG, '1')
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    location.reload()
  }
}

/** 掛 error / unhandledrejection 監聽，命中 chunk 載入錯誤即自救。三端 entry 各呼叫一次。 */
export function installChunkSelfHeal(): void {
  window.addEventListener('error', (e: ErrorEvent) => {
    const errMsg = (e.error as { message?: string } | undefined)?.message
    const msg = e.message || errMsg || ''
    if (looksLikeChunkLoadError(msg)) void selfHealAndReload()
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string } | string | undefined
    const msg =
      (reason && (typeof reason === 'string' ? reason : reason.message || String(reason))) || ''
    if (looksLikeChunkLoadError(msg)) void selfHealAndReload()
  })
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npx vitest run src/utils/__tests__/chunkSelfHeal.spec.ts`
Expected: PASS

- [ ] **Step 5: 改 `src/main.ts`**（移除 inline:4-37，改 import + 呼叫）

把 `:1-37` 改為（保留 `import App` 等其後內容不動）：
```ts
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import { installChunkSelfHeal } from '@/utils/chunkSelfHeal'

// PWA 升級自救（chunk hash 失效時清 SW+caches reload，避免白屏）
installChunkSelfHeal()
```
（即刪掉原 `SELF_HEAL_FLAG`/`selfHealAndReload`/`looksLikeChunkLoadError`/兩個 `addEventListener` 共 34 行，換成 import + 一行呼叫。）

- [ ] **Step 6: 改 `src/parent/main.ts` 與 `src/public/main.ts`**（各加 import + 呼叫）

兩檔在 import 區塊加：
```ts
import { installChunkSelfHeal } from '@/utils/chunkSelfHeal'
```
並在 import 結束、`createApp(...)` 之前加一行：
```ts
installChunkSelfHeal()
```

- [ ] **Step 7: 型別 + build 驗證（確認無未使用 import、三 entry 皆編譯）**

Run: `npm run typecheck && npm run build`
Expected: PASS（admin 移除 inline 後無 `noUnusedLocals` 殘留；parent/public 正常 build）。

- [ ] **Step 8: Commit**

```bash
git add src/utils/chunkSelfHeal.ts src/utils/__tests__/chunkSelfHeal.spec.ts src/main.ts src/parent/main.ts src/public/main.ts
git commit -m "refactor(pwa): chunk self-heal 抽共用 util 三端統一

抽 src/main.ts 的 chunk 自救成 chunkSelfHeal.ts，parent/public
entry 各呼叫一次，修部署後 chunk hash 變導致家長/公開頁白屏無法自救。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: PWA 離線收斂（C6）

**Files:**
- Modify: `vite.config.js:296-317`（globPatterns 加兩 entry HTML；navigateFallbackDenylist 加 /public）
- Test: `tests/unit/mobile/pwaOffline.spec.ts`（新建，regression guard）

**Interfaces:**
- Consumes: 無。Produces: 無程式介面。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/mobile/pwaOffline.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cfg = () => readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf-8')

describe('PWA 離線收斂', () => {
  it('navigateFallbackDenylist 排除 /public（不被餵 admin 外殼）', () => {
    const c = cfg().replace(/\s+/g, ' ')
    const denylist = c.match(/navigateFallbackDenylist:\s*\[(.*?)\]/)?.[1] ?? ''
    expect(denylist).toContain('/public')
  })

  it('globPatterns 精快取 parent.html 與 public.html', () => {
    const c = cfg()
    expect(c).toContain("'parent.html'")
    expect(c).toContain("'public.html'")
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/pwaOffline.spec.ts`
Expected: FAIL（denylist 僅 /parent；globPatterns 無 parent/public.html）

- [ ] **Step 3: 改 `vite.config.js`**

`globPatterns`（:296-307）在 `'index.html',` 之後加：
```js
                    'parent.html',
                    'public.html',
```
`navigateFallbackDenylist`（:317）改為：
```js
                navigateFallbackDenylist: [
                    /^\/parent\.html/, /^\/parent\//,
                    /^\/public\.html/, /^\/public\//,
                ],
```

- [ ] **Step 4: 跑測試 + build（確認 SW precache manifest 生成、不爆）**

Run: `npx vitest run tests/unit/mobile/pwaOffline.spec.ts && npm run build`
Expected: 測試 PASS；build 成功；`dist/sw.js`（或 workbox precache manifest）含 `parent.html`/`public.html`。
> 建議裝置驗證（非自動）：`npm run preview` 後 DevTools → Network offline，重整 `/public.html`、`/parent.html` 應可開且不被導向 admin 外殼。

- [ ] **Step 5: Commit**

```bash
git add vite.config.js tests/unit/mobile/pwaOffline.spec.ts
git commit -m "fix(pwa): 離線 fallback 排除 /public + 精快取 parent/public app-shell

家長/公開頁離線或弱網重整不再被餵 admin 外殼，可離線開啟。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Portal 漢堡鍵 opener + bottom-nav safe-area（C7，解 P0）

**Files:**
- Modify: `src/layouts/PortalLayout.vue` — `:17`（icon import 加 `Fold`）、`:304`（el-aside 加 `id`）、`:477-479`（`.header-left` 加漢堡鍵）、`<style>` 加 `.portal-sidebar-toggle`、`.bottom-nav`（:813）safe-area、`.psp-fab`（:964）bottom
- Test: `tests/unit/layouts/PortalLayout.mobileSidebar.test.ts`（新建）

**Interfaces:**
- Consumes: 既有 `sidebarOpen` ref（:42）、`closeSidebar`（:218）、`.sidebar-overlay`（:302）、el-aside `.sidebar-open` class（:304）。
- Produces: 無程式介面。**不**修改 `isMobile`/`checkMobile`/resize（RWD 軌範圍）。

- [ ] **Step 1: 寫失敗測試**（沿用既有 `PortalLayout.test.ts` 的 mock 套組）

`tests/unit/layouts/PortalLayout.mobileSidebar.test.ts`：
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => ({ path: '/portal/home' }),
  useRouter: () => ({ push: vi.fn() }),
}))
let userInfoData: Record<string, unknown> = {}
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => userInfoData,
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
}))
vi.mock('@/api/portal', () => ({
  getSubstitutePendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
}))
vi.mock('@/api/dismissalCalls', () => ({
  getPortalPendingCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
}))
vi.mock('@/api/portalMessages', () => ({
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
}))
vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: vi.fn(() => Promise.resolve({ counts: {} })),
}))
vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(() => Promise.resolve()),
  endImpersonate: vi.fn(() => Promise.resolve({ data: { user: {} } })),
  impersonate: vi.fn(() => Promise.resolve({ data: { user: {} } })),
}))
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn(() => Promise.resolve({ data: [] })) }))
vi.mock('@/composables/usePortalSearch', () => ({
  usePortalSearch: () => ({ openPalette: vi.fn() }),
  installPortalSearchKeyboard: vi.fn(),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessageBox: Object.assign(vi.fn(() => Promise.resolve()), {
      alert: vi.fn(() => Promise.resolve()),
      confirm: vi.fn(() => Promise.resolve()),
    }),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const stubs = { PortalSearchPalette: true, OfflineIndicator: true, A11yMenu: true }
import PortalLayout from '@/layouts/PortalLayout.vue'

const SEL = '[data-test="portal-sidebar-toggle"]'

describe('PortalLayout — 手機漢堡鍵恢復側欄可達（P0）', () => {
  beforeEach(() => {
    localStorage.setItem('portal_layout_v', '1') // 防 onboarding setTimeout 干擾
    userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
  })
  afterEach(() => {
    window.innerWidth = 1024
  })

  it('手機寬度顯示漢堡鍵，點擊後側欄開啟', async () => {
    window.innerWidth = 375
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()

    const burger = wrapper.find(SEL)
    expect(burger.exists()).toBe(true)
    expect(wrapper.find('.el-aside').classes()).not.toContain('sidebar-open')

    await burger.trigger('click')
    expect(wrapper.find('.el-aside').classes()).toContain('sidebar-open')
    wrapper.unmount()
  })

  it('桌機寬度不顯示漢堡鍵', async () => {
    window.innerWidth = 1280
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(wrapper.find(SEL).exists()).toBe(false)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/layouts/PortalLayout.mobileSidebar.test.ts`
Expected: FAIL（漢堡鍵不存在 → 第一例 `burger.exists()` 為 false）

- [ ] **Step 3: 改 icon import（`PortalLayout.vue:17`）**

```ts
import { Search, Fold } from '@element-plus/icons-vue'
```

- [ ] **Step 4: el-aside 加 id（`:304`，供 aria-controls）**

在 `<el-aside ...>` 標籤加 `id="portal-sidebar"`（其餘屬性不動）。

- [ ] **Step 5: `.header-left` 加漢堡鍵（`:477-479`）**

把：
```html
          <div class="header-left">
            <h3>常春藤義華幼兒園 - 教職員考勤系統</h3>
          </div>
```
改為：
```html
          <div class="header-left">
            <button
              v-if="isMobile"
              class="portal-sidebar-toggle"
              data-test="portal-sidebar-toggle"
              type="button"
              :aria-expanded="sidebarOpen"
              aria-controls="portal-sidebar"
              aria-label="開啟選單"
              @click="sidebarOpen = true"
            >
              <el-icon><Fold /></el-icon>
            </button>
            <h3>常春藤義華幼兒園 - 教職員考勤系統</h3>
          </div>
```

- [ ] **Step 6: `<style>` 加漢堡鍵樣式 + bottom-nav safe-area + psp-fab**

漢堡鍵（≥44px 命中區）：
```css
.portal-sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: 4px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 20px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
```
`.bottom-nav`（:813-824）把 `height: 60px;` 改為：
```css
  height: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
```
`.psp-fab`（:964）把 `bottom: 76px;` 改為：
```css
  bottom: calc(76px + env(safe-area-inset-bottom)); /* bottom-nav(60+inset)+16 gap */
```
> 註：`.el-main`（:897）已是 `padding-bottom: calc(60px + env(safe-area-inset-bottom))`，與加高後的 bottom-nav 一致，**不需改**。

- [ ] **Step 7: 跑測試確認 GREEN + 型別**

Run: `npx vitest run tests/unit/layouts/PortalLayout.mobileSidebar.test.ts && npm run typecheck`
Expected: 兩例 PASS；型別綠。

- [ ] **Step 8: 回歸既有 PortalLayout 測試（確認 additive 未破壞）**

Run: `npx vitest run tests/unit/layouts/PortalLayout.test.ts`
Expected: PASS（impersonation 橫幅等既有行為不變）。

- [ ] **Step 9: Commit**

```bash
git add src/layouts/PortalLayout.vue tests/unit/layouts/PortalLayout.mobileSidebar.test.ts
git commit -m "fix(portal): 手機漢堡鍵恢復側欄功能可達 + bottom-nav safe-area

header 加漢堡 opener（既有 overlay/動畫/closeSidebar 只缺觸發點），
解開加班/補打卡/薪資/行事曆在手機完全無入口的 P0；
bottom-nav 補 safe-area 避免 home indicator 壓底欄。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 全 Phase 收尾驗證

**Files:** 無（驗證 only）

- [ ] **Step 1: 全量回歸 + 型別 + build**

Run: `npm run test && npm run typecheck && npm run build`
Expected: 全綠（含家長三測試樹）；三 entry build 成功。

- [ ] **Step 2: 裝置模擬 sanity（建議，非阻塞）**

`npm run preview`，以 DevTools/Playwright iPhone 視窗（如 390×844）驗：
- Portal 手機 header 出現漢堡鍵、點擊側欄滑出、點選單即關。
- iPhone 模擬下 PWA standalone：bottom-nav 不被 home indicator 壓。
- 點任一輸入框聚焦，頁面不自動放大。
- 窄機無非預期橫向捲動。
- DevTools offline 重整 `/parent.html`、`/public.html` 可開、不被導向 admin。

- [ ] **Step 3: 收尾**

依 workspace DoD：本 Phase 純前端，後端不涉及。確認 6 個 commit 在分支上；推送與 CI 綠由 user 決定時機（push 觸發 Zeabur 前端部署）。

---

## Self-Review

**Spec 覆蓋**：
- C1 → Task 1 ✓；C2 → Task 2 ✓；C3+C4 → Task 3 ✓；C5 → Task 4 ✓；C6 → Task 5 ✓；C7 → Task 6 ✓；全 Phase 驗證 → Task 7 ✓。
- 非目標（提醒鏈/AA/表格/設計系統/isMobile 收斂）皆未進任務 ✓。

**Placeholder 掃描**：無 TBD/TODO；每個 code step 有完整內容；theme-color 釘 `#4f46e5`；noscript 文案具體。

**型別/命名一致**：`looksLikeChunkLoadError` / `installChunkSelfHeal` 在 Task 4 定義與三 entry 消費一致；測試 selector `[data-test="portal-sidebar-toggle"]` 與 Task 6 markup 的 `data-test` 一致；`.sidebar-open` class 名與既有 el-aside `:class` 綁定一致。

**兩軌協調**：Task 6 明列不碰 `isMobile`/`checkMobile`/resize；Task 2 新 `@media` 用 `767.98px`，皆符合 Global Constraints。
