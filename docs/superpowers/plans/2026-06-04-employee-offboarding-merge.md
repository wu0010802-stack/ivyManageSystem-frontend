# 員工管理 × 離職管理 整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將「離職管理」收進「員工管理」頁面成為 `el-segmented` 分頁，移除側邊欄獨立入口，純前端、不動後端。

**Architecture:** 新增薄殼 wrapper view `EmployeeHubView.vue`，用 `el-segmented` + `?section=` query 包住既有 `EmployeeView`（員工管理）與 `OffboardingView`（離職管理）兩個 view 當分頁，子 view 懶載入、不改其內部。`/employees` 指向 wrapper；`/admin/offboarding` 改 redirect。完全比照已上線的 `AppraisalYearEndView.vue` 慣例。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus（`el-segmented`）、vue-router 4、Vitest + @vue/test-utils。

> **分支前置（已完成）**：本功能依賴 local main 上「已完成但未 push」的工作（`AppraisalYearEndView` 模式、目前 1387 行 EmployeeView、含年終整合的 router），origin/main 落後尚無——經 user 確認，**base 取 local main `a0802ec1`**，完成後 `--no-ff` 併回 local main（不走 origin PR，故不違反「worktree 勿從 local main」的 PR 情境）。
> worktree 已建立於 `.claude/worktrees/employee-offboarding`（branch `feat/employee-offboarding-merge-fe`，off `a0802ec1`）：
> - node_modules tracked symlink 已重指向主 checkout 絕對路徑（`ln -s /Users/yilunwu/Desktop/ivy-frontend/node_modules`）；`git status` 會顯示 ` M node_modules`——**這是 workaround，絕不 commit**。
> - spec + plan 兩份 doc 已複製進 worktree。
> **所有 `git` / `npm` / `npx vitest` 指令都在 worktree `/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/employee-offboarding` 內執行；commit 一律 `git add <具體檔>`，禁 `git add -A`/`.`（避免帶進 node_modules 與他人 WIP）。**

---

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `src/views/EmployeeHubView.vue` | Create | 薄殼 wrapper：segmented 分頁切換 + `?section=` 深連結 |
| `src/views/__tests__/EmployeeHubView.spec.ts` | Create | wrapper 單元測試（分頁渲染 / 深連結 / URL 修正 / 切換） |
| `src/router/index.ts` | Modify | `/employees` 指向 wrapper；`/admin/offboarding` 改 redirect |
| `src/router/__tests__/offboardingRedirect.spec.ts` | Create | redirect 解析測試（follow() helper） |
| `src/components/layout/AdminSidebar.vue` | Modify | 移除「離職管理」menu item |
| `src/constants/permissions.ts` | Modify | 移除 `/admin/offboarding` 死路由權限規則 |
| `src/views/admin/OffboardingView.vue` | Modify | 內嵌後移除自身 page padding（改由 wrapper 提供） |

---

## Task 1: 建立 EmployeeHubView 薄殼 wrapper（TDD）

**Files:**
- Create: `src/views/__tests__/EmployeeHubView.spec.ts`
- Create: `src/views/EmployeeHubView.vue`

- [ ] **Step 1: 先寫失敗測試**

建立 `src/views/__tests__/EmployeeHubView.spec.ts`（mirror `AppraisalYearEndView.spec.ts` 的 mock/stub 慣例；本 wrapper 不用 `hasPermission`，故無 auth mock）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

import EmployeeHubView from '../EmployeeHubView.vue'

const stubs = {
  EmployeeView: { name: 'EmployeeView', template: '<div class="stub-employees" />' },
  OffboardingView: { name: 'OffboardingView', template: '<div class="stub-offboarding" />' },
  ElSegmented: {
    name: 'ElSegmented',
    props: ['modelValue', 'options'],
    emits: ['change'],
    template: '<div class="stub-seg" />',
  },
}

function mountWith(query: Record<string, unknown> = {}) {
  mockQuery = query
  replace.mockClear()
  return mount(EmployeeHubView, { global: { stubs } })
}

