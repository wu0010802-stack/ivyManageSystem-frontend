# RWD P0 地基（斷點 token 統一 + isMobile 收斂）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 JS/CSS 單一斷點來源、修掉 CSS `767 vs 768` off-by-one、把散落 7 處的手刻 `isMobile` 收斂進 `useIsMobile()`，並以 PostCSS custom-media 提供後續 P2/P3 收斂機制。

**Architecture:** JS 側新增 `src/constants/breakpoints.ts` 為唯一數值來源；CSS 側新增 `src/assets/breakpoints.media.css`（`@custom-media` 定義）+ `postcss.config.mjs`（global-data 注入 + custom-media 解析），兩檔由 drift guard 測試強制數值一致。`useIsMobile` 改用常數；7 個手刻 isMobile 收斂至它（含 3 個帶副作用者用 `watch` 保留行為）；33 檔 ~38 處 `sm` 邊界 `@media` 改寫為 `@media (--to-sm)`。純地基、畫面零變化（除 768px 邊界 1px 對齊）。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Vite、PostCSS（postcss-custom-media + @csstools/postcss-global-data）、Element Plus、Vitest + @vue/test-utils（happy-dom）。

## Global Constraints

- **繁體中文**：所有註解、commit message、docstring 一律繁中。
- **TS-only**：`src/` 業務碼 100% TypeScript；新 SFC 一律 `<script setup lang="ts">`；禁 `: any`/`as any`。tsconfig `noUnusedLocals: true` + CI typecheck blocking——**收斂後若 import 變成未使用，必須移除，否則 `npm run typecheck` 失敗**。
- **測試檔慣例**：co-located 新測試用 `src/**/__tests__/*.spec.ts`（TS）；既有 `tests/**/*.test.{js,ts}` 沿用，可為 `.js`。
- **Conventional Commits**：一個 commit 一件事。Co-Authored-By trailer：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **指令**：測試 `npx vitest run <path>`（單檔）/ `npm run test`（全量）；型別 `npm run typecheck`；CSS lint `npm run lint:css`；build `npm run build`。
- **canonical 斷點**：`xs:480 / sm:768 / md:1024 / lg:1200`；手機 = `< 768`（`max-width: 767.98px`）。
- **共用 checkout 警告**：本 repo 多 session 並行動 `main`。commit 前 `git add` **只加本任務檔案**，不 `git add -A`；遇 `index.lock` 等鎖先確認無 active git process 再重試，勿強刪。

---

### Task 1: JS 斷點常數 `breakpoints.ts`

**Files:**
- Create: `src/constants/breakpoints.ts`
- Modify: `src/constants/index.ts`（barrel append）
- Test: `src/constants/__tests__/breakpoints.spec.ts`

**Interfaces:**
- Produces: `BREAKPOINTS: { readonly xs: 480; readonly sm: 768; readonly md: 1024; readonly lg: 1200 }`、`BreakpointKey = 'xs'|'sm'|'md'|'lg'`、`MOBILE_MAX_PX: 767.98`。後續 Task 3（drift guard）、Task 4（useIsMobile）、Task 8（guard）皆消費。

- [ ] **Step 1: 寫失敗測試**

`src/constants/__tests__/breakpoints.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { BREAKPOINTS, MOBILE_MAX_PX } from '@/constants/breakpoints'

describe('breakpoints 常數', () => {
  it('提供 canonical 斷點尺度', () => {
    expect(BREAKPOINTS).toEqual({ xs: 480, sm: 768, md: 1024, lg: 1200 })
  })
  it('手機上界由 sm - 0.02 導出', () => {
    expect(MOBILE_MAX_PX).toBe(767.98)
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/constants/__tests__/breakpoints.spec.ts`
Expected: FAIL（`Cannot find module '@/constants/breakpoints'`）

- [ ] **Step 3: 實作 `src/constants/breakpoints.ts`**

```ts
// Canonical RWD 斷點（與 src/assets/breakpoints.media.css 數值同步，
// 由 src/constants/__tests__/breakpoints.spec.ts 的 drift guard 強制一致）。
// 手機判定統一為 < sm（= max-width 767.98px），與 CSS --to-sm 對齊。
export const BREAKPOINTS = { xs: 480, sm: 768, md: 1024, lg: 1200 } as const
export type BreakpointKey = keyof typeof BREAKPOINTS

/** 手機上界（含）：< sm。用 767.98 避開整數邊界落點歧義。 */
export const MOBILE_MAX_PX = BREAKPOINTS.sm - 0.02 // 767.98
```

- [ ] **Step 4: barrel re-export**

在 `src/constants/index.ts` 末尾新增一行：
```ts
export * from './breakpoints'
```

