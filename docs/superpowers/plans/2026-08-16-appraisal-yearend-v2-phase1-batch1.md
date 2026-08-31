# 考核與年終 V2 Phase 1 — Batch 1：三段＋齒輪殼與待辦路由重整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/appraisal-year-end` 頂層 segmented 導覽從六段（總覽/考核/年終/發放/規則設定/例外中心）收斂為三段（待辦/考核/年終）＋獨立齒輪按鈕（規則設定），並把「總覽」路由重新命名為「待辦」（`overview`→`todo`），為後續 Batch 2（考核工作區）、Batch 3（年終工作區）鋪路。本批次**不改動**任何頁面內部邏輯、API 呼叫、計算公式；`OverviewWorkbenchView.vue` 的既有四張卡（考核/年終/例外/發放，含 `deriveNextStep` 引導邏輯）內容完全保留，只是掛載路徑改名。

**Architecture:** `AppraisalYearEndLayout.vue` 的 `SECTIONS` 常數陣列從 6 筆砍到 3 筆（todo/appraisal/year-end），移除的 `payout`/`rules`/`exceptions` 三段：`rules` 改為獨立齒輪 icon 按鈕（同樣的 `can()` 判斷邏輯，直接 `router.push`，不進 `el-segmented`）；`payout`/`exceptions` 頁面路由保留不變，仍可經既有卡片點擊進入，只是不再佔頂層分段名額。`activeKey` computed 新增折算規則：停在 `year-end/payout` 高亮「年終」，停在 `rules`/`exceptions` 不高亮任何段（回傳 `''`）。路由層只改一個 path segment（`overview`→`todo`）＋補一條 legacy redirect，其餘 21 條既有 redirect 與所有子路由掛載完全不動。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Vue Router 4、Element Plus（`el-segmented`/`el-icon`）、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/ux-spec.md` §1.1（IA 對照表）、§1.2（redirect 清單）；`implementation-plan.md` §Phase 1 子項 1-2。

## Global Constraints

- 語言：繁體中文（UI 文字、commit message、註解）；程式識別字英文。
- **不改動**任何 API 呼叫、公式、計算邏輯、簽核狀態機、權限判斷語意（`hasPermission` 字串比對）——本批次純導覽層與路由重整。
- 前端 TS-only：新/改檔一律 `<script setup lang="ts">`；禁 `: any`/`as any`；`noUnusedLocals:true` 強制移除未用 import。
- 不新增裸 `localStorage`；本批次不涉及 tenant storage（無資料快取需求）。
- 圖示按鈕一律 `aria-label`（無障礙要求，見 ux-spec §6）。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- 分支：`feat/appraisal-yearend-v2-phase1`（worktree `/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/ayx-v2-phase1`，base `origin/main`）。每個 task 完成後 `git add -- <明確路徑>` + commit（Conventional Commits，一個 commit 一件事）；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `AppraisalYearEndLayout.vue` — SECTIONS 六段→三段＋齒輪

**Files:**
- Modify: `src/views/appraisalYearEnd/AppraisalYearEndLayout.vue`（現況見下方「現有完整內容」）
- Test: `src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`（整份改寫）

**現有完整內容（改動前，供對照，共 81 行）：**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import { PAGE_TERMS } from '@/constants/moduleTerms'

interface SectionDef { key: string; label: string; to: string; can: () => boolean }

// 權限對齊 spec：規則設定「任一子頁可見即顯示」；總覽=任一模組權限
const SECTIONS: SectionDef[] = [
  { key: 'overview', label: '總覽', to: '/appraisal-year-end/overview',
    can: () => ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'].some((p) => hasPermission(p)) },
  { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal/current', can: () => hasPermission('APPRAISAL_READ') },
  { key: 'year-end', label: '年終', to: '/appraisal-year-end/year-end',
    can: () => hasPermission('YEAR_END_READ') || hasPermission('APPRAISAL_FINALIZE') },
  { key: 'payout', label: '發放', to: '/appraisal-year-end/year-end/payout',
    can: () => hasPermission('APPRAISAL_FINALIZE') },
  { key: 'rules', label: '規則設定', to: '/appraisal-year-end/rules',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('SETTINGS_READ') },
  { key: 'exceptions', label: PAGE_TERMS.yearEndExceptions, to: '/appraisal-year-end/exceptions',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ') },
]

const route = useRoute()
const router = useRouter()
const sections = computed(() => SECTIONS.filter((s) => s.can()))
const activeKey = computed(() => {
  if (route.path.startsWith('/appraisal-year-end/year-end/payout')) return 'payout'
  return route.path.split('/')[2] ?? 'overview'
})
const segmentedOptions = computed(() => sections.value.map((s) => ({ label: s.label, value: s.key })))
const onSectionChange = (val: string | number) => {
  const target = SECTIONS.find((s) => s.key === String(val))
  if (target && activeKey.value !== target.key) router.push(target.to)
}

const crumbs = computed(() => {
  const tail = route.matched
    .filter((m) => m.path !== '/appraisal-year-end' && (m.meta?.title || m.meta?.breadcrumb))
    .flatMap((m) => {
      const bc = m.meta?.breadcrumb as string[] | undefined
      if (Array.isArray(bc) && bc.length > 0) return bc.map(String)
      return m.meta?.title ? [String(m.meta.title)] : []
    })
  const extra = (route.meta?.breadcrumbExtra as string | undefined)
  return ['考核與年終', ...tail, ...(extra ? [extra] : [])]
})
</script>

<template>
  <div class="aye-layout">
    <el-segmented
      v-if="segmentedOptions.length > 0"
      class="aye-nav"
      :model-value="activeKey"
      :options="segmentedOptions"
      size="large"
      @change="onSectionChange"
    />
    <el-breadcrumb v-if="crumbs.length > 1" class="aye-breadcrumb" separator="›">
      <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i">{{ c }}</el-breadcrumb-item>
    </el-breadcrumb>
    <div class="aye-body">
      <router-view />
    </div>
    <el-empty v-if="segmentedOptions.length === 0" description="無權限檢視此頁" />
  </div>
</template>

<style scoped>
.aye-layout { padding: var(--space-5); }
.aye-nav { margin-bottom: var(--space-3); }
.aye-breadcrumb { margin-bottom: var(--space-4); }
</style>
```

