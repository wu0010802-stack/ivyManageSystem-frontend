# 手機端優化 Phase 3（drawer 響應式 + portal 卡片化）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好 2 個 portal el-drawer 在手機寫死 px 寬度的溢出（T8 真破口），並把 `PortalIncidentView`/`PortalPunchCorrectionView` 在手機改用既有 `AdminListCards` 卡片視圖（T5 推廣）。

**Architecture:** 重用 RWD P3 已建的 `src/components/common/AdminListCards.vue`（dumb presentational + design token，admin/portal 共用同套 token）。drawer 用 `useIsMobile()` 控制 `:size`；列表頁 `el-table v-if="!isMobile"` + `AdminListCards v-else`，比照 RWD P3 的 `EmployeeView` pattern。純前端、不動後端。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus 2.5（el-drawer / el-table / el-tag）、Vitest 4 + @vue/test-utils（happy-dom）、`useIsMobile()`（matchMedia 驅動）。

## Global Constraints

- **繁體中文**：註解 / commit / UI 文案一律繁中。
- **TS-only / strict**：`<script setup lang="ts">`；禁 `: any`/`as any`（用既有 `Record<string, unknown>` 或 narrow）；`noUnusedLocals:true`。
- **純前端**：不動後端、不碰 RWD 斷點 token / dark-mode token / RWD P3 已改的 3 頁。
- **重用不修改** `AdminListCards.vue`（介面：`props {items, columns:{label,prop,formatter?}[], rowKey, loading?, emptyText?}`；slots `#title="{item}"` / `#actions="{item}"` / `#empty` / `#cell-${prop}="{item}"`）。需要 render 元件（el-tag）的欄位用 `#cell-<prop>` slot；純文字轉換用 column 的 `formatter`。
- **isMobile 來源**：`import { useIsMobile } from '@/composables/useIsMobile'` → `const { isMobile } = useIsMobile()`（matchMedia 驅動；測試 mock `window.matchMedia`，比照既有 `EmployeeView.cardview.spec.ts` / RWD P0 的 `setMobileViewport`）。
- **drawer size**：手機 `'100%'`、桌機保留各自原 px 值。
- **A3（T9 觸控）無獨立 task**：Incident/PunchCorrection 兩頁皆**純檢視、無行內操作欄**，故無列操作觸控目標可改；T9 的員工列已由 RWD P3 卡片化解決，public 頁 ~12 個留 follow-up（有界，比照 RWD P3 §7）。
- **共用 main 多 session 並行**：`git add` 只加本任務檔，不 `-A`（不要 `components.d.ts`/`.log`）。**不 push**。
- **Conventional Commits** + 繁中 + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 指令：`npx vitest run <path>`（單檔）/ `npm run test`（全量）/ `npm run typecheck` / `npm run build`。

---

### Task 1: A1 — 2 個 portal drawer 手機響應式 size（T8 真破口）

**Files:**
- Modify: `src/views/portal/components/contactBook/ContactBookEntryDrawer.vue`（`:134` size + 內部寫死寬控制項）
- Modify: `src/views/portal/components/activity/ActivityRollcallDrawer.vue`（`:63` size + 內部 min-width）
- Test: `tests/unit/portal/drawerResponsive.spec.ts`（新建）

**Interfaces:**
- Consumes: `useIsMobile()`（`@/composables/useIsMobile`）。
- Produces: 無程式介面。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/portal/drawerResponsive.spec.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}

// el-drawer 內容 teleport 到 body；斷言改讀 drawer 元件 prop 而非 DOM
import ContactBookEntryDrawer from '@/views/portal/components/contactBook/ContactBookEntryDrawer.vue'
import ActivityRollcallDrawer from '@/views/portal/components/activity/ActivityRollcallDrawer.vue'