- [ ] **Step 5: 跑測試確認 GREEN + 型別**

Run: `npx vitest run src/constants/__tests__/breakpoints.spec.ts`
Expected: PASS（2 passed）
Run: `npm run typecheck`
Expected: 無新錯誤

- [ ] **Step 6: Commit**

```bash
git add src/constants/breakpoints.ts src/constants/index.ts src/constants/__tests__/breakpoints.spec.ts
git commit -m "feat(rwd): 新增 canonical 斷點常數 breakpoints.ts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: PostCSS custom-media 接線 + CSS 斷點來源

**Files:**
- Create: `src/assets/breakpoints.media.css`
- Create: `postcss.config.mjs`
- Modify: `package.json`（devDependencies，由 npm i 自動寫入）
- Test: `src/assets/__tests__/breakpoints-media.spec.ts`

**Interfaces:**
- Produces: 可用 custom media token `--bp-xs/--bp-sm/--bp-md/--bp-lg`（min-width）與 `--to-sm/--to-md/--to-lg`（max-width）。Task 7 消費 `--to-sm`。
- 注意：本專案目前**無** postcss config；Vite 會自動採用根目錄 `postcss.config.mjs`，不需改 `vite.config.js`。

- [ ] **Step 1: 安裝依賴**

```bash
npm i -D postcss-custom-media @csstools/postcss-global-data
```
Expected: 兩套件寫入 `package.json` devDependencies。

- [ ] **Step 2: 建立 CSS 斷點來源 `src/assets/breakpoints.media.css`**

```css
/**
 * Canonical RWD 斷點 — CSS 單一來源（與 src/constants/breakpoints.ts 同步，
 * 由 src/constants/__tests__/breakpoints.spec.ts drift guard 強制一致）。
 *
 * 本檔只放 @custom-media 定義、不含任何規則。經 postcss-custom-media 解析後
 * 不產出任何 CSS（零 runtime 體積）。@csstools/postcss-global-data 會把這些
 * 定義注入每個 SFC <style> 編譯單元。
 */

/* min-width anchors（mobile-first 用） */
@custom-media --bp-xs (min-width: 480px);
@custom-media --bp-sm (min-width: 768px);
@custom-media --bp-md (min-width: 1024px);
@custom-media --bp-lg (min-width: 1200px);

/* max-width（desktop-first override，多數既有 @media 對應這組） */
@custom-media --to-sm (max-width: 767.98px);   /* 手機 */
@custom-media --to-md (max-width: 1023.98px);
@custom-media --to-lg (max-width: 1199.98px);
```

- [ ] **Step 3: 建立 `postcss.config.mjs`**

```js
import postcssGlobalData from '@csstools/postcss-global-data'
import postcssCustomMedia from 'postcss-custom-media'

export default {
  plugins: [
    // 把 breakpoints.media.css 的 @custom-media 定義注入每個 CSS 編譯單元，
    // 否則各 SFC <style scoped> 獨立編譯時看不到定義。
    postcssGlobalData({ files: ['src/assets/breakpoints.media.css'] }),
    // 將 @media (--to-sm) 解析回 @media (max-width: 767.98px)。
    postcssCustomMedia(),
  ],
}
```

- [ ] **Step 4: 寫驗證測試（直接跑 plugin 鏈，免 build）**

`src/assets/__tests__/breakpoints-media.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import postcss from 'postcss'
import customMedia from 'postcss-custom-media'
import globalData from '@csstools/postcss-global-data'