**Interfaces:**
- Consumes：`hasPermission(name: string): boolean`（`@/utils/auth`，不變）
- Produces：無其他檔案依賴本檔的具名 export（路由葉節點元件）。Task 2 的路由改動與本檔無直接耦合（各自獨立可測）。

- [ ] **Step 1: 寫整份新測試檔（先紅）**

寫入 `src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`（整份取代舊內容）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import AppraisalYearEndLayout from '../AppraisalYearEndLayout.vue'

const permState = { read: true, settings: false, finalize: false }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(
    (p: string) =>
      (p === 'APPRAISAL_READ' && permState.read) ||
      (p === 'SETTINGS_READ' && permState.settings) ||
      (p === 'APPRAISAL_FINALIZE' && permState.finalize),
  ),
}))

const Stub = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{
    path: '/appraisal-year-end', component: AppraisalYearEndLayout, redirect: '/appraisal-year-end/todo',
    children: [
      { path: 'todo', component: Stub, meta: { title: '待辦' } },
      { path: 'appraisal/current', component: Stub, meta: { title: '考核', breadcrumb: ['考核', '當期總覽'] } },
      { path: 'year-end', component: Stub, meta: { title: '年終' } },
      { path: 'year-end/cycles/:id', component: Stub, meta: { title: '年終 › 結算工作區' } },
      { path: 'year-end/payout', component: Stub, meta: { title: '考核年終發放' } },
      { path: 'rules', component: Stub, meta: { title: '規則設定' } },
      { path: 'exceptions', component: Stub, meta: { title: '待補資料與例外' } },
    ],
  }],
})

describe('AppraisalYearEndLayout — 三段 + 齒輪（V2 IA）', () => {
  beforeEach(async () => {
    permState.read = true
    permState.settings = false
    permState.finalize = false
    await router.push('/appraisal-year-end/appraisal/current')
    await router.isReady()
  })

  it('只顯示三段：待辦／考核／年終，不再有「發放」「規則設定」「例外中心」段', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const options = w.findComponent({ name: 'ElSegmented' }).props('options') as Array<{ label: string; value: string }>
    expect(options.map((o) => o.value)).toEqual(['todo', 'appraisal', 'year-end'])
    expect(options.map((o) => o.label)).toEqual(['待辦', '考核', '年終'])
  })

  it('麵包屑顯示 目前 section 路徑', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.find('.aye-breadcrumb').text()).toContain('當期總覽')
  })

  it('麵包屑 fallback：路由只有 meta.title（無 meta.breadcrumb）時顯示該 title', async () => {
    await router.push('/appraisal-year-end/year-end')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    const segments = w.find('.aye-breadcrumb').findAll('.el-breadcrumb__inner').map((n) => n.text())
    expect(segments).toEqual(['考核與年終', '年終'])
  })
})

