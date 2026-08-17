# 考核與年終 V2 Phase 1 — Batch 11：年終結算單/發放頁補讀取失敗重試 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收斂 Phase 1 子項 ⑨「狀態矩陣」缺口4 剩餘的兩個檔案：`YearEndDetailView.vue`（年終結算單）與 `AppraisalPayoutView.vue`（考核年終發放）。**範圍界定**：scout 報告把這兩檔的 `load()`/`sign()`/`submitReject()`/`signBatch()`/`loadPreview()`/`loadGenerated()`/`onGenerate()`/`onVoid()` 全部列為同一類缺口，但本批次只處理**頁面進頁讀取函式**（`load()`、`loadPreview()` 非422分支、`loadGenerated()`）——這幾個失敗時使用者沒有其他手段能重新取得資料。**刻意不處理**簽核/退回/批次簽核/生成/作廢這幾個**使用者主動觸發的動作函式**（`sign`/`submitReject`/`signBatch`/`onGenerate`/`onVoid`）：這些失敗時使用者本來就站在觸發按鈕旁邊，一次性 toast 讓他們原地重按即可，且本 Phase 1 全程稽核下來（`CycleDetailPanel.vue` 的 `sign()`/`openReject()`/`comment()` 皆是 toast-only 且從未被列為缺口）這正是本專案自己對「動作失敗」的既有慣例，不是遺漏，套用「頁面讀取失敗」的重錯誤區塊反而是過度設計。

**Architecture:** 沿用 Batch 9/10 已確立的模式：獨立 boolean ref 標記「載入失敗」，成功時歸零、失敗時設真，配一個輕量文字＋重試按鈕（不用 `el-alert`，兩個測試檔都把 `el-alert` 設成 `true` 自動 stub 不轉發內容，改用純 `<div>`，跟 `.cdp-error`/`.yec-error` 同款寫法）。`AppraisalPayoutView.vue` 的 `loadPreview()` 需要跟既有的 `notReady`（422＝來源考核週期未建立，不是錯誤）三方互斥處理：新增的 `previewLoadError` 與 `notReady` 在 catch block 的兩個分支各自獨立設值，不會同時為真。**不改動任何計算邏輯、API 呼叫語意、寫入權限判斷語意，只補讀取失敗的可視化與重試路徑。**

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/implementation-plan.md` Phase 1 子項 ⑨；盤點依據見 Batch 9 scout 完整報告缺口4（已存 memory `project_appraisal_yearend_v2_design_gate_2026_08_15.md`）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、權限判斷語意。
- **本批次刻意不處理**：`YearEndDetailView.vue` 的 `sign()`/`submitReject()`/`signBatch()`、`AppraisalPayoutView.vue` 的 `onGenerate()`/`onVoid()`——理由見上方 Goal，這是動作觸發失敗、非頁面讀取失敗，維持既有 toast-only 慣例。
- 缺口2（寫入按鈕未依週期狀態機禁用）、⑦統一五區塊抽屜殼、③待辦頁視覺重塑——維持獨立批次處理，本批次不觸碰。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `YearEndDetailView.vue` 補 `load()` 讀取失敗重試

**Files:**
- Modify: `src/views/yearEnd/YearEndDetailView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`

**Interfaces:**
- 不新增 props/emit；`load()` 既有簽名不變，新增 `loadError` ref 副作用（本檔無 `defineExpose`，`<script setup>` 頂層 binding 對 `wrapper.vm` 已可直接存取，比照 Batch 7 Task 2 已驗證可行的作法，不需新增 `defineExpose`）。

**現況**（`YearEndDetailView.vue:149-169`）：

```ts
async function load() {
  loading.value = true
  try {
    // 四支彼此無依賴、皆只吃 cycleId → 併發載入，首載等待取最慢者而非四次 round-trip 相加
    const [cyclesRes, settRes, sbRes, ctRes] = await Promise.all([
      listYearEndCycles(),
      listYearEndSettlements(cycleId),
      listSpecialBonuses(cycleId),
      listClassEnrollmentTargets(cycleId),
    ])
    const cycles = cyclesRes.data as YearEndCycle[]
    cycle.value = cycles.find((c) => c.id === cycleId) ?? null
    settlements.value = settRes.data
    specialBonuses.value = sbRes.data
    classTargets.value = ctRes.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}
```

template 現況（`YearEndDetailView.vue:273-279`）：

```vue
    <div class="toolbar">
      <el-button :icon="Refresh" @click="load">重新載入</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndSummaryXlsxUrl(cycleId)">年終獎金總表</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>
    </div>

    <el-tabs v-model="tab">
```

**問題**：`load()` 失敗只有一次性 toast，畫面上雖然有常駐「重新載入」按鈕，但那是一般性導覽按鈕，使用者未必意識到要點它來重試剛才失敗的載入（跟 Batch 9 scout 報告點名的 `CycleDetailPanel.vue` 是同一類問題，只是這裡至少還有個按鈕可用、不算完全卡死，屬於「有救援手段但不夠顯式」的等級）。

**1. 新增 `loadError` ref，`load()` 成功/失敗各自維護它**（取代原本第 149-169 行整個函式）：

```ts
const loadError = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    // 四支彼此無依賴、皆只吃 cycleId → 併發載入，首載等待取最慢者而非四次 round-trip 相加
    const [cyclesRes, settRes, sbRes, ctRes] = await Promise.all([
      listYearEndCycles(),
      listYearEndSettlements(cycleId),
      listSpecialBonuses(cycleId),
      listClassEnrollmentTargets(cycleId),
    ])
    const cycles = cyclesRes.data as YearEndCycle[]
    cycle.value = cycles.find((c) => c.id === cycleId) ?? null
    settlements.value = settRes.data
    specialBonuses.value = sbRes.data
    classTargets.value = ctRes.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
    loadError.value = true
  } finally {
    loading.value = false
  }
}
```

**2. template 在 toolbar 之後新增錯誤區塊**（取代原本第 273-279 行附近整段）：

```vue
    <div class="toolbar">
      <el-button :icon="Refresh" @click="load">重新載入</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndSummaryXlsxUrl(cycleId)">年終獎金總表</el-button>
      <el-button :icon="Download" tag="a" :href="exportYearEndTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>
    </div>

    <div v-if="loadError" class="ye-detail-error">
      載入失敗
      <el-button data-test="detail-load-retry" size="small" text type="primary" @click="load">重試</el-button>
    </div>

    <el-tabs v-model="tab">