describe('PostCSS custom-media 接線', () => {
  it('--to-sm 解析為 max-width: 767.98px', async () => {
    const out = await postcss([
      globalData({ files: ['src/assets/breakpoints.media.css'] }),
      customMedia(),
    ]).process('@media (--to-sm){a{color:red}}', { from: undefined })
    expect(out.css).toContain('max-width: 767.98px')
    expect(out.css).not.toContain('--to-sm')
  })

  it('--bp-md 解析為 min-width: 1024px', async () => {
    const out = await postcss([
      globalData({ files: ['src/assets/breakpoints.media.css'] }),
      customMedia(),
    ]).process('@media (--bp-md){a{color:red}}', { from: undefined })
    expect(out.css).toContain('min-width: 1024px')
  })
})
```

- [ ] **Step 5: 跑測試確認 GREEN**

Run: `npx vitest run src/assets/__tests__/breakpoints-media.spec.ts`
Expected: PASS（2 passed）

- [ ] **Step 6: 確認 build 不因新 postcss config 爆**

Run: `npm run build`
Expected: build 成功（無 postcss 錯誤）。此時尚無檔案使用 `--to-sm`，故 dist 不會有殘留 token。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/assets/breakpoints.media.css postcss.config.mjs src/assets/__tests__/breakpoints-media.spec.ts
git commit -m "feat(rwd): 接 PostCSS custom-media + CSS 斷點單一來源 breakpoints.media.css

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: drift guard 測試（CSS ↔ JS 數值一致）

**Files:**
- Modify: `src/constants/__tests__/breakpoints.spec.ts`（append）

**Interfaces:**
- Consumes: `BREAKPOINTS`（Task 1）、`src/assets/breakpoints.media.css`（Task 2）。

- [ ] **Step 1: append drift guard 測試**

在 `src/constants/__tests__/breakpoints.spec.ts` 檔頂 import 區補：
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
```
並在 `describe` 內新增：
```ts
it('breakpoints.media.css 的 min-width 值與 BREAKPOINTS 一致（單一事實來源）', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../assets/breakpoints.media.css', import.meta.url)),
    'utf-8',
  )
  for (const [key, px] of Object.entries(BREAKPOINTS)) {
    const re = new RegExp(`--bp-${key}\\s*\\(min-width:\\s*${px}px\\)`)
    expect(css, `--bp-${key} 應為 ${px}px`).toMatch(re)
  }
})
```

- [ ] **Step 2: 跑測試確認 GREEN**

Run: `npx vitest run src/constants/__tests__/breakpoints.spec.ts`
Expected: PASS（3 passed）

- [ ] **Step 3: 反向驗證 guard 有效（手動暫改，驗 RED 後還原）**

把 `src/assets/breakpoints.media.css` 的 `--bp-md (min-width: 1024px)` 暫改成 `1023px`，跑同測試應 FAIL；確認後改回 `1024px`，再跑應 PASS。
（此步只為證明 guard 真的會擋漂移，不 commit 暫改。）

- [ ] **Step 4: Commit**

```bash
git add src/constants/__tests__/breakpoints.spec.ts
git commit -m "test(rwd): 加 breakpoints.ts ↔ breakpoints.media.css 漂移守衛

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `useIsMobile` 改用常數

**Files:**
- Modify: `src/composables/useIsMobile.ts:3`
- Test: `tests/unit/composables/useIsMobile.test.js`（append 一條斷言）

**Interfaces:**
- Consumes: `MOBILE_MAX_PX`（Task 1）。
- Produces: 行為不變的 `useIsMobile()`；query 字串改為 `(max-width: 767.98px)`。既有 4 個 user 無需改。

- [ ] **Step 1: 寫失敗測試（query 來自常數）**

在 `tests/unit/composables/useIsMobile.test.js` 的 `describe` 內新增：
```js
it('用 canonical 手機上界呼叫 matchMedia', () => {
  useIsMobile()
  expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767.98px)')
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/composables/useIsMobile.test.js`
Expected: 新測試 FAIL（目前以 `(max-width: 767px)` 呼叫）

- [ ] **Step 3: 改 `useIsMobile.ts`**

`src/composables/useIsMobile.ts`：在 import 區（檔頂）新增：
```ts
import { MOBILE_MAX_PX } from '@/constants/breakpoints'
```
把：
```ts
const QUERY = '(max-width: 767px)'
```
改為：
```ts
const QUERY = `(max-width: ${MOBILE_MAX_PX}px)`
```

- [ ] **Step 4: 跑測試確認 GREEN + 型別**

Run: `npx vitest run tests/unit/composables/useIsMobile.test.js`
Expected: PASS（全部，含原 4 條 + 新 1 條）
Run: `npm run typecheck`
Expected: 無新錯誤

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIsMobile.ts tests/unit/composables/useIsMobile.test.js
git commit -m "refactor(rwd): useIsMobile 斷點改讀 breakpoints 常數

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 收斂帶副作用的手刻 isMobile（AdminLayout / PortalLayout / PortalAttendanceView）

**Files:**
- Modify: `src/layouts/AdminLayout.vue`
- Modify: `src/layouts/PortalLayout.vue`
- Modify: `src/views/portal/PortalAttendanceView.vue`
- Test: `tests/unit/layouts/AdminLayout.test.js`（append）、`tests/unit/layouts/PortalLayout.test.ts`（append）、Create `src/views/portal/__tests__/PortalAttendanceView.viewMode.spec.ts`

**Interfaces:**
- Consumes: `useIsMobile`（Task 4）。
- 三檔的 `isMobile` 含**副作用**（離開手機關側欄 / 切 viewMode），收斂時用 `watch` 保留，不可只換 ref。

- [ ] **Step 1: 寫 AdminLayout 副作用測試（RED）**

在 `tests/unit/layouts/AdminLayout.test.js` 檔頂 import 區補 `import { ref } from 'vue'`，並在現有 `vi.mock(...)` 群組後新增可控 mock：
```js
const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))
```
在 `describe('AdminLayout', ...)` 內新增：
```js
it('離開手機視窗時自動關閉手機側欄', async () => {
  mockIsMobile.value = true
  const wrapper = shallowMount(AdminLayout, { global: { stubs } })
  await nextTick()
  // 透過 header 切開側欄
  wrapper.findComponent({ name: 'AdminHeader' }).vm.$emit('toggle-sidebar')
  await nextTick()
  expect(wrapper.findComponent({ name: 'AdminSidebar' }).props('mobileOpen')).toBe(true)
  // 切回桌機 → watch 應關閉側欄
  mockIsMobile.value = false
  await nextTick()
  expect(wrapper.findComponent({ name: 'AdminSidebar' }).props('mobileOpen')).toBe(false)
})
```
> 若 `findComponent({ name: 'AdminHeader' })` 取不到（auto-stub 命名差異），改用先 `import AdminSidebar from '@/components/layout/AdminSidebar.vue'` / `AdminHeader` 後以 `findComponent(AdminSidebar)` 定位。

- [ ] **Step 2: 跑確認 RED**

Run: `npx vitest run tests/unit/layouts/AdminLayout.test.js`
Expected: 新測試 FAIL（目前 AdminLayout 用自帶 `checkMobile`，未接 mockIsMobile，side bar 不會因 mock 變化關閉）

- [ ] **Step 3: 改 `AdminLayout.vue`**

import 區：
```ts
import { ref, onMounted, onUnmounted } from 'vue'
```
改為：
```ts
import { ref, onMounted, onUnmounted, watch } from 'vue'
```
並在既有 composable import 群組新增：
```ts
import { useIsMobile } from '@/composables/useIsMobile'
```
把：
```ts
const isMobile = ref(false)
const sidebarOpen = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) sidebarOpen.value = false
}
```
改為：
```ts
const { isMobile } = useIsMobile()
const sidebarOpen = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

