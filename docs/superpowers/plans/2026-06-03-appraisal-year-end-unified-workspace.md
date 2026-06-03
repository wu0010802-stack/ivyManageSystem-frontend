# 考核 × 年終 整合工作區 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「考核管理 / 年終獎金 / 考核年終 payout」整併到人事薪資底下的單一工作區頁面 `/appraisal-year-end`，外層 `el-segmented` 切換、內部包現有頁面不改寫。

**Architecture:** Thin shell 元件用 `el-segmented` 切 3 個 section，各 section 以 `defineAsyncComponent` + `v-if` lazy mount 既有 view（不動其內部）。新路由承載三種權限 → 在 `ROUTE_PERMISSION_RULES` 加 4 條 OR 規則；舊路由改 redirect 保留書籤。側邊欄整併並修兩個群組可見性回歸 bug。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、vue-router 4（hash history）、Element Plus 2.13.2（`el-segmented`）、Vitest + @vue/test-utils、unplugin-vue-components 自動匯入。

**Spec:** `docs/superpowers/specs/2026-06-03-appraisal-year-end-unified-workspace-design.md`

---

## 前置：分支與 commit 紀律

- 前端 repo 目前在 `fix/bug-sweep-2026-06-02-frontend`，帶有未提交的 attendance WIP。**實作前**：自 `origin/main` 開乾淨分支（例 `feat/appraisal-year-end-unified`，依 workspace 慣例不要從 local main 開），避免把 WIP 拉進來。
- 每個 commit 用**具名檔案** `git add <path…>`（**禁** `git add -A`/`.`），避免掃進 attendance WIP。
- **不 push**，直到 user 明確要求。

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `src/constants/permissions.ts` | Modify | 加 `/appraisal-year-end` 4 條 OR 路由權限規則 |
| `src/views/AppraisalYearEndView.vue` | Create | shell：`el-segmented` 外層 + 3 section lazy mount + 權限過濾 + query 同步 |
| `src/views/__tests__/AppraisalYearEndView.spec.ts` | Create | shell 單元測試 |
| `src/router/index.ts` | Modify | 新增 `/appraisal-year-end` 路由；5 條舊路由改 redirect |
| `src/router/__tests__/legacyRedirects.spec.ts` | Create | redirect resolve 測試 |
| `src/components/layout/AdminSidebar.vue` | Modify | 選單整併 + 修 2 個群組可見性回歸 |
| `src/components/layout/__tests__/AdminSidebar.spec.ts` | Create | 側邊欄群組可見性回歸測試 |
| `components.d.ts` | Modify | 補 `ElSegmented` 型別宣告（auto-import typing） |

被包頁面 `AppraisalManagementView.vue` / `yearEnd/YearEndListView.vue` / `yearEnd/AppraisalPayoutView.vue` 與所有下鑽路由**不動**。

---

### Task 1: 路由權限規則（`ROUTE_PERMISSION_RULES`）

**Files:**
- Modify: `src/constants/permissions.ts`（在 `/year-end/appraisal-payout` 規則後，約 line 128）
- Test: `src/utils/__tests__/appraisalYearEndRoute.spec.ts`（Create）

- [ ] **Step 1: 寫失敗測試**

Create `src/utils/__tests__/appraisalYearEndRoute.spec.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setUserInfo, clearAuth, canAccessRoute } from '@/utils/auth'

describe('canAccessRoute /appraisal-year-end (整合工作區)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it.each(['SETTINGS_READ', 'SALARY_READ', 'YEAR_END_READ', 'APPRAISAL_FINALIZE'])(
    '持有 %s 即可存取',
    (perm) => {
      setUserInfo({ role: 'admin', permission_names: [perm] })
      expect(canAccessRoute('/appraisal-year-end')).toBe(true)
    },
  )

  it('四者皆無則拒絕', () => {
    setUserInfo({ role: 'admin', permission_names: ['DASHBOARD'] })
    expect(canAccessRoute('/appraisal-year-end')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/utils/__tests__/appraisalYearEndRoute.spec.ts`
Expected: FAIL — 四者皆無的 case 通過，但持有單一權限的 case 失敗（無規則 → default-deny → `canAccessRoute` 回 `false`）。

- [ ] **Step 3: 加路由權限規則**