```

**3. `<style scoped>` 新增 `.ye-detail-error`**（`YearEndDetailView.vue:466` 附近，放在 `<style scoped>` 開頭第一條規則之前，比照既有 `.cdp-error`/`.yec-error` 逐字抄）：

```css
.ye-detail-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
```

**4. 測試檔改動**：這個測試檔的 `el-button` 已用真正轉發點擊事件的 `ElButtonStub`（非 `stubs: true` 自動 stub），可以正常用 `.trigger('click')`。在既有 `describe('YearEndDetailView — 兩關簽核流程', ...)` 區塊內新增（比照既有測試用 `setupApiMocks(...)` 慣例）：

```ts
  it('load() 失敗時顯示錯誤區塊，點重試成功後消失', async () => {
    setupApiMocks([makeSettlement()])
    vi.mocked(api.listYearEndSettlements).mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="detail-load-retry"]').exists()).toBe(true)

    vi.mocked(api.listYearEndSettlements).mockResolvedValueOnce({ data: [makeSettlement()] } as never)
    await wrapper.find('[data-test="detail-load-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="detail-load-retry"]').exists()).toBe(false)
    expect(api.listYearEndSettlements).toHaveBeenCalledTimes(2)
  })
```

（`setupApiMocks`/`makeSettlement`/`mountView`/`nextTick` 皆為既有 helper，直接沿用；`setupApiMocks` 會先把 `listYearEndSettlements` 設成 `mockResolvedValue`，本測試緊接著疊加的 `.mockRejectedValueOnce(...)` 會優先消耗一次，不影響 `setupApiMocks` 內其他 API 的預設成功值。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-4 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`
Expected: PASS（既有全數 + 1 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/__tests__/YearEndDetailView.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/__tests__/YearEndDetailView.spec.ts
git commit -m "fix(year-end): 結算單頁補 load() 讀取失敗重試

load() 失敗原本只有一次性 toast，畫面雖有常駐『重新載入』按鈕但非顯式
針對失敗觸發的重試 UI。新增 loadError 標記＋錯誤區塊＋重試按鈕，比照
Batch 9/10 已確立的 pattern（V2 IA 簡化 Phase 1 Batch 11 Task 1，發放
頁 loadPreview/loadGenerated 見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `AppraisalPayoutView.vue` 補 `loadPreview()`/`loadGenerated()` 讀取失敗重試