// 離開手機視窗時關閉手機側欄（原 checkMobile 的副作用）
watch(isMobile, (m) => {
  if (!m) sidebarOpen.value = false
})
```
在 `onMounted` 內移除這兩行：
```ts
  checkMobile()
  window.addEventListener('resize', checkMobile)
```
在 `onUnmounted` 內移除這行：
```ts
  window.removeEventListener('resize', checkMobile)
```

- [ ] **Step 4: 跑 AdminLayout 測試確認 GREEN**

Run: `npx vitest run tests/unit/layouts/AdminLayout.test.js tests/unit/layouts/AdminLayout.bgPoll.test.js`
Expected: PASS（含原輪詢測試 + 新側欄測試）

- [ ] **Step 5: 改 `PortalLayout.vue` + 加測試**

import 區把 `import { computed, ref, onMounted, onUnmounted, provide } from 'vue'` 的 `ref` 保留（其他 ref 仍用），新增 `watch`：
```ts
import { computed, ref, onMounted, onUnmounted, provide, watch } from 'vue'
```
新增：
```ts
import { useIsMobile } from '@/composables/useIsMobile'
```
把：
```ts
const isMobile = ref(false)
```
改為：
```ts
const { isMobile } = useIsMobile()
```
把：
```ts
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) sidebarOpen.value = false
}
```
改為：
```ts
watch(isMobile, (m) => {
  if (!m) sidebarOpen.value = false
})
```
在 `onMounted` 移除 `checkMobile()` 與 `window.addEventListener('resize', checkMobile)`；在 `onUnmounted` 移除 `window.removeEventListener('resize', checkMobile)`。其餘 listener（`portal-substitute-count-changed` / `visibilitychange`）與 line 219 `if (isMobile.value) sidebarOpen.value = false` 保留不動。

PortalLayout 的 `watch(isMobile, ...)` 與 AdminLayout **完全相同**（離開手機關側欄），其 watch 行為已由 Task 5 Step 1 的 AdminLayout 測試代表性覆蓋。PortalLayout 這檔加一條**較輕的 isMobile 接線測試**即可（確認收斂後 isMobile 仍正確驅動手機 chrome）：在 `tests/unit/layouts/PortalLayout.test.ts` 比照 AdminLayout 加可控 `mockIsMobile` mock（`vi.mock('@/composables/useIsMobile', ...)` + 模組層 `ref`），用已驗證存在的 class 斷言——`mockIsMobile.value = true` 掛載後 `wrapper.find('.portal-layout').classes()` 應含 `is-mobile`；設 `false` 並 `await nextTick()` 後不含。觀察點 class 來自 template `<el-container class="portal-layout" :class="{ 'is-mobile': isMobile }">`（已確認存在）。若既有 harness 有暴露側欄開關，可額外加 aside `sidebar-open` class 的關閉斷言（非必須）。

- [ ] **Step 6: 跑 PortalLayout 測試確認 GREEN**

Run: `npx vitest run tests/unit/layouts/PortalLayout.test.ts`
Expected: PASS

- [ ] **Step 7: 寫 PortalAttendanceView viewMode 測試（RED）**

Create `src/views/portal/__tests__/PortalAttendanceView.viewMode.spec.ts`：
```ts
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))
// fetchSheet 永不 resolve，避免依賴回傳資料形狀；子元件由 shallowMount stub。
vi.mock('@/api/portal', () => ({
  getAttendanceSheet: vi.fn(() => new Promise(() => {})),
  getAttendanceSheetPdf: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ name: 'T', employee_id: 1 }),
}))