describe('AppraisalYearEndLayout — 齒輪（規則設定）入口', () => {
  beforeEach(async () => {
    permState.read = true; permState.settings = false; permState.finalize = false
    await router.push('/appraisal-year-end/appraisal/current')
    await router.isReady()
  })

  it('有 APPRAISAL_READ 權限時齒輪顯示，帶 aria-label', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const gear = w.find('.aye-gear')
    expect(gear.exists()).toBe(true)
    expect(gear.attributes('aria-label')).toBe('規則與進階設定')
  })

  it('點擊齒輪導向 /appraisal-year-end/rules', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await w.find('.aye-gear').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules')
  })

  it('無 APPRAISAL_READ 且無 SETTINGS_READ 時齒輪不顯示', () => {
    permState.read = false
    permState.settings = false
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    expect(w.find('.aye-gear').exists()).toBe(false)
  })

  it('只有 SETTINGS_READ（無 APPRAISAL_READ）時齒輪仍顯示', () => {
    permState.read = false
    permState.settings = true
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    expect(w.find('.aye-gear').exists()).toBe(true)
  })
})

describe('AppraisalYearEndLayout — activeKey 折算（payout/rules/exceptions 不獨立佔段）', () => {
  beforeEach(() => { permState.read = true; permState.settings = false; permState.finalize = true })

  it('停在 payout 路由時 segmented 高亮「年終」（發放已併入年終網域）', async () => {
    await router.push('/appraisal-year-end/year-end/payout')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('year-end')
  })

  it('年終週期工作區路由（/year-end/cycles/:id）activeKey 落在「年終」', async () => {
    await router.push('/appraisal-year-end/year-end/cycles/7')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('year-end')
  })

  it('停在規則設定路由時 segmented 不高亮任何段', async () => {
    await router.push('/appraisal-year-end/rules')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('')
  })

  it('停在例外中心路由時 segmented 不高亮任何段', async () => {
    await router.push('/appraisal-year-end/exceptions')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('')
  })
})
```

- [ ] **Step 2: 跑測試確認全紅**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`
Expected: FAIL（多筆斷言失敗：`.aye-gear` 不存在、`options` 仍是舊 6 筆、`modelValue` 不是 `'year-end'`/`''`）

- [ ] **Step 3: 改寫 `AppraisalYearEndLayout.vue`**

整份取代為：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

interface SectionDef { key: string; label: string; to: string; can: () => boolean }