**Files:**
- Modify: `src/views/yearEnd/AppraisalPayoutView.vue`
- Modify test: `src/views/yearEnd/__tests__/AppraisalPayoutView.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（兩者程式碼互不耦合，此依賴僅為本計畫文件的執行順序約定）。**

**Interfaces:**
- 不新增 props/emit；`loadPreview()`/`loadGenerated()` 既有簽名不變，新增 `previewLoadError`/`generatedLoadError` ref 並加入 `defineExpose`。

**現況**（`AppraisalPayoutView.vue:119-150`）：

```ts
async function loadPreview() {
  loading.value = true
  notReady.value = false
  try {
    const res = await previewAppraisalPayout(year.value)
    rows.value = res.data as PreviewRow[]
    selected.value = new Set(rows.value.filter((r) => !r.is_inactive).map((r) => r.employee_id))
  } catch (e) {
    const status = (e as { response?: { status?: number } } | null)?.response?.status
    if (status === 422) {
      rows.value = []
      selected.value = new Set()
      notReady.value = true
    } else {
      ElMessage.error(friendlyError('載入發放預覽失敗', e))
    }
  } finally {
    loading.value = false
  }
}

async function loadGenerated() {
  generatedLoading.value = true
  try {
    const res = await listAppraisalPayouts(year.value)
    generatedRows.value = res.data as PayoutItem[]
  } catch (e) {
    ElMessage.error(friendlyError('載入已生成列表失敗', e))
  } finally {
    generatedLoading.value = false
  }
}
```

**1. 新增 `previewLoadError`/`generatedLoadError` ref，兩函式成功/失敗各自維護**（取代原本第 119-150 行整段）：

```ts
const previewLoadError = ref(false)

async function loadPreview() {
  loading.value = true
  notReady.value = false
  previewLoadError.value = false
  try {
    const res = await previewAppraisalPayout(year.value)
    rows.value = res.data as PreviewRow[]
    selected.value = new Set(rows.value.filter((r) => !r.is_inactive).map((r) => r.employee_id))
  } catch (e) {
    const status = (e as { response?: { status?: number } } | null)?.response?.status
    if (status === 422) {
      rows.value = []
      selected.value = new Set()
      notReady.value = true
    } else {
      ElMessage.error(friendlyError('載入發放預覽失敗', e))
      previewLoadError.value = true
    }
  } finally {
    loading.value = false
  }
}

const generatedLoadError = ref(false)

async function loadGenerated() {
  generatedLoading.value = true
  generatedLoadError.value = false
  try {
    const res = await listAppraisalPayouts(year.value)
    generatedRows.value = res.data as PayoutItem[]
  } catch (e) {
    ElMessage.error(friendlyError('載入已生成列表失敗', e))
    generatedLoadError.value = true
  } finally {
    generatedLoading.value = false
  }
}
```

**2. `defineExpose` 新增兩個欄位**（`AppraisalPayoutView.vue:222-226`，取代原本整個陳述式）：

```ts
defineExpose({
  selected, anyCycleNotFinalized, onGenerate, onVoid, loadPreview, rows, year,
  toggleSelect, payoutRows, payoutTotal, payoutTotalDisplay,
  tab, generatedRows, generatedLoading, loadGenerated, notReady, receipt,
  previewLoadError, generatedLoadError,
})
```

**3. template「預覽」分頁新增錯誤區塊，跟既有 `notReady`（422）三方互斥**（`AppraisalPayoutView.vue:260-274` 附近，取代原本整段）：

```vue
      <el-tab-pane label="預覽" name="preview">
        <div v-if="previewLoadError" class="apv-error">
          載入失敗
          <el-button data-test="preview-load-retry" size="small" text type="primary" @click="loadPreview">重試</el-button>
        </div>

        <EmptyState
          v-else-if="notReady"
          data-test="preview-not-ready"
          title="本年度尚無可發放的考核年終資料"
          description="來源學年的考核週期尚未建立。可切換上方年份，或前往考核管理建立該學年的考核週期後再回來發放。"
        >
          <template #action>
            <router-link :to="{ path: '/appraisal-year-end/appraisal', query: { stage: 'sign' } }">
              <el-button type="primary" plain>前往考核管理</el-button>
            </router-link>
          </template>
        </EmptyState>

        <template v-else>
```

（原本 `<template v-else>` 及其之後的內容——`el-table` 與 `footer`——逐字不動，只把 `EmptyState` 的 `v-if` 改成 `v-else-if`，並在最前面新增 `previewLoadError` 分支。）

**4. template「已生成」分頁新增錯誤區塊**（`AppraisalPayoutView.vue:337-340` 附近，取代原本這幾行）：

```vue
        <div class="generated-toolbar">
          <el-button type="danger" plain data-test="void-button" @click="onVoid">清空本年發放資料</el-button>
        </div>
        <div v-if="generatedLoadError" class="apv-error">
          載入失敗
          <el-button data-test="generated-load-retry" size="small" text type="primary" @click="loadGenerated">重試</el-button>
        </div>
        <el-table v-loading="generatedLoading" :data="generatedRows" border>