describe('portal drawer 手機響應式 size', () => {
  beforeEach(() => setMobile(false))

  it('ContactBookEntryDrawer 桌機 size=520px / 手機 size=100%', async () => {
    setMobile(false)
    const desktop = mount(ContactBookEntryDrawer, {
      props: { modelValue: true, studentId: 1, studentName: '小明', date: '2026-06-28' },
      global: { plugins: [ElementPlus] },
    })
    expect(desktop.findComponent({ name: 'ElDrawer' }).props('size')).toBe('520px')
    desktop.unmount()

    setMobile(true)
    const mobile = mount(ContactBookEntryDrawer, {
      props: { modelValue: true, studentId: 1, studentName: '小明', date: '2026-06-28' },
      global: { plugins: [ElementPlus] },
    })
    expect(mobile.findComponent({ name: 'ElDrawer' }).props('size')).toBe('100%')
    mobile.unmount()
  })

  it('ActivityRollcallDrawer 桌機 size=460px / 手機 size=100%', async () => {
    setMobile(false)
    const desktop = mount(ActivityRollcallDrawer, {
      props: { modelValue: true, course: { id: 1, name: '繪畫' }, roster: [] },
      global: { plugins: [ElementPlus] },
    })
    expect(desktop.findComponent({ name: 'ElDrawer' }).props('size')).toBe('460px')
    desktop.unmount()

    setMobile(true)
    const mobile = mount(ActivityRollcallDrawer, {
      props: { modelValue: true, course: { id: 1, name: '繪畫' }, roster: [] },
      global: { plugins: [ElementPlus] },
    })
    expect(mobile.findComponent({ name: 'ElDrawer' }).props('size')).toBe('100%')
    mobile.unmount()
  })
})
```
> 註：props 以各 drawer 實際 `defineProps` 為準（mount 前先讀檔對齊必填 prop 名；上方為示意，缺漏的必填 prop 補上以免 mount 警告污染輸出）。

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/portal/drawerResponsive.spec.ts`
Expected: FAIL（手機仍回 `520px`/`460px`，因 size 寫死）

- [ ] **Step 3: 改 `ContactBookEntryDrawer.vue`**

`<script setup>` import 區加：
```ts
import { useIsMobile } from '@/composables/useIsMobile'
```
setup 內加（與其他 `const` 並列）：
```ts
const { isMobile } = useIsMobile()
```
`:134` `size="520px"` 改為：
```html
    :size="isMobile ? '100%' : '520px'"
```
內部寫死寬 select（`:151` 與 `:185` 的 `style="width: 220px"`）改為 `style="width: 220px; max-width: 100%"`。

- [ ] **Step 4: 改 `ActivityRollcallDrawer.vue`**

`<script setup>` import 區加 `import { useIsMobile } from '@/composables/useIsMobile'`；setup 內加 `const { isMobile } = useIsMobile()`。
`:63` `size="460px"` 改為：
```html
    size="460px"
    :size="isMobile ? '100%' : '460px'"
```
（移除原靜態 `size="460px"` 那行，只留動態綁定。）內部 `:98` 的 `style="flex: 1; min-width: 140px"` 改為 `style="flex: 1; min-width: 0"`（窄機不撐出）。

- [ ] **Step 5: 跑測試確認 GREEN + typecheck**

Run: `npx vitest run tests/unit/portal/drawerResponsive.spec.ts && npm run typecheck`
Expected: 2/2 PASS；型別 0 錯。

- [ ] **Step 6: Commit**