import PortalAttendanceView from '@/views/portal/PortalAttendanceView.vue'
import AttendanceCardsView from '@/views/portal/components/attendance/AttendanceCardsView.vue'
import AttendanceTableView from '@/views/portal/components/attendance/AttendanceTableView.vue'

describe('PortalAttendanceView viewMode 隨手機態切換', () => {
  it('手機載入時用 cards、切回桌機用 table', async () => {
    mockIsMobile.value = true
    const wrapper = shallowMount(PortalAttendanceView)
    await nextTick()
    expect(wrapper.findComponent(AttendanceCardsView).exists()).toBe(true)
    expect(wrapper.findComponent(AttendanceTableView).exists()).toBe(false)

    mockIsMobile.value = false
    await nextTick()
    expect(wrapper.findComponent(AttendanceTableView).exists()).toBe(true)
    expect(wrapper.findComponent(AttendanceCardsView).exists()).toBe(false)
  })
})
```

- [ ] **Step 8: 跑確認 RED**

Run: `npx vitest run src/views/portal/__tests__/PortalAttendanceView.viewMode.spec.ts`
Expected: FAIL（目前用 `onResize` + window resize，未接 mockIsMobile，初始即不會切 cards）

- [ ] **Step 9: 改 `PortalAttendanceView.vue`**

import 區 `import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'` 加 `watch`：
```ts
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
```
新增：
```ts
import { useIsMobile } from '@/composables/useIsMobile'
```
把：
```ts
const isMobile = ref(window.innerWidth < 768)
const onResize = () => {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value && viewMode.value === 'table') viewMode.value = 'cards'
  if (!isMobile.value && viewMode.value === 'cards') viewMode.value = 'table'
}
```
改為（`immediate: true` 保留原 onMounted 內 `onResize()` 的初始同步）：
```ts
const { isMobile } = useIsMobile()
watch(isMobile, (m) => {
  if (m && viewMode.value === 'table') viewMode.value = 'cards'
  if (!m && viewMode.value === 'cards') viewMode.value = 'table'
}, { immediate: true })
```
在 `onMounted` 移除 `onResize()` 與 `window.addEventListener('resize', onResize)`（保留 `fetchSheet()` 與 IntersectionObserver 區塊）；在 `onUnmounted` 移除 `window.removeEventListener('resize', onResize)`（保留 `stickyObserver?.disconnect()`）。

- [ ] **Step 10: 跑確認 GREEN + 型別**

Run: `npx vitest run src/views/portal/__tests__/PortalAttendanceView.viewMode.spec.ts`
Expected: PASS
Run: `npm run typecheck`
Expected: 無新錯誤（若有未使用 import 被標，移除之）

- [ ] **Step 11: Commit**