describe('EmployeeHubView shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('預設（無 section query）→ 渲染員工子元件並 normalize URL', () => {
    const w = mountWith()
    expect(w.find('.stub-employees').exists()).toBe(true)
    expect(w.find('.stub-offboarding').exists()).toBe(false)
    const seg = w.findComponent({ name: 'ElSegmented' })
    expect(seg.props('modelValue')).toBe('employees')
    expect(seg.props('options')).toEqual([
      { label: '員工管理', value: 'employees' },
      { label: '離職管理', value: 'offboarding' },
    ])
    expect(replace).toHaveBeenCalledWith({ query: { section: 'employees' } })
  })

  it('deep link ?section=offboarding → 渲染離職子元件且不 replace', () => {
    const w = mountWith({ section: 'offboarding' })
    expect(w.find('.stub-offboarding').exists()).toBe(true)
    expect(w.find('.stub-employees').exists()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('不合法 section → fallback 員工並 replace 修正', () => {
    mountWith({ section: 'nope' })
    expect(replace).toHaveBeenCalledWith({ query: { section: 'employees' } })
  })

  it('切換 segmented → router.replace 更新 section', async () => {
    const w = mountWith({ section: 'employees' })
    replace.mockClear()
    w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'offboarding')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'offboarding' } })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/__tests__/EmployeeHubView.spec.ts`
Expected: FAIL（`Failed to resolve import "../EmployeeHubView.vue"` 或找不到元件）

- [ ] **Step 3: 建立 wrapper 元件**

建立 `src/views/EmployeeHubView.vue`：

```vue
<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

const EmployeeView = defineAsyncComponent(() => import('./EmployeeView.vue'))
const OffboardingView = defineAsyncComponent(() => import('./admin/OffboardingView.vue'))

type SectionKey = 'employees' | 'offboarding'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'employees', label: '員工管理' },
  { key: 'offboarding', label: '離職管理' },
]

const segmentedOptions = SECTIONS.map((s) => ({ label: s.label, value: s.key }))

const route = useRoute()
const router = useRouter()

const resolveSection = (raw: unknown): SectionKey => {
  const r = Array.isArray(raw) ? raw[0] : raw
  return SECTIONS.find((s) => s.key === r)?.key ?? SECTIONS[0].key
}

const activeSection = ref<SectionKey>(resolveSection(route.query.section))

// 缺漏 / 不合法 section → 修正 URL 到第一個分頁（與 AppraisalYearEndView 一致）
if (route.query.section !== activeSection.value) {
  router.replace({ query: { ...route.query, section: activeSection.value } })
}

watch(
  () => route.query.section,
  (next) => {
    const resolved = resolveSection(next)
    if (resolved !== activeSection.value) activeSection.value = resolved
  },
)

const onSectionChange = (val: string | number) => {
  const next = String(val) as SectionKey
  if (next === activeSection.value) return
  const query: LocationQueryRaw = { ...route.query, section: next }
  router.replace({ query })
}
</script>

<template>
  <div class="employee-hub-view">
    <el-segmented
      :model-value="activeSection"
      :options="segmentedOptions"
      size="large"
      class="section-switcher"
      @change="onSectionChange"
    />
    <div class="section-body">
      <EmployeeView v-if="activeSection === 'employees'" />
      <OffboardingView v-else-if="activeSection === 'offboarding'" />
    </div>
  </div>
</template>