```

**5. `<style scoped>` 新增 `.apv-error`**（`AppraisalPayoutView.vue:362` 附近，放在 `<style scoped>` 開頭第一條規則之前）：

```css
.apv-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
```

**6. 測試檔改動**：這個測試檔的 `el-button` 已用真正轉發點擊事件的 `ElButtonStub`（`el-alert` 才是 `stubs: true` 自動 stub，本次新增的錯誤區塊用純 `<div>` 不受影響）。在既有 `describe('AppraisalPayoutView', ...)` 區塊內新增：

```ts
  it('loadPreview() 非422失敗時顯示錯誤區塊，重試成功後消失', async () => {
    vi.mocked(api.previewAppraisalPayout).mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="preview-load-retry"]').exists()).toBe(true)

    vi.mocked(api.previewAppraisalPayout).mockResolvedValueOnce({ data: [] } as never)
    await wrapper.find('[data-test="preview-load-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="preview-load-retry"]').exists()).toBe(false)
    expect(api.previewAppraisalPayout).toHaveBeenCalledTimes(2)
  })

  it('loadGenerated() 失敗時顯示錯誤區塊，重試成功後消失', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({ data: [] } as never)
    vi.mocked(api.listAppraisalPayouts).mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { tab: 'preview' | 'generated' }
    vm.tab = 'generated'
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-test="generated-load-retry"]').exists()).toBe(true)

    vi.mocked(api.listAppraisalPayouts).mockResolvedValueOnce({ data: [] } as never)
    await wrapper.find('[data-test="generated-load-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="generated-load-retry"]').exists()).toBe(false)
    expect(api.listAppraisalPayouts).toHaveBeenCalledTimes(2)
  })
```

（`mountView`/`nextTick`/`api` 皆為既有 helper/import，直接沿用；`vm.tab = 'generated'` 觸發 `watch(tab, ...)` 呼叫 `loadGenerated()`，比照該測試檔既有的「已生成分頁渲染 listAppraisalPayouts 真列表」測試已驗證可行的切分頁方式。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/AppraisalPayoutView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-6 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/AppraisalPayoutView.spec.ts`
Expected: PASS（既有全數 + 2 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 5: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈（已知既有 flaky：`PickupAuthorizationsView.test.ts` 的 `filters refetch on date/status change` 僅在全庫並行負載下偶發紅，與本批次無關，不算新增紅燈）。

- [ ] **Step 6: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/yearEnd/AppraisalPayoutView.vue src/views/yearEnd/__tests__/AppraisalPayoutView.spec.ts
git commit -m "fix(year-end): 發放頁補 loadPreview/loadGenerated 讀取失敗重試

loadPreview() 的非422分支與 loadGenerated() 原本只有一次性 toast，補上
previewLoadError/generatedLoadError 標記＋錯誤區塊＋重試按鈕；
previewLoadError 與既有的 notReady（422＝來源考核週期未建立，非錯誤）
三方互斥，不會同時顯示（V2 IA 簡化 Phase 1 Batch 11 Task 2，收尾本批次，
Phase 1 子項 ⑨ 缺口4 讀取類函式至此全數收斂）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：scout 缺口4 的 8 個函式中，本批次處理 3 個讀取函式（`load`/`loadPreview`非422/`loadGenerated`），刻意排除 5 個動作函式（`sign`/`submitReject`/`signBatch`/`onGenerate`/`onVoid`），理由已在 Goal／Global Constraints 說明——這是刻意的範圍收斂而非遺漏，讀取失敗與動作失敗在使用者體驗上是不同類別的問題，適用不同的既有慣例。缺口4 至此完整收斂（`YearEndConfigView.vue`/`YearEndGridView.vue` Batch 10 已做，`YearEndDetailView.vue`/`AppraisalPayoutView.vue` 本批次做）。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；測試檔沿用既有 helper 皆有明確指名，無模糊佔位。
3. **Type consistency**：`load()`/`loadPreview()`/`loadGenerated()` 簽名皆不變；新增三個 ref 皆為 `Ref<boolean>`，命名延續 Batch 9/10 建立的 `<領域>LoadError`/`<領域>Error` 慣例。
4. **風險守則**：三處修改皆向下相容，只在失敗路徑新增可視化與重試，不改變成功路徑行為。`previewLoadError` 與既有 `notReady` 的三方互斥（v-if/v-else-if/v-else）明確設計避免同時顯示兩種矛盾訊息；兩個測試檔的 `el-button` 皆為真實轉發點擊的 stub（非自動 `true` stub），本批次新增的錯誤區塊皆用純 `<div>` 而非 `el-alert`（兩個測試檔的 `el-alert` 皆是自動 stub 不轉發內容），確保測試能可靠斷言內容與點擊行為。