在 `src/constants/permissions.ts` 的 `ROUTE_PERMISSION_RULES` 陣列中，緊接在
`{ path: '/year-end/appraisal-payout', permission: 'APPRAISAL_FINALIZE' },` 之後插入：

```ts
  // 考核 × 年終 整合工作區：承載三種權限，OR 語意（任一即可進頁，section 層再各自守門）
  { path: '/appraisal-year-end', permission: 'SETTINGS_READ' },
  { path: '/appraisal-year-end', permission: 'SALARY_READ' },
  { path: '/appraisal-year-end', permission: 'YEAR_END_READ' },
  { path: '/appraisal-year-end', permission: 'APPRAISAL_FINALIZE' },
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/utils/__tests__/appraisalYearEndRoute.spec.ts`
Expected: PASS（5 個 case 全綠）

- [ ] **Step 5: Commit**

```bash
git add src/constants/permissions.ts src/utils/__tests__/appraisalYearEndRoute.spec.ts
git commit -m "feat(perm): 新增考核年終整合工作區路由權限規則"
```

---

### Task 2: Shell 元件 `AppraisalYearEndView.vue`

**Files:**
- Create: `src/views/AppraisalYearEndView.vue`
- Create: `src/views/__tests__/AppraisalYearEndView.spec.ts`
- Modify: `components.d.ts`（補 ElSegmented）

- [ ] **Step 1: 寫失敗測試**

Create `src/views/__tests__/AppraisalYearEndView.spec.ts`：

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

const hasPermission = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermission(...a),
}))

import AppraisalYearEndView from '../AppraisalYearEndView.vue'

const stubs = {
  AppraisalManagementView: { name: 'AppraisalManagementView', template: '<div class="stub-appraisal" />' },
  YearEndListView: { name: 'YearEndListView', template: '<div class="stub-year-end" />' },
  AppraisalPayoutView: { name: 'AppraisalPayoutView', template: '<div class="stub-payout" />' },
  ElSegmented: {
    name: 'ElSegmented',
    props: ['modelValue', 'options'],
    emits: ['change'],
    template: '<div class="stub-seg" />',
  },
  ElEmpty: { name: 'ElEmpty', template: '<div class="stub-empty" />' },
}

function mountWith(perms: string[], query: Record<string, unknown> = {}) {
  hasPermission.mockImplementation((p: string) => perms.includes(p))
  mockQuery = query
  replace.mockClear()
  return mount(AppraisalYearEndView, { global: { stubs } })
}