```bash
git add src/layouts/AdminLayout.vue src/layouts/PortalLayout.vue src/views/portal/PortalAttendanceView.vue \
        tests/unit/layouts/AdminLayout.test.js tests/unit/layouts/PortalLayout.test.ts \
        src/views/portal/__tests__/PortalAttendanceView.viewMode.spec.ts
git commit -m "refactor(rwd): 收斂帶副作用的 isMobile 至 useIsMobile（layouts + 考勤）

AdminLayout / PortalLayout 改用 useIsMobile + watch 保留離開手機關側欄；
PortalAttendanceView 改 watch(immediate) 保留 table/cards 切換。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 收斂純 isMobile（PortalProfile / PortalSalary / PortalSchedule / ClassroomStudentDrawer）

**Files:**
- Modify: `src/views/portal/PortalProfileView.vue:16-19`
- Modify: `src/views/portal/PortalSalaryView.vue:21-24`
- Modify: `src/views/portal/PortalScheduleView.vue`（48-50 + onMounted/onUnmounted 內 mq 區段）
- Modify: `src/components/classroom/ClassroomStudentDrawer.vue:160-168`

**Interfaces:**
- Consumes: `useIsMobile`（Task 4）。四檔的 `isMobile` 為**純讀**（無副作用），直接換成 `const { isMobile } = useIsMobile()`。

- [ ] **Step 1: 改 `PortalProfileView.vue`**

新增 import：`import { useIsMobile } from '@/composables/useIsMobile'`。
把：
```ts
const isMobile = ref(window.innerWidth < 768)
const checkMobile = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', checkMobile))
onUnmounted(() => window.removeEventListener('resize', checkMobile))
```
改為：
```ts
const { isMobile } = useIsMobile()
```
（檔內 line 194 另有 `onMounted`，故 `onMounted` import 保留；`onUnmounted` 若不再被用到，從 `import { ref, reactive, onMounted, onUnmounted } from 'vue'` 移除 `onUnmounted`。`ref`/`reactive` 視其他用途保留。）

- [ ] **Step 2: 改 `PortalSalaryView.vue`**

新增 import：`import { useIsMobile } from '@/composables/useIsMobile'`。
把：
```ts
const isMobile = ref(window.innerWidth < 768)
const checkMobile = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', checkMobile))
onUnmounted(() => window.removeEventListener('resize', checkMobile))
```
改為：
```ts
const { isMobile } = useIsMobile()
```
（line 64 另有 `onMounted(fetchSalary)`，`onMounted` 保留；`onUnmounted` 不再用到則從 import 移除。）

- [ ] **Step 3: 改 `PortalScheduleView.vue`**

新增 import：`import { useIsMobile } from '@/composables/useIsMobile'`。
把：
```ts
const isMobile = ref(false)
let mqList: MediaQueryList | null = null
const onMqChange = (e: MediaQueryListEvent) => { isMobile.value = e.matches }
```
改為：
```ts
const { isMobile } = useIsMobile()
```
在 `onMounted` 內移除：
```ts
  mqList = window.matchMedia('(max-width: 767px)')
  isMobile.value = mqList.matches
  mqList.addEventListener('change', onMqChange)
```
在 `onUnmounted` 內移除：
```ts
  mqList?.removeEventListener('change', onMqChange)
```
（`onMounted`/`onUnmounted` 仍有其他內容則保留 import。）

- [ ] **Step 4: 改 `ClassroomStudentDrawer.vue`**

新增 import：`import { useIsMobile } from '@/composables/useIsMobile'`。
把：
```ts
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 768)
const handleResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize)
})
```
改為：
```ts
const { isMobile } = useIsMobile()
```
（`onMounted`/`onUnmounted` 若該檔僅此處使用，從 `import { ref, computed, watch, onMounted, onUnmounted } from 'vue'` 移除之；`ref`/`computed`/`watch` 視其他用途保留。）

- [ ] **Step 5: 型別 + 既有測試回歸**

Run: `npm run typecheck`
Expected: 無錯誤（未使用 import 已清）。若報未使用 → 移除對應 import 後重跑。
Run: `npx vitest run tests/components/ClassroomStudentDrawer.prospects.test.ts`
Expected: PASS（既有 drawer 測試仍綠）

- [ ] **Step 6: 手動確認無殘留**

Run: `grep -nE "innerWidth < 768|matchMedia\('\(max-width: 767px\)'\)" src/views/portal/PortalProfileView.vue src/views/portal/PortalSalaryView.vue src/views/portal/PortalScheduleView.vue src/components/classroom/ClassroomStudentDrawer.vue`
Expected: 無輸出（皆已收斂）

- [ ] **Step 7: Commit**

```bash
git add src/views/portal/PortalProfileView.vue src/views/portal/PortalSalaryView.vue \
        src/views/portal/PortalScheduleView.vue src/components/classroom/ClassroomStudentDrawer.vue
git commit -m "refactor(rwd): 收斂純 isMobile 至 useIsMobile（profile/salary/schedule/drawer）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 遷移 sm 邊界 `@media` → `@media (--to-sm)`