<style scoped>
.employee-hub-view {
  padding: var(--space-5);
}
.section-switcher {
  margin-bottom: var(--space-4);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/__tests__/EmployeeHubView.spec.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 無新增錯誤（與改動前 baseline 一致）

- [ ] **Step 6: Commit**

```bash
git add src/views/EmployeeHubView.vue src/views/__tests__/EmployeeHubView.spec.ts
git commit -m "feat(employees): 新增員工管理/離職管理整合 wrapper EmployeeHubView"
```

---

## Task 2: 路由改接 wrapper + 舊離職路由 redirect（TDD）

**Files:**
- Create: `src/router/__tests__/offboardingRedirect.spec.ts`
- Modify: `src/router/index.ts`（`/employees` 區塊 line 44-49；`/admin/offboarding` 區塊 line 275-281）

- [ ] **Step 1: 先寫失敗測試**

建立 `src/router/__tests__/offboardingRedirect.spec.ts`（沿用 `legacyRedirects.spec.ts` 的 `follow()` helper —— vue-router 4 的 `resolve()` 不追 redirect，必須手動取 `matched[-1].redirect` 二次 resolve）：

```ts
/**
 * vue-router 4 的 router.resolve() 不追蹤 redirect；用 follow() 手動取
 * matched[-1].redirect 並二次 resolve（與 legacyRedirects.spec.ts 同手法）。
 */
import { describe, it, expect } from 'vitest'
import type { RouteLocationRaw } from 'vue-router'
import router from '@/router'

function follow(from: string) {
  const res = router.resolve(from)
  const last = res.matched[res.matched.length - 1]
  if (!last?.redirect) return res
  const target: RouteLocationRaw =
    typeof last.redirect === 'function'
      ? (last.redirect as (r: typeof res) => RouteLocationRaw)(res)
      : last.redirect
  return router.resolve(target)
}

describe('離職管理舊路由 → 員工管理整合頁 redirect', () => {
  it('/admin/offboarding → /employees?section=offboarding', () => {
    const r = follow('/admin/offboarding')
    expect(r.path).toBe('/employees')
    expect(r.query.section).toBe('offboarding')
  })

  it('保留 query merge：/admin/offboarding?foo=1 → 帶上 foo', () => {
    const r = follow('/admin/offboarding?foo=1')
    expect(r.path).toBe('/employees')
    expect(r.query.section).toBe('offboarding')
    expect(r.query.foo).toBe('1')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/router/__tests__/offboardingRedirect.spec.ts`
Expected: FAIL（`/admin/offboarding` 目前是 component route，`r.path` 仍是 `/admin/offboarding`、無 `section`）

- [ ] **Step 3: 改 `/employees` 指向 wrapper**

在 `src/router/index.ts` line 44-49，將：

```ts
        {
            path: '/employees',
            name: 'employees',
            component: () => import('../views/EmployeeView.vue'),
            meta: { title: '員工管理' }
        },
```

改為：

```ts
        {
            path: '/employees',
            name: 'employees',
            component: () => import('../views/EmployeeHubView.vue'),
            meta: { title: '員工管理' }
        },
```

- [ ] **Step 4: 把 `/admin/offboarding` 改成 redirect**

在 `src/router/index.ts` line 275-281，將：

```ts
        // ============ 離職管理 ============
        {
            path: '/admin/offboarding',
            name: 'admin-offboarding',
            component: () => import('@/views/admin/OffboardingView.vue'),
            meta: { title: '離職管理', requiresAuth: true, permission: 'EMPLOYEES_READ' },
        },
```

改為（沿用同檔 `/students` → `/appraisal-year-end?section=payout` 的 redirect-with-query 先例）：

```ts
        // ============ 離職管理（已整合進員工管理 /employees?section=offboarding）============
        {
            path: '/admin/offboarding',
            redirect: (to) => ({ path: '/employees', query: { ...to.query, section: 'offboarding' } }),
        },
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/router/__tests__/offboardingRedirect.spec.ts`
Expected: PASS（2 passed）

- [ ] **Step 6: Commit**

```bash
git add src/router/index.ts src/router/__tests__/offboardingRedirect.spec.ts
git commit -m "feat(router): /employees 接整合 wrapper、/admin/offboarding 改 redirect"
```

---

## Task 3: 移除側邊欄離職入口 + 清理死路由權限規則

**Files:**
- Modify: `src/components/layout/AdminSidebar.vue`（line 48-51）
- Modify: `src/constants/permissions.ts`（line 135-136）

- [ ] **Step 1: 移除側邊欄「離職管理」menu item**

在 `src/components/layout/AdminSidebar.vue`，刪除這整塊：

```vue
          <el-menu-item v-if="canView.EMPLOYEES_READ" index="/admin/offboarding">
            <el-icon><SwitchButton /></el-icon>
            <template #title>離職管理</template>
          </el-menu-item>
```

刪除後人事薪資群組剩「員工管理」`/employees` 與「薪資管理」`/salary` 緊鄰。

> 註：`SwitchButton` icon 若刪除後在本檔不再有其他使用處，移除其 import 以免 `noUnusedLocals` 報錯；若仍有他處使用則保留。Step 5 typecheck 會抓出。

- [ ] **Step 2: 清掉 `/admin/offboarding` 死路由權限規則**

在 `src/constants/permissions.ts` line 135-136，刪除：

```ts
  // 離職管理（路徑 /admin/offboarding 獨立 prefix，沿用 EMPLOYEES_READ 為 navigation gate）
  { path: '/admin/offboarding', permission: 'EMPLOYEES_READ' },
```

理由：`/admin/offboarding` 已改 redirect，路由守衛 `canAccessRoute(to.path)` 解析後 `to.path` 為 `/employees`（line 86 已有 `{ path: '/employees', permission: 'EMPLOYEES_READ' }` 守住），此規則不再被命中。`/employees` 權限不變（EMPLOYEES_READ）。

- [ ] **Step 3: 跑側邊欄測試**

Run: `npx vitest run src/components/layout/__tests__/`
Expected: PASS（無對「離職管理」項的硬斷言；若有計數類斷言需同步調整）

- [ ] **Step 4: 跑 permissions 相關測試**

Run: `npx vitest run src/constants/ src/utils/__tests__/auth.spec.ts`
Expected: PASS（若 auth/canAccessRoute 測試對 `/admin/offboarding` 有斷言，改為驗證 redirect 後的 `/employees`）

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 errors（特別確認 SwitchButton import 未殘留 unused）

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/AdminSidebar.vue src/constants/permissions.ts
git commit -m "feat(nav): 移除離職管理側邊欄入口與死路由權限規則"
```

---

## Task 4: OffboardingView 內嵌後移除自身 page padding

**Files:**
- Modify: `src/views/admin/OffboardingView.vue`（`.offboarding-view` style，約 line 232）

說明：`OffboardingView` 現在內嵌於 wrapper（wrapper 已提供 `padding: var(--space-5)`），其自身 `.offboarding-view { padding: 24px }` 會造成雙重留白。改為 0，與員工分頁對齊。

- [ ] **Step 1: 改 padding**

在 `src/views/admin/OffboardingView.vue` 的 `<style scoped>`，將：

```css
.offboarding-view {
    padding: 24px;
}
```

改為：

```css
.offboarding-view {
    padding: 0;
}
```

- [ ] **Step 2: 跑既有 OffboardingView 測試（若有）+ typecheck**

Run: `npx vitest run src/views/admin/ && npm run typecheck`
Expected: PASS / 0 errors（純 CSS 改動，不影響邏輯）

- [ ] **Step 3: Commit**

```bash
git add src/views/admin/OffboardingView.vue
git commit -m "style(offboarding): 內嵌整合頁後移除重複 page padding"
```

---

## Task 5: 整體驗證（typecheck + 全測試 + 手動 smoke）

**Files:** 無（驗證任務）

- [ ] **Step 1: 記錄 baseline 失敗集合（改動前比較基準）**

> 本 repo 全測試套件偶有 isolation flaky（見 memory `feedback_vitest_usechartjs_mock_and_flaky_isolation`）。先確認本功能新增/改動的測試「目標綠」，再跑全套件並與 baseline 比對，避免把既有 flaky 誤判為回歸。

Run（在 `origin/main` 或乾淨基準上先跑一次留存）：`npm run test 2>&1 | tail -30`
記下既有 failing 數量與檔名。

- [ ] **Step 2: 跑本功能全部新增/相關測試**

Run:
```bash
npx vitest run \
  src/views/__tests__/EmployeeHubView.spec.ts \
  src/router/__tests__/offboardingRedirect.spec.ts \
  src/components/layout/__tests__/
```
Expected: 全 PASS

- [ ] **Step 3: typecheck 全綠**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 4: 全測試套件無新增回歸**

Run: `npm run test 2>&1 | tail -30`
Expected: failing 集合 ⊆ Step 1 baseline（無因本功能新增的 failure）

- [ ] **Step 5: 手動 smoke（起 dev server）**

```bash
cd /Users/yilunwu/Desktop/ivyManageSystem && ./start.sh   # 前端 http://localhost:5173
```

逐項確認：
1. 進 `/employees` → 顯示 `el-segmented`「員工管理 | 離職管理」，預設停在「員工管理」，URL normalize 成 `/employees?section=employees`，員工清單與「新增員工 / 匯出 / 搜尋 / 辦理離職」皆正常。
2. 點「離職管理」分頁 → URL 變 `/employees?section=offboarding`，離職員工清單、Checklist 狀態、離職證明下載、Magic Link「管理」drawer 皆正常；左右留白與員工分頁一致（無雙重 padding）。
3. 重整 `/employees?section=offboarding` → 直接停在離職分頁（深連結成立）。
4. 直接輸入舊網址 `/admin/offboarding` → 自動導到 `/employees?section=offboarding`。
5. 側邊欄「人事薪資」群組 → 只剩「員工管理 / 薪資管理…」，無「離職管理」獨立項。
6. 在員工分頁對某在職員工按「辦理離職」→ modal 三階段（input→preview→process）正常，辦理後切到離職分頁能看到該員工。

- [ ] **Step 6: 收尾**

- 確認 6 個手動項目全過。
- 本功能不需 `gen:api`（純前端、無後端契約改動）。
- 依 `finishing-a-development-branch` 流程與 user 確認 merge / push（**勿自行 push**）。

---

## Self-Review 對照（spec → task）

- spec §1 wrapper（segmented + `?section=` 深連結 + 懶載入 + 同骨架）→ Task 1。
- spec §2 第一分頁「員工管理」內容不變、EmployeeView 零改動 → Task 1（wrapper 只 `v-if` 掛載，未改 EmployeeView）+ Task 5 手動驗證。
- spec §3 路由（`/employees` 接 wrapper、`/admin/offboarding` redirect）→ Task 2。
- spec §4 側邊欄移除離職項 → Task 3。
- spec §5 OffboardingView 行為不變（內嵌）→ Task 1 掛載 + Task 4 僅去重複 padding（未改邏輯）。「可選小優化：改讀 employeeStore」列為 **非目標**（YAGNI，本次不做，保留 OffboardingView 既有抓取以縮小改動面）。
- spec §6 內部連結（GlobalSearch 無離職項、無硬連結殘留）→ Task 2 redirect 兜底 + Task 5 手動驗證；無程式改動。
- spec 測試章節 → Task 1 / Task 2 新測試 + Task 5 全套件比對。
- spec 風險（大檔不膨脹 / 死路由兜底 / 分支隔離）→ 薄殼設計 + redirect + 分支前置。