describe('AppraisalYearEndView shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('只渲染有權限的 section（只有 YEAR_END_READ → 年終獎金）', () => {
    const w = mountWith(['YEAR_END_READ'])
    const seg = w.findComponent({ name: 'ElSegmented' })
    expect(seg.props('options')).toEqual([{ label: '年終獎金', value: 'year-end' }])
    expect(w.find('.stub-year-end').exists()).toBe(true)
    expect(w.find('.stub-appraisal').exists()).toBe(false)
    expect(w.find('.stub-payout').exists()).toBe(false)
  })

  it('缺 section query → 落第一個可用並 replace 修正', () => {
    mountWith(['YEAR_END_READ'])
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })

  it('deep link ?section=payout + APPRAISAL_FINALIZE → 顯示 payout', () => {
    const w = mountWith(['APPRAISAL_FINALIZE'], { section: 'payout' })
    expect(w.find('.stub-payout').exists()).toBe(true)
    expect(replace).not.toHaveBeenCalled()
  })

  it('?section 指向無權限 section → fallback 第一個可用', () => {
    mountWith(['YEAR_END_READ'], { section: 'payout' })
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })

  it('完全無權限 → 隱藏切換器、顯示 el-empty', () => {
    const w = mountWith([])
    expect(w.find('.stub-seg').exists()).toBe(false)
    expect(w.find('.stub-empty').exists()).toBe(true)
  })

  it('切離 appraisal 時清掉 tab query', async () => {
    const w = mountWith(['SETTINGS_READ', 'YEAR_END_READ'], { section: 'appraisal', tab: 'settings' })
    replace.mockClear()
    w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'year-end')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/__tests__/AppraisalYearEndView.spec.ts`
Expected: FAIL — 找不到 `../AppraisalYearEndView.vue`（尚未建立）。

- [ ] **Step 3: 建立 shell 元件**

Create `src/views/AppraisalYearEndView.vue`：

```vue
<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'

const AppraisalManagementView = defineAsyncComponent(() => import('./AppraisalManagementView.vue'))
const YearEndListView = defineAsyncComponent(() => import('./yearEnd/YearEndListView.vue'))
const AppraisalPayoutView = defineAsyncComponent(() => import('./yearEnd/AppraisalPayoutView.vue'))

type SectionKey = 'appraisal' | 'year-end' | 'payout'

interface SectionDef {
  key: SectionKey
  label: string
  can: () => boolean
}

const ALL_SECTIONS: SectionDef[] = [
  { key: 'appraisal', label: '考核管理', can: () => hasPermission('SETTINGS_READ') || hasPermission('SALARY_READ') },
  { key: 'year-end', label: '年終獎金', can: () => hasPermission('YEAR_END_READ') },
  { key: 'payout', label: '考核年終', can: () => hasPermission('APPRAISAL_FINALIZE') },
]

const route = useRoute()
const router = useRouter()

const availableSections = computed(() => ALL_SECTIONS.filter((s) => s.can()))
const segmentedOptions = computed(() =>
  availableSections.value.map((s) => ({ label: s.label, value: s.key })),
)

const resolveSection = (raw: unknown): SectionKey | undefined => {
  const r = Array.isArray(raw) ? raw[0] : raw
  const available = availableSections.value
  return (available.find((s) => s.key === r) ?? available[0])?.key
}

const activeSection = ref<SectionKey | undefined>(resolveSection(route.query.section))

// 缺漏/無權限 section → 修正 URL 到第一個可用
if (activeSection.value && route.query.section !== activeSection.value) {
  router.replace({ query: { ...route.query, section: activeSection.value } })
}

watch(
  () => route.query.section,
  (next) => {
    const resolved = resolveSection(next)
    if (resolved && resolved !== activeSection.value) activeSection.value = resolved
  },
)

const onSectionChange = (val: string | number) => {
  const next = String(val) as SectionKey
  if (next === activeSection.value) return
  const query: Record<string, unknown> = { ...route.query, section: next }
  // tab 屬於 appraisal 內層 tab；切離 appraisal 時清除避免殘留
  if (next !== 'appraisal') delete query.tab
  router.replace({ query })
}
</script>

<template>
  <div class="appraisal-year-end-view">
    <el-segmented
      v-if="segmentedOptions.length > 0"
      :model-value="activeSection"
      :options="segmentedOptions"
      size="large"
      class="section-switcher"
      @change="onSectionChange"
    />
    <div class="section-body">
      <AppraisalManagementView v-if="activeSection === 'appraisal'" />
      <YearEndListView v-else-if="activeSection === 'year-end'" />
      <AppraisalPayoutView v-else-if="activeSection === 'payout'" />
      <el-empty v-else description="無權限檢視此頁" />
    </div>
  </div>
</template>

<style scoped>
.appraisal-year-end-view {
  padding: var(--space-5);
}
.section-switcher {
  margin-bottom: var(--space-4);
}
</style>
```

- [ ] **Step 4: 補 components.d.ts ElSegmented 型別**

在 `components.d.ts` 的 `ElScrollbar` 行之後、`ElSelect` 行之前插入（維持字母序）：

```ts
    ElSegmented: typeof import('element-plus/es')['ElSegmented']
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/views/__tests__/AppraisalYearEndView.spec.ts`
Expected: PASS（6 個 case 全綠）

- [ ] **Step 6: Commit**

```bash
git add src/views/AppraisalYearEndView.vue src/views/__tests__/AppraisalYearEndView.spec.ts components.d.ts
git commit -m "feat(appraisal-year-end): 新增考核年終整合工作區 shell 元件"
```

---

### Task 3: 路由（新增 shell 路由 + 舊路由改 redirect）

**Files:**
- Modify: `src/router/index.ts:242-293`（考核 + 年終區塊）
- Test: `src/router/__tests__/legacyRedirects.spec.ts`（Create）

- [ ] **Step 1: 寫失敗測試**

Create `src/router/__tests__/legacyRedirects.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import router from '@/router'

describe('考核/年終 舊路由 → 整合工作區 redirect', () => {
  it.each([
    ['/appraisal-management', 'appraisal'],
    ['/year_end/cycles', 'year-end'],
    ['/year-end/appraisal-payout', 'payout'],
  ])('%s → /appraisal-year-end?section=%s', (from, section) => {
    const r = router.resolve(from)
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query.section).toBe(section)
  })

  it('/appraisal/cycles → section=appraisal&tab=history', () => {
    const r = router.resolve('/appraisal/cycles')
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query).toMatchObject({ section: 'appraisal', tab: 'history' })
  })

  it('/appraisal/settings → section=appraisal&tab=settings', () => {
    const r = router.resolve('/appraisal/settings')
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query).toMatchObject({ section: 'appraisal', tab: 'settings' })
  })

  it('下鑽路由維持獨立（不被 redirect）', () => {
    expect(router.resolve('/year_end/cycles/7').path).toBe('/year_end/cycles/7')
    expect(router.resolve('/appraisal/cycles/3').path).toBe('/appraisal/cycles/3')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/router/__tests__/legacyRedirects.spec.ts`
Expected: FAIL — 舊路由仍指向各自的 component（`r.path` 仍是 `/appraisal-management` 等），非 `/appraisal-year-end`。

- [ ] **Step 3: 改路由定義**

在 `src/router/index.ts`，將 `// ============ 教職員考核 ============` 到 `/year-end/appraisal-payout` 路由（約 line 242-293）整段替換為：

```ts
        // ============ 考核 × 年終 整合工作區 ============
        {
            path: '/appraisal-year-end',
            name: 'appraisal-year-end',
            component: () => import('../views/AppraisalYearEndView.vue'),
            meta: { title: '考核與年終' }
        },
        // --- 舊路由 redirect（保留書籤 / 既有連結）---
        {
            path: '/appraisal-management',
            redirect: (to) => ({ path: '/appraisal-year-end', query: { ...to.query, section: 'appraisal' } }),
        },
        {
            path: '/appraisal/cycles',
            redirect: { path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'history' } },
        },
        {
            path: '/appraisal/cycles/:id',
            name: 'appraisal-cycle-detail',
            component: () => import('../views/appraisal/CycleDetailView.vue'),
            meta: { title: '考核週期詳情' }
        },
        {
            path: '/appraisal/settings',
            redirect: { path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'settings' } },
        },
        {
            path: '/year_end/cycles',
            redirect: (to) => ({ path: '/appraisal-year-end', query: { ...to.query, section: 'year-end' } }),
        },
        {
            path: '/year_end/cycles/:id',
            name: 'year-end-cycle-detail',
            component: () => import('../views/yearEnd/YearEndDetailView.vue'),
            meta: { title: '年終結算明細' }
        },
        {
            path: '/year_end/cycles/:id/grid',
            name: 'year-end-cycle-grid',
            component: () => import('../views/yearEnd/YearEndGridView.vue'),
            meta: { title: '年終總表', requiresAuth: true, permission: 'YEAR_END_READ' },
        },
        {
            path: '/year_end/cycles/:id/config',
            name: 'year-end-cycle-config',
            component: () => import('../views/yearEnd/YearEndConfigView.vue'),
            meta: { title: '年終本期設定', requiresAuth: true, permission: 'YEAR_END_READ' },
        },
        {
            path: '/year-end/appraisal-payout',
            redirect: (to) => ({ path: '/appraisal-year-end', query: { ...to.query, section: 'payout' } }),
        },
```

> 注意：保留 `/appraisal/cycles/:id`、`/year_end/cycles/:id`、`/grid`、`/config` 四個下鑽路由的 component 與 name 不變；只把三個 list 入口（`/appraisal-management`、`/year_end/cycles`、`/year-end/appraisal-payout`）改成 redirect。已確認無任何程式以 `name: 'appraisal-management' / 'year-end-cycles' / 'YearEndAppraisalPayout'` 導航，故 redirect 不保留 name 安全。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/router/__tests__/legacyRedirects.spec.ts`
Expected: PASS（全綠）

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/router/__tests__/legacyRedirects.spec.ts
git commit -m "feat(router): 考核年終整合工作區路由 + 舊路由 redirect"
```

---

### Task 4: 側邊欄整併 + 修兩個群組可見性回歸 bug

**Files:**
- Modify: `src/components/layout/AdminSidebar.vue`（模板 56-62、227-230；computed 316-321、345-347）
- Test: `src/components/layout/__tests__/AdminSidebar.spec.ts`（Create）

- [ ] **Step 1: 寫失敗測試**

Create `src/components/layout/__tests__/AdminSidebar.spec.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
}))

const getUserInfo = vi.fn()
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, getUserInfo: (...a: unknown[]) => getUserInfo(...a) }
})

import AdminSidebar from '../AdminSidebar.vue'

// 以 data-attr 暴露 index，避免依賴 Element Plus 真實渲染
const passthrough = { template: '<div><slot name="title" /><slot /></div>' }
const stubs = {
  ElAside: passthrough,
  ElScrollbar: passthrough,
  ElMenu: { template: '<nav><slot /></nav>' },
  ElSubMenu: { props: ['index'], template: '<div :data-sub="index"><slot name="title" /><slot /></div>' },
  ElMenuItem: { props: ['index'], template: '<a :data-item="index"><slot name="title" /><slot /></a>' },
  ElIcon: true,
  ElBadge: true,
}

function mountWith(perms: string[]) {
  getUserInfo.mockReturnValue({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { global: { stubs } })
}

const items = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-item]').map((n) => n.attributes('data-item'))
const subs = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))

describe('AdminSidebar 考核年終整併 + 群組可見性回歸', () => {
  beforeEach(() => vi.clearAllMocks())

  it('整合入口取代三個舊項目', () => {
    const w = mountWith(['*'])
    const all = items(w)
    expect(all).toContain('/appraisal-year-end')
    expect(all).not.toContain('/year_end/cycles')
    expect(all).not.toContain('/year-end/appraisal-payout')
    expect(all).not.toContain('/appraisal-management')
  })

  it('只有 SALARY_READ → 系統設定群組不顯示（修補回歸）', () => {
    const w = mountWith(['SALARY_READ'])
    expect(subs(w)).not.toContain('group-settings')
    // 入口仍在人事薪資（SALARY_READ 屬聯集）
    expect(subs(w)).toContain('group-leave')
    expect(items(w)).toContain('/appraisal-year-end')
  })

  it('只有 SETTINGS_READ → 人事薪資群組顯示且含整合入口（修補回歸）', () => {
    const w = mountWith(['SETTINGS_READ'])
    expect(subs(w)).toContain('group-leave')
    expect(items(w)).toContain('/appraisal-year-end')
    // 系統設定仍顯示（SETTINGS_READ → /settings）
    expect(subs(w)).toContain('group-settings')
  })

  it('只有 YEAR_END_READ → 入口可見', () => {
    expect(items(mountWith(['YEAR_END_READ']))).toContain('/appraisal-year-end')
  })

  it('只有 APPRAISAL_FINALIZE → 入口可見', () => {
    expect(items(mountWith(['APPRAISAL_FINALIZE']))).toContain('/appraisal-year-end')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/layout/__tests__/AdminSidebar.spec.ts`
Expected: FAIL — `/appraisal-year-end` 不存在、舊三項仍在、且「只有 SALARY_READ」時 `group-settings` 仍顯示（回歸尚未修）。

- [ ] **Step 3a: 人事薪資群組 — 換掉年終兩項為單一整合入口**

在 `src/components/layout/AdminSidebar.vue`，將以下兩個 `el-menu-item`（年終獎金 + 考核年終 payout，約 line 56-62）：

```html
          <el-menu-item v-if="canView.YEAR_END_READ" index="/year_end/cycles">
            <el-icon><Trophy /></el-icon>
            <template #title>年終獎金</template>
          </el-menu-item>
          <el-menu-item v-if="canView.APPRAISAL_FINALIZE" index="/year-end/appraisal-payout">
            <el-icon><Medal /></el-icon>
            <template #title>考核年終 payout</template>
          </el-menu-item>
```

替換為單一入口：

```html
          <el-menu-item
            v-if="canView.SETTINGS_READ || canView.SALARY_READ || canView.YEAR_END_READ || canView.APPRAISAL_FINALIZE"
            index="/appraisal-year-end"
          >
            <el-icon><Trophy /></el-icon>
            <template #title>考核與年終</template>
          </el-menu-item>
```

- [ ] **Step 3b: 系統設定群組 — 移除考核管理項**

刪除約 line 227-230 的整個 `el-menu-item`：

```html
          <el-menu-item v-if="canView.SETTINGS_READ || canView.SALARY_READ" index="/appraisal-management">
            <el-icon><Medal /></el-icon>
            <template #title>考核管理</template>
          </el-menu-item>
```

- [ ] **Step 3c: 修 `hasVisibleLeaveItems`（補 SETTINGS_READ）**

將（約 line 316-321）：

```ts
const hasVisibleLeaveItems = computed(() =>
  canView.value.EMPLOYEES_READ || canView.value.SALARY_READ || canView.value.SALARY_WRITE ||
  canView.value.ATTENDANCE_READ || canView.value.LEAVES_READ ||
  canView.value.OVERTIME_READ || canView.value.MEETINGS ||
  canView.value.SCHEDULE || canView.value.YEAR_END_READ || canView.value.APPRAISAL_FINALIZE
)
```

改為（新增 `|| canView.value.SETTINGS_READ`，註解說明為整合入口）：

```ts
const hasVisibleLeaveItems = computed(() =>
  canView.value.EMPLOYEES_READ || canView.value.SALARY_READ || canView.value.SALARY_WRITE ||
  canView.value.ATTENDANCE_READ || canView.value.LEAVES_READ ||
  canView.value.OVERTIME_READ || canView.value.MEETINGS ||
  canView.value.SCHEDULE || canView.value.YEAR_END_READ || canView.value.APPRAISAL_FINALIZE ||
  // 考核與年終整合入口含 SETTINGS_READ，群組需據此顯示
  canView.value.SETTINGS_READ
)
```

- [ ] **Step 3d: 修 `hasVisibleSettingsItems`（拿掉 SALARY_READ）**

將（約 line 345-347）：

```ts
const hasVisibleSettingsItems = computed(() =>
  canView.value.SETTINGS_READ || canView.value.SALARY_READ || canView.value.ACTIVITY_WRITE
)
```

改為（考核管理移出後，SALARY_READ 不再是系統設定群組的可見來源）：

```ts
const hasVisibleSettingsItems = computed(() =>
  canView.value.SETTINGS_READ || canView.value.ACTIVITY_WRITE
)
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/layout/__tests__/AdminSidebar.spec.ts`
Expected: PASS（5 個 case 全綠）

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AdminSidebar.vue src/components/layout/__tests__/AdminSidebar.spec.ts
git commit -m "feat(sidebar): 考核年終整併入口 + 修群組可見性回歸"
```

---

### Task 5: 全量驗證（typecheck + 測試 + 手動 smoke）

**Files:** 無（驗證 only）

- [ ] **Step 1: TypeScript typecheck**

Run: `npm run typecheck`
Expected: 0 error（特別確認 `el-segmented` 模板無型別錯、`components.d.ts` ElSegmented 已宣告）。

- [ ] **Step 2: 跑本次相關測試全綠**

Run: `npx vitest run src/utils/__tests__/appraisalYearEndRoute.spec.ts src/views/__tests__/AppraisalYearEndView.spec.ts src/router/__tests__/legacyRedirects.spec.ts src/components/layout/__tests__/AdminSidebar.spec.ts`
Expected: 全綠（4 檔）。

- [ ] **Step 3: 跑全套件確認無回歸**

Run: `npx vitest run`
Expected: 相對 baseline 無新增 failure（既有 flaky 依 MEMORY 慣例單獨判定，不算本次回歸）。

- [ ] **Step 4: 手動 smoke（`./start.sh` 起兩端後）**

逐項確認：
- [ ] 以 wildcard/admin 登入 → 人事薪資選單出現「考核與年終」、系統設定選單不再有「考核管理」、人事薪資不再有獨立「年終獎金 / 考核年終 payout」。
- [ ] 點「考核與年終」→ `el-segmented` 三段，預設落「考核管理」，內層 4 tab（當期/歷史/設定/懲處）正常。
- [ ] 切到「年終獎金」段 → 年終 list 正常，點明細下鑽 `/year_end/cycles/:id`，按返回回到工作區。
- [ ] 切到「考核年終」段 → payout preview/generated 正常。
- [ ] 瀏覽器直接打舊網址 `#/appraisal-management`、`#/year_end/cycles`、`#/year-end/appraisal-payout`、`#/appraisal/settings` → 各自正確 redirect 到對應段。
- [ ] 用只有 `SALARY_READ` 的測試帳號 → 系統設定選單不出現空殼；用只有 `SETTINGS_READ` 的帳號 → 仍能從人事薪資進入考核管理段。
```