// V2 IA 簡化（2026-08-16）：六段 segmented（總覽/考核/年終/發放/規則設定/例外中心）
// 收斂為三段（待辦/考核/年終）+ 齒輪。發放併入年終網域（由年終清單/工作區內連結導覽，
// 路由 /appraisal-year-end/year-end/payout 不變）；規則設定改齒輪按鈕（不佔 segmented 名額，
// 路由 /appraisal-year-end/rules 不變）；例外中心併入待辦頁（由待辦頁例外卡導覽，
// 路由 /appraisal-year-end/exceptions 不變）。
const SECTIONS: SectionDef[] = [
  { key: 'todo', label: '待辦', to: '/appraisal-year-end/todo',
    can: () => ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'].some((p) => hasPermission(p)) },
  { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal/current', can: () => hasPermission('APPRAISAL_READ') },
  { key: 'year-end', label: '年終', to: '/appraisal-year-end/year-end',
    can: () => hasPermission('YEAR_END_READ') || hasPermission('APPRAISAL_FINALIZE') },
]

const route = useRoute()
const router = useRouter()
const sections = computed(() => SECTIONS.filter((s) => s.can()))
const canRules = computed(() => hasPermission('APPRAISAL_READ') || hasPermission('SETTINGS_READ'))
// payout／規則設定／例外中心不在 SECTIONS 名單內：payout 折算回「年終」高亮，
// rules／exceptions 不特別高亮任何段（'' 不匹配任何 option.value）。
const activeKey = computed(() => {
  if (route.path.startsWith('/appraisal-year-end/year-end/payout')) return 'year-end'
  const seg = route.path.split('/')[2] ?? 'todo'
  if (seg === 'overview') return 'todo'
  if (seg === 'rules' || seg === 'exceptions') return ''
  return seg
})
const segmentedOptions = computed(() => sections.value.map((s) => ({ label: s.label, value: s.key })))
const onSectionChange = (val: string | number) => {
  const target = SECTIONS.find((s) => s.key === String(val))
  if (target && activeKey.value !== target.key) router.push(target.to)
}
const goRules = () => router.push('/appraisal-year-end/rules')

const crumbs = computed(() => {
  const tail = route.matched
    .filter((m) => m.path !== '/appraisal-year-end' && (m.meta?.title || m.meta?.breadcrumb))
    .flatMap((m) => {
      const bc = m.meta?.breadcrumb as string[] | undefined
      if (Array.isArray(bc) && bc.length > 0) return bc.map(String)
      return m.meta?.title ? [String(m.meta.title)] : []
    })
  const extra = (route.meta?.breadcrumbExtra as string | undefined)
  return ['考核與年終', ...tail, ...(extra ? [extra] : [])]
})
</script>

<template>
  <div class="aye-layout">
    <div class="aye-topbar">
      <el-segmented
        v-if="segmentedOptions.length > 0"
        class="aye-nav"
        :model-value="activeKey"
        :options="segmentedOptions"
        size="large"
        @change="onSectionChange"
      />
      <button
        v-if="canRules"
        type="button"
        class="aye-gear"
        aria-label="規則與進階設定"
        title="規則與進階設定"
        @click="goRules"
      >
        <el-icon><Setting /></el-icon>
      </button>
    </div>
    <el-breadcrumb v-if="crumbs.length > 1" class="aye-breadcrumb" separator="›">
      <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i">{{ c }}</el-breadcrumb-item>
    </el-breadcrumb>
    <div class="aye-body">
      <router-view />
    </div>
    <el-empty v-if="segmentedOptions.length === 0" description="無權限檢視此頁" />
  </div>
</template>

<style scoped>
.aye-layout { padding: var(--space-5); }
.aye-topbar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.aye-nav { flex: 0 0 auto; }
.aye-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 150ms, color 150ms;
}
.aye-gear:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.aye-gear:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.aye-breadcrumb { margin-bottom: var(--space-4); }
</style>
```

（`PAGE_TERMS` import 已移除——`exceptions` SECTIONS 項砍掉後不再使用，保留會撞 `noUnusedLocals`。）

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`
Expected: PASS（全部 it block 通過）

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint -- src/views/appraisalYearEnd/AppraisalYearEndLayout.vue src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`
Expected: 兩者皆 0 錯誤

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisalYearEnd/AppraisalYearEndLayout.vue src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts
git commit -m "feat(appraisal-year-end): 頂層導覽六段收斂為待辦/考核/年終三段+齒輪

規則設定改獨立齒輪按鈕（不佔 segmented 名額）；發放/例外中心不再是頂層段，
路由與內容不變，改由待辦頁例外卡與年終網域內連結導覽（V2 IA 簡化 Phase 1 Batch 1）。"
```

---

### Task 2: 路由重新命名 `overview` → `todo`（含 legacy redirect）

**Files:**
- Modify: `src/router/index.ts`（`/appraisal-year-end` 巢狀路由區塊，約在 `resolveLegacySectionQuery` 函式之後、`children` 陣列第一筆）
- Modify: `src/router/__tests__/appraisalYearEndRedirects.spec.ts`（`CASES` 陣列，第 18 行附近）

**Interfaces:**
- Consumes：`resolveLegacySectionQuery(to: RouteLocation): RouteLocationRaw | null`（`src/router/index.ts` 內既有函式，本 task 不改動其函式體，只改呼叫端 `?? '/appraisal-year-end/overview'` 的 fallback 字串）
- Produces：路由 name `aye-todo`（取代 `aye-overview`）；`src/router/index.ts` 已 `export const routes = [...]`（`appraisalYearEndRedirects.spec.ts:3` 已在用，本 task 不新增此 export，若發現尚未 export 需視為前置條件不成立，先回報而非自行推測改法）。

- [ ] **Step 1: 確認前置條件與現況（唯讀）**

```bash
grep -n "aye-overview\|/appraisal-year-end/overview\|export const routes" src/router/index.ts
```

預期看到三處：① `redirect: (to) => resolveLegacySectionQuery(to) ?? '/appraisal-year-end/overview'`（父路由）② `{ path: 'overview', name: 'aye-overview', component: () => import('../views/appraisalYearEnd/OverviewWorkbenchView.vue'), meta: { title: '總覽' } }`（第一個子路由）③ `export const routes = ...`（檔案底部或路由陣列宣告處，若不存在此 export，`appraisalYearEndRedirects.spec.ts` 現有測試會全部找不到 `routes` 而報 import error——這種情況先停下回報，不要自行臆測改法）。

- [ ] **Step 2: 更新測試（先紅）**

在 `src/router/__tests__/appraisalYearEndRedirects.spec.ts` 的 `CASES` 陣列中：

把第 18 行
```ts
  ['/appraisal-year-end', '/appraisal-year-end/overview'],
```
改為
```ts
  ['/appraisal-year-end', '/appraisal-year-end/todo'],
  ['/appraisal-year-end/overview', '/appraisal-year-end/todo'],
```
（第一行維持「訪問根路徑」情境改期望值；第二行新增「訪問舊 overview 路徑」情境，驗證新增的 legacy redirect 子路由生效。）

- [ ] **Step 3: 跑測試確認紅**

Run: `npm run test -- --run src/router/__tests__/appraisalYearEndRedirects.spec.ts`
Expected: FAIL（`'/appraisal-year-end'` case 落地路徑仍是 `/appraisal-year-end/overview`≠期望 `/appraisal-year-end/todo`；新增的 `/appraisal-year-end/overview` case 落地路徑等於輸入路徑本身，尚無 redirect）

- [ ] **Step 4: 改路由**

在 `src/router/index.ts` 的 `/appraisal-year-end` 路由物件：

1. 把 `redirect: (to) => resolveLegacySectionQuery(to) ?? '/appraisal-year-end/overview'` 改為 `redirect: (to) => resolveLegacySectionQuery(to) ?? '/appraisal-year-end/todo'`。
2. 把 `children` 陣列第一筆
   ```ts
   { path: 'overview', name: 'aye-overview', component: () => import('../views/appraisalYearEnd/OverviewWorkbenchView.vue'), meta: { title: '總覽' } },
   ```
   改為兩筆（保留舊路徑作 redirect，元件掛載路徑改名並改 meta 標題）：
   ```ts
   { path: 'todo', name: 'aye-todo', component: () => import('../views/appraisalYearEnd/OverviewWorkbenchView.vue'), meta: { title: '待辦' } },
   { path: 'overview', redirect: '/appraisal-year-end/todo' },
   ```

- [ ] **Step 5: 跑測試確認綠**

Run: `npm run test -- --run src/router/__tests__/appraisalYearEndRedirects.spec.ts`
Expected: PASS（全部 case 通過，含新增的 `overview`→`todo` case）

- [ ] **Step 6: 跑其餘可能受影響的路由/manifest 測試**

Run: `npm run test -- --run src/router src/constants/navigation`
Expected: PASS。若有紅燈，逐一確認是否因本次改動造成（多半是 fixture 內仍寫死 `aye-overview`/`/overview` 的舊測試）：
- 若紅燈斷言引用 `'/appraisal-year-end/overview'` 且該測試本意是「驗證舊路徑仍可用」→ 改期望值為 `/appraisal-year-end/todo`（比照 Step 2 手法）。
- 若紅燈與本次改動無關（既有債）→ 對 `git stash` 或臨時切到 base commit `origin/main` 跑同一測試確認是否本就紅，若是既有債則不動，於完成回報中列出。

- [ ] **Step 7: typecheck**

Run: `npm run typecheck`
Expected: 0 新增錯誤

- [ ] **Step 8: Commit**

```bash
git add -- src/router/index.ts src/router/__tests__/appraisalYearEndRedirects.spec.ts
git commit -m "feat(appraisal-year-end): 總覽路由改名為待辦（overview→todo）並保留舊路徑 redirect

/appraisal-year-end/overview 舊書籤與後端 deep_link 仍可用，導向新的 /todo；
OverviewWorkbenchView.vue 內容本身不變（V2 IA 簡化 Phase 1 Batch 1）。"
```

若 Step 6 發現需要額外修正的既有測試檔（非本計畫已列出的兩檔），在該檔案的獨立 commit 中處理，不要混進本 commit。

---

## Self-Review 記錄（plan 撰寫者自查）

1. **Spec coverage**：ux-spec §1.1 IA 對照表中「總覽→待辦」「規則設定→齒輪」兩項本 batch 完整覆蓋；「例外中心→拆併」「發放→併年終」在本 batch 只做「不再佔頂層段」（路由與內容不變），完整拆併（KPI 卡樣式、URL 狀態同步）留待後續 batch，已在 Goal 段落明確排除範圍。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼與精確指令，無 TBD/待補。
3. **Type consistency**：`SectionDef` 型別、`canRules`/`activeKey`/`goRules` 命名在 Task 1 內部一致；Task 2 未新增型別，沿用既有 `RouteLocationRaw`。