**Files（33 檔、~38 處）:**
`src/assets/main.css`、`src/components/classroom/ClassroomStudentDrawer.vue`、`src/components/layout/AdminHeader.vue`、`src/components/portal/PortalLeaveList.vue`、`src/components/portal/PortalSearchPalette.vue`、`src/components/recruitment/RecruitmentOverviewTab.vue`、`src/components/recruitment/RecruitmentStatsPanel.vue`、`src/components/student/StudentSummaryHeader.vue`、`src/components/student/tabs/academic/SummaryCards.vue`、`src/components/student/tabs/OverviewTab.vue`、`src/components/student/workbench/TodayTasksPanel.vue`、`src/layouts/AdminLayout.vue`、`src/layouts/PortalLayout.vue`、`src/views/activity/ActivityPendingReviewView.vue`、`src/views/activity/ActivityRegistrationView.vue`、`src/views/AdminProfileView.vue`、`src/views/ClassroomView.vue`、`src/views/EmployeeView.vue`、`src/views/portal/components/attendance/AttendanceStatsRow.vue`、`src/views/portal/components/contactBook/ContactBookEntryDrawer.vue`、`src/views/portal/components/schedule/ScheduleCalendarGrid.vue`、`src/views/portal/components/schedule/ScheduleMonthHeader.vue`、`src/views/portal/PortalAnnouncementView.vue`、`src/views/portal/PortalAttendanceView.vue`、`src/views/portal/PortalLeaveView.vue`、`src/views/portal/PortalOvertimeView.vue`、`src/views/portal/PortalProfileView.vue`、`src/views/portal/PortalPunchCorrectionView.vue`、`src/views/portal/PortalSalaryView.vue`、`src/views/portal/PortalScheduleView.vue`、`src/views/public/ActivityPublicView.vue`、`src/views/salary/SalaryHubView.vue`、`src/views/salary/settle/StepFinalize.vue`

**轉換規則（機械式，逐檔）：** 把 `@media` 條件中的 `(max-width: 767px)` 與 `(max-width: 768px)` 一律改為 `(--to-sm)`，保留 `@media`、`screen and`、以及任何 compound `and (...)`。例：
- `@media (max-width: 768px) {` → `@media (--to-sm) {`
- `@media screen and (max-width: 767px) {` → `@media screen and (--to-sm) {`
- `@media (max-width: 767px) and (orientation: landscape) {` → `@media (--to-sm) and (orientation: landscape) {`

> 只動 `max-width: 767/768px` 的條件；其他斷點（600/640/900/1000…）**不動**（留 P2/P3）。同一檔若有多處，逐一改。

- [ ] **Step 1: 全數遷移**

依上述規則改完所有 33 檔。可逐檔以編輯器搜尋 `max-width: 767px` / `max-width: 768px` 取代為 `--to-sm`。

- [ ] **Step 2: 確認 src 無殘留 sm 裸值**

Run: `grep -rnE "max-width:\s*76[78]px" src --include="*.vue" --include="*.css"`
Expected: 無輸出（全部已改為 `--to-sm`）

- [ ] **Step 3: build 並確認 token 全部解析（無殘留 custom-media）**

Run: `npm run build`
Expected: 成功
Run: `grep -rn -- "--to-sm" dist`
Expected: **無輸出**（所有 `--to-sm` 已被 postcss 解析為 `max-width:767.98px`；若有殘留代表 global-data 未注入該編譯單元，須排查）
Run: `grep -rn "767.98px" dist | head`
Expected: 有輸出（確認確實解析成 767.98px）

- [ ] **Step 4: CSS lint + 全量測試回歸**

Run: `npm run lint:css`
Expected: 無新 error（stylelint 設定極簡，無 media-feature 規則，`@media (--to-sm)` 不受擋）
Run: `npm run test`
Expected: 全綠（純 CSS 邊界改寫，不影響邏輯測試）

- [ ] **Step 5: Commit（只加本任務 33 檔，勿掃進平行 session 變更）**