```bash
git add src/views/portal/components/contactBook/ContactBookEntryDrawer.vue src/views/portal/components/activity/ActivityRollcallDrawer.vue tests/unit/portal/drawerResponsive.spec.ts
git commit -m "fix(portal): 聯絡簿/點名 drawer 手機 size 響應式（解窄機溢出）

el-drawer 不像 el-dialog 自動 fullscreen，520/460px 在手機溢出；
isMobile 時 size=100%，並讓內部寫死寬控制項窄機安全。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A2 — PortalIncidentView 手機卡片化

**Files:**
- Modify: `src/views/portal/PortalIncidentView.vue`（el-table 包 `v-if="!isMobile"` + 加 AdminListCards + cardColumns）
- Test: `src/views/portal/__tests__/PortalIncidentView.cardview.spec.ts`（新建）

**Interfaces:**
- Consumes: `AdminListCards`（`@/components/common/AdminListCards.vue`）、`useIsMobile()`。已存在頁面狀態：`incidents`（`ref<Record<string,unknown>[]>`）、`loading`、`TYPE_TAG`、`SEVERITY_TAG`、`truncate`。
- Produces: 無程式介面。

- [ ] **Step 1: 寫失敗測試**

`src/views/portal/__tests__/PortalIncidentView.cardview.spec.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}
vi.mock('@/api/portal', () => ({
  getPortalClassrooms: vi.fn(() => Promise.resolve({ data: [] })),
}))
// 視實際 import 補齊頁面用到的 api/composable mock（mount 前讀檔對齊）

import PortalIncidentView from '@/views/portal/PortalIncidentView.vue'
const stubs = { AdminListCards: { name: 'AdminListCards', props: ['items','columns','rowKey'], template: '<div class="alc-stub" :data-count="items.length"><slot name="title" :item="items[0]||{}"/></div>' } }

describe('PortalIncidentView 手機卡片視圖', () => {
  beforeEach(() => setMobile(false))

  it('桌機渲染 el-table、不渲染 AdminListCards', async () => {
    setMobile(false)
    const w = mount(PortalIncidentView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.find('.alc-stub').exists()).toBe(false)
    w.unmount()
  })

  it('手機渲染 AdminListCards、不渲染 el-table', async () => {
    setMobile(true)
    const w = mount(PortalIncidentView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.alc-stub').exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
    w.unmount()
  })
})
```
> 註：實作前先讀 `PortalIncidentView.vue` 的 `<script setup>`，把它實際 import 的 api/composable 都 mock 掉（避免 mount 時真打 API / 報錯污染輸出）。stub `AdminListCards` 以隔離本頁邏輯。

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/views/portal/__tests__/PortalIncidentView.cardview.spec.ts`
Expected: FAIL（手機仍渲染 el-table，無 AdminListCards）

- [ ] **Step 3: 改 `PortalIncidentView.vue`**

`<script setup>` import 區加：
```ts
import { useIsMobile } from '@/composables/useIsMobile'
import AdminListCards from '@/components/common/AdminListCards.vue'
```
setup 內加 `const { isMobile } = useIsMobile()` 與 cardColumns config（formatter 重用既有顯示邏輯）：
```ts
const incidentCardColumns = [
  { label: '發生時間', prop: 'occurred_at',
    formatter: (item: Record<string, unknown>) =>
      item.occurred_at ? String(item.occurred_at).slice(0, 16).replace('T', ' ') : '-' },
  { label: '類型', prop: 'incident_type' },          // tag → #cell-incident_type
  { label: '嚴重程度', prop: 'severity' },            // tag → #cell-severity
  { label: '描述', prop: 'description',
    formatter: (item: Record<string, unknown>) => truncate(item.description as string) },
  { label: '通知家長', prop: 'parent_notified' },     // tag → #cell-parent_notified
]
```
模板 `:185` 的 `<el-table ...>` 加 `v-if="!isMobile"`；其後加：
```html
    <AdminListCards
      v-else
      :items="incidents"
      :columns="incidentCardColumns"
      row-key="id"
      :loading="loading"
      empty-text="目前沒有事件紀錄"
    >
      <template #title="{ item }">{{ item.student_name || '（未指定學生）' }}</template>
      <template #cell-incident_type="{ item }">
        <el-tag :type="TYPE_TAG[item.incident_type]" size="small">{{ item.incident_type }}</el-tag>
      </template>
      <template #cell-severity="{ item }">
        <el-tag v-if="item.severity" :type="SEVERITY_TAG[item.severity]" size="small">{{ item.severity }}</el-tag>
        <span v-else>-</span>
      </template>
      <template #cell-parent_notified="{ item }">
        <el-tag :type="item.parent_notified ? 'success' : 'info'" size="small">
          {{ item.parent_notified ? '已通知' : '未通知' }}
        </el-tag>
      </template>
    </AdminListCards>
```
> `row-key="id"`：實作時確認 incidents 列含 `id`（DB 紀錄 PK；console.log 一筆或看 API response）。若該 API 不回 `id`，改用列內穩定唯一欄並在 commit message 註明。

- [ ] **Step 4: 跑測試確認 GREEN + typecheck**

Run: `npx vitest run src/views/portal/__tests__/PortalIncidentView.cardview.spec.ts && npm run typecheck`
Expected: 2/2 PASS；型別 0 錯。

- [ ] **Step 5: Commit**

```bash
git add src/views/portal/PortalIncidentView.vue src/views/portal/__tests__/PortalIncidentView.cardview.spec.ts
git commit -m "feat(portal): 事件紀錄手機改用 AdminListCards 卡片視圖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A2 — PortalPunchCorrectionView 手機卡片化

**Files:**
- Modify: `src/views/portal/PortalPunchCorrectionView.vue`（el-table 包 `v-if="!isMobile"` + 加 AdminListCards + cardColumns）
- Test: `src/views/portal/__tests__/PortalPunchCorrectionView.cardview.spec.ts`（新建）

**Interfaces:**
- Consumes: `AdminListCards`、`useIsMobile()`（頁面**已有** `const { isMobile } = useIsMobile()`，沿用、不重複宣告）。已存在頁面狀態：`corrections`（`ref<Record<string,unknown>[]>`）、`loading`、`correctionTypeTagType`、`statusTagType`、`statusLabel`、`formatTime`。
- Produces: 無程式介面。

- [ ] **Step 1: 寫失敗測試**

`src/views/portal/__tests__/PortalPunchCorrectionView.cardview.spec.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}
// 視實際 import 補齊 api/composable mock（mount 前讀檔對齊）