先 `git status --short` 確認改動範圍僅本任務 33 檔（見上方 Files 區），再以**明確路徑** add（不要 `git add <整個目錄>` 或 `-A`）：
```bash
git status --short   # 先核對：應只有本任務 33 檔為 modified
git add src/assets/main.css \
        src/components/classroom/ClassroomStudentDrawer.vue src/components/layout/AdminHeader.vue \
        src/components/portal/PortalLeaveList.vue src/components/portal/PortalSearchPalette.vue \
        src/components/recruitment/RecruitmentOverviewTab.vue src/components/recruitment/RecruitmentStatsPanel.vue \
        src/components/student/StudentSummaryHeader.vue src/components/student/tabs/academic/SummaryCards.vue \
        src/components/student/tabs/OverviewTab.vue src/components/student/workbench/TodayTasksPanel.vue \
        src/layouts/AdminLayout.vue src/layouts/PortalLayout.vue \
        src/views/activity/ActivityPendingReviewView.vue src/views/activity/ActivityRegistrationView.vue \
        src/views/AdminProfileView.vue src/views/ClassroomView.vue src/views/EmployeeView.vue \
        src/views/portal/components/attendance/AttendanceStatsRow.vue \
        src/views/portal/components/contactBook/ContactBookEntryDrawer.vue \
        src/views/portal/components/schedule/ScheduleCalendarGrid.vue \
        src/views/portal/components/schedule/ScheduleMonthHeader.vue \
        src/views/portal/PortalAnnouncementView.vue src/views/portal/PortalAttendanceView.vue \
        src/views/portal/PortalLeaveView.vue src/views/portal/PortalOvertimeView.vue \
        src/views/portal/PortalProfileView.vue src/views/portal/PortalPunchCorrectionView.vue \
        src/views/portal/PortalSalaryView.vue src/views/portal/PortalScheduleView.vue \
        src/views/public/ActivityPublicView.vue src/views/salary/SalaryHubView.vue \
        src/views/salary/settle/StepFinalize.vue
git commit -m "refactor(rwd): sm 邊界 @media 改用 custom-media --to-sm（統一 767/768 off-by-one）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
> 注意：`PortalAttendanceView.vue` / `PortalProfileView.vue` / `PortalSalaryView.vue` / `PortalScheduleView.vue` / `ClassroomStudentDrawer.vue` / `AdminLayout.vue` / `PortalLayout.vue` 在 Task 5/6 已改過 `<script>`，本任務只動其 `<style>` 的 `@media`；若 Task 5/6 已 commit，這裡只會看到 `<style>` 的差異。

---

### Task 8: JS 側裸斷點守衛測試

**Files:**
- Create: `tests/unit/no-adhoc-breakpoints.test.ts`

**Interfaces:**
- Consumes: 整個 `src/` 樹（fs 掃描）。此為 ratchet：禁止未來再出現裸 `innerWidth < 768` / `matchMedia('(max-width: 767px)')`，強制走 `useIsMobile()`。

- [ ] **Step 1: 寫守衛測試**

`tests/unit/no-adhoc-breakpoints.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../../src', import.meta.url))

// 合法的非斷點用法（佈局計算 / 斷點來源本體）允許保留裸用法。
const ALLOW = new Set([
  'views/public/components/CoursePickerSection.vue', // popover 定位計算
  'components/portal/class-hub/ClassHubMessagesDrawer.vue', // responsive 寬度計算
  'composables/useIsMobile.ts', // 斷點單一來源本體
])

const FORBIDDEN = [
  /innerWidth\s*<\s*768\b/,
  /matchMedia\(\s*['"`]\(max-width:\s*767px\)/,
]

function listFiles(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => /\.(vue|ts)$/.test(p) && !p.includes('__tests__'))
}

describe('禁止 useIsMobile 以外的裸手機斷點偵測', () => {
  it('src 內無 ad-hoc 手機斷點（改用 useIsMobile()）', () => {
    const offenders: string[] = []
    for (const rel of listFiles(SRC)) {
      if (ALLOW.has(rel)) continue
      const code = readFileSync(join(SRC, rel), 'utf-8')
      if (FORBIDDEN.some((re) => re.test(code))) offenders.push(rel)
    }
    expect(offenders, `改用 useIsMobile()：\n${offenders.join('\n')}`).toEqual([])
  })
})
```

- [ ] **Step 2: 跑守衛確認 GREEN（Task 5/6 已收斂完畢）**

Run: `npx vitest run tests/unit/no-adhoc-breakpoints.test.ts`
Expected: PASS。若 FAIL，offenders 清單會列出漏收斂的檔案 → 回頭比照 Task 6 收斂後再跑。

- [ ] **Step 3: 全量回歸 + 型別 + build 收尾**

Run: `npm run test`
Expected: 全綠
Run: `npm run typecheck`
Expected: 無錯誤
Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add tests/unit/no-adhoc-breakpoints.test.ts
git commit -m "test(rwd): 加 JS 側裸斷點守衛（強制走 useIsMobile）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定義（DoD）

- `breakpoints.ts` + `breakpoints.media.css` + `postcss.config.mjs` 落地，drift guard 綠。
- 7 個手刻 isMobile 全收斂至 `useIsMobile()`；3 個帶副作用者行為由 `watch` 保留並有測試。
- 38 處 sm 邊界 `@media` 改用 `@media (--to-sm)`，`npm run build` 綠、dist 無殘留 `--to-sm`。
- `npm run test` / `typecheck` / `lint:css` / `build` 全綠。
- JS 側裸斷點守衛綠（ratchet 生效）。
- 視覺零變化（除 768px 邊界 1px 對齊）。

## 後續（不在本計畫）

P1 實機稽核（截圖分級壞點）→ P2 修壞點（家長端/公開頁優先）→ P3 品質掃除（觸控 ≥44px、間距、平板中間帶、細點 @media 收斂）。