import PortalPunchCorrectionView from '@/views/portal/PortalPunchCorrectionView.vue'
const stubs = { AdminListCards: { name: 'AdminListCards', props: ['items','columns','rowKey'], template: '<div class="alc-stub" :data-count="items.length"/>' },
  TeacherBottomSheet: true, PortalPunchCorrectionForm: true }

describe('PortalPunchCorrectionView 手機卡片視圖', () => {
  beforeEach(() => setMobile(false))

  it('桌機渲染 el-table、不渲染 AdminListCards', async () => {
    setMobile(false)
    const w = mount(PortalPunchCorrectionView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.find('.alc-stub').exists()).toBe(false)
    w.unmount()
  })

  it('手機渲染 AdminListCards、不渲染 el-table', async () => {
    setMobile(true)
    const w = mount(PortalPunchCorrectionView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.alc-stub').exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
    w.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/views/portal/__tests__/PortalPunchCorrectionView.cardview.spec.ts`
Expected: FAIL（手機仍渲染 el-table）

- [ ] **Step 3: 改 `PortalPunchCorrectionView.vue`**

`<script setup>` import 區加 `import AdminListCards from '@/components/common/AdminListCards.vue'`（`useIsMobile`/`isMobile` 已有，不重複）。setup 內加 cardColumns（formatter 重用既有函式）：
```ts
const correctionCardColumns = [
  { label: '補正類型', prop: 'correction_type' },      // tag → #cell-correction_type
  { label: '申請上班', prop: 'requested_punch_in',
    formatter: (item: Record<string, unknown>) => formatTime(item.requested_punch_in) },
  { label: '申請下班', prop: 'requested_punch_out',
    formatter: (item: Record<string, unknown>) => formatTime(item.requested_punch_out) },
  { label: '說明原因', prop: 'reason' },
  { label: '狀態', prop: 'approval_status' },           // tag → #cell-approval_status
  { label: '核准人', prop: 'approved_by' },
  { label: '駁回原因', prop: 'rejection_reason',
    formatter: (item: Record<string, unknown>) => (item.rejection_reason as string) || '-' },
]
```
模板 `:122` 的 `<el-table ...>` 加 `v-if="!isMobile"`（`el-empty` `:160` 也包 `v-if="!isMobile && !loading && corrections.length === 0"` 或維持，避免桌機/手機重複空狀態——手機交給 AdminListCards 的 emptyText）。其後加：
```html
      <AdminListCards
        v-else
        :items="corrections"
        :columns="correctionCardColumns"
        row-key="id"
        :loading="loading"
        empty-text="本月無補打卡申請記錄"
      >
        <template #title="{ item }">{{ item.attendance_date }}</template>
        <template #cell-correction_type="{ item }">
          <el-tag :type="correctionTypeTagType(item.correction_type)" size="small">
            {{ item.correction_type_label }}
          </el-tag>
        </template>
        <template #cell-approval_status="{ item }">
          <el-tag :type="statusTagType(item.approval_status)" size="small">
            {{ statusLabel(item.approval_status) }}
          </el-tag>
        </template>
      </AdminListCards>
```
> `row-key="id"`：同 Task 2，實作時確認 corrections 列含 `id`，否則改用穩定唯一欄並註明。

- [ ] **Step 4: 跑測試確認 GREEN + typecheck**

Run: `npx vitest run src/views/portal/__tests__/PortalPunchCorrectionView.cardview.spec.ts && npm run typecheck`
Expected: 2/2 PASS；型別 0 錯。

- [ ] **Step 5: Commit**

```bash
git add src/views/portal/PortalPunchCorrectionView.vue src/views/portal/__tests__/PortalPunchCorrectionView.cardview.spec.ts
git commit -m "feat(portal): 補打卡申請手機改用 AdminListCards 卡片視圖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 全 Phase 收尾驗證

**Files:** 無（驗證 only）

- [ ] **Step 1: 全量回歸 + 型別 + build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: 型別 0 錯；全量綠；build 成功。若有失敗，先確認是否本 Phase 引入（對合併基準比對）。

- [ ] **Step 2: 裝置模擬 sanity（建議，非阻塞；列 DoD 實機核對）**

`npm run preview`，DevTools iPhone（390px）驗：① 開聯絡簿/點名 drawer 不再橫向溢出（drawer 佔滿寬）② Incident/PunchCorrection 手機顯示卡片、桌機顯示表格、卡片標題/tag/欄位正確。

- [ ] **Step 3: 收尾**

純前端、後端不涉及。確認 commit 在分支上；push 與 CI 由 user 決定（push 觸發 Zeabur 前端部署）。

---

## Self-Review

**Spec 覆蓋**：A1（2 drawer 響應式）→ Task 1；A2（Incident 卡片化）→ Task 2；A2（PunchCorrection 卡片化）→ Task 3；收尾 → Task 4。A3（T9）spec 已說明隨 A2 解決，但經核實兩頁無操作欄 → Global Constraints 已記「A3 無獨立 task」（誠實修正）。§2 StepReview 不卡片化 → 無 task（明確排除）。✓
**Placeholder 掃描**：無 TBD；每個 code step 有完整 cardColumns/slot/size 程式碼；row-key="id" 附「實作時確認列含 id，否則改穩定唯一欄」的明確指示（因列為弱型別 Record，屬合理驗證註記非 placeholder）。測試的 api/composable mock 註明「mount 前讀檔對齊」（因各頁 import 不同，無法在 plan 窮舉，給明確操作指示）。
**型別/命名一致**：`useIsMobile`/`isMobile`、`AdminListCards`（props items/columns/rowKey/loading/emptyText、slots #title/#cell-<prop>）、cardColumns 的 prop 名與各頁 el-table-column 的 prop 對齊（incident_type/severity/parent_notified/correction_type/approval_status）；PunchCorrection 沿用既有 isMobile 不重複宣告（已註明）。
