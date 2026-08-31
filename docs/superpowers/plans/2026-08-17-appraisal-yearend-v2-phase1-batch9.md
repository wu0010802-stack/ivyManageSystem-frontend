# 考核與年終 V2 Phase 1 — Batch 9：修正兩處誤導性/卡死錯誤狀態 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 子項 ⑨「狀態矩陣」經 scout 全面盤點 12 個主要畫面，本批次先修**兩個會誤導使用者或讓畫面卡死的真實缺口**（其餘缺口記在 Self-Review，留給後續批次）：① `CurrentSemesterOverview.vue` 的當期週期 API 呼叫失敗時，畫面誤顯示「本學期尚未建立考核週期」的空狀態＋建立按鈕——使用者可能誤判系統真的沒有週期而重複建立，實際上只是網路/API 暫時失敗；② `CycleDetailPanel.vue`（考核簽核階段）的 `load()` 失敗只有一次性 `ElMessage.error` toast，沒有任何持久錯誤區塊或重試按鈕，畫面停在空白/半載入狀態，使用者唯一的救援手段是整頁重新整理。

**Architecture:** 兩處都是**採用同一個 codebase 已經驗證過、多次重複使用的模式**：獨立於「資料為空」的 boolean ref 標記「載入失敗」，`v-if` 順序上錯誤狀態優先於空狀態判斷，配一個輕量文字＋重試按鈕（不新增元件、不用 el-alert 重量級卡片）。Task 1 直接抄 `OverviewWorkbenchView.vue` 的 `appraisalRootError`／`yearEndRootError` 既有作法（同一支檔案已經寫過這個 bug 的教訓，只是沒套用回姊妹頁）；Task 2 直接抄 `AppraisalWorkspaceView.vue` 的 `loadError` 既有作法（Batch 3 已建立、已審查過的 pattern，包含 CSS class）。**不改動任何計算邏輯、API 呼叫語意，只補錯誤狀態的可視化與重試路徑。**

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/implementation-plan.md` Phase 1 子項 ⑨；盤點依據見本 session scout 報告（12 檔全掃，5 個優先缺口，本批次處理其中最高嚴重度的 2 個：誤導性空狀態＋卡死無重試）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、權限判斷語意。
- **本批次刻意不處理**（scout 報告點名但留給後續批次，避免範圍過散）：
  - `YearEndConfigView.vue` 鎖定/封存週期仍可編輯送出（狀態機寫入守衛缺口，需要更仔細盤點該頁所有寫入路徑，非純視覺缺口）。
  - `YearEndWorkspaceView.vue` CLOSED 狀態缺唯讀提示文案（單純補一行 alert，優先度低於本批次兩個「誤導/卡死」缺口）。
  - `ListView.vue`（考核簽核列表子元件）本身的 el-table 無獨立 loading/empty（父層 `CycleDetailPanel.vue` 本批次補的 loading/error 已涵蓋整個面板，子表格層級的 empty state 是更細緻的巢狀狀態，留待評估是否值得做）。
  - `YearEndConfigView.vue`/`YearEndGridView.vue` loadGrid/`YearEndDetailView.vue`/`AppraisalPayoutView.vue` 的一般錯誤只有一次性 toast——這四處要嘛已有自己的頁面級 loading（非完全空白）要嘛失敗頻率極低，非本批次「誤導性空狀態／完全卡死」這兩個最高嚴重度定義，留給後續批次逐一套用同款 pattern。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `CurrentSemesterOverview.vue` 修正 API 失敗誤顯示「尚未建立週期」

**Files:**
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue`
- Modify test: `src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js`

**Interfaces:**
- 不新增 props/emit；`fetchCurrentCycle()`/`reloadAll()` 既有簽名不變，內部新增 `cycleFetchFailed` ref 副作用。

**現況**（`CurrentSemesterOverview.vue:96-115`）：

```ts
const currentCycle = ref<CurrentCycle | null>(null)
const cycleLoading = ref(false)

// 回傳當次載入的 cycle（不直接寫 currentCycle.value）——由 reloadAll 在 epoch
// 守衛通過後才提交，避免晚到的舊學期請求覆寫新學期。
async function fetchCurrentCycle(): Promise<CurrentCycle | null> {
  cycleLoading.value = true
  try {
    const { data } = await getAppraisalCurrentCycle({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    return data as CurrentCycle
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:fetchCycle', '載入當期週期失敗')
    return null
  } finally {
    cycleLoading.value = false
  }
}
```

template 空狀態 banner 現況（`CurrentSemesterOverview.vue:574-599`）：

```vue
    <!-- cycle 不存在 banner -->
    <el-alert
      v-if="!cycleLoading && !currentCycle"
      type="warning"
      :closable="false"
      data-test="no-cycle-banner"
      class="banner"
    >
      <template #title>
        本學期（{{ termStore.school_year }} 學年度
        {{ termStore.semester === 1 ? '上' : '下' }}學期）尚未建立考核週期
      </template>
      <template #default>
        <div class="banner__body">
          <span>建立後即可開始彙整出缺勤、班級留校率、才藝報名率、懲處記錄。</span>
          <el-button
            type="primary"
            :icon="Plus"
            data-test="create-cycle-btn"
            @click="openCreateDialog"
          >
            建立本學期週期
          </el-button>
        </div>
      </template>
    </el-alert>
```

**問題**：`fetchCurrentCycle()` API 失敗時 `catch` 只呼叫 `notify(...)`（一次性通知）就 `return null`；`reloadAll()` 把這個 `null` 直接寫進 `currentCycle.value`，跟「該學期真的還沒建立週期」（後端回 `data: null` 的正常回應）在畫面上呈現**完全相同**——都是 `!currentCycle` 為真，顯示同一個「尚未建立考核週期」banner 並附「建立本學期週期」按鈕。使用者網路不穩時重新整理，看到這個 banner 會誤以為系統真的沒有週期，若真的按下建立按鈕可能造成重複建立週期的資料問題。

`OverviewWorkbenchView.vue`（`src/views/appraisalYearEnd/OverviewWorkbenchView.vue:21-25,56-69`）已經處理過同一類問題，用 `appraisalRootError`/`yearEndRootError` 兩個獨立 ref 區分「API 失敗」與「查無資料」：

```ts
// 根把手 fetch 失敗顯式化：rejected 不可靜默吞掉，否則卡片會誤顯
// 「尚未建立考核週期／年終週期」空狀態，使用者會誤判系統真的沒有週期
const appraisalRootError = ref(false)
```

**1. 新增 `cycleFetchFailed` ref，`fetchCurrentCycle()` 成功/失敗各自維護它**（取代原本第 96-115 行整段）：

```ts
const currentCycle = ref<CurrentCycle | null>(null)
const cycleLoading = ref(false)
// Batch 9：API 失敗與「該學期真的還沒建立週期」是兩件事，畫面不能顯示同一個
// 「尚未建立週期」banner——否則使用者會誤判系統真的沒有週期而重複建立
// （比照 OverviewWorkbenchView.vue 的 appraisalRootError 既有作法）。
const cycleFetchFailed = ref(false)

// 回傳當次載入的 cycle（不直接寫 currentCycle.value）——由 reloadAll 在 epoch
// 守衛通過後才提交，避免晚到的舊學期請求覆寫新學期。
async function fetchCurrentCycle(): Promise<CurrentCycle | null> {
  cycleLoading.value = true
  try {
    const { data } = await getAppraisalCurrentCycle({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    cycleFetchFailed.value = false
    return data as CurrentCycle
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:fetchCycle', '載入當期週期失敗')
    cycleFetchFailed.value = true
    return null
  } finally {
    cycleLoading.value = false
  }
}
```

**2. template 新增錯誤 banner（放在既有「cycle 不存在 banner」之前），並把該 banner 的 `v-if` 排除失敗情境**（取代原本第 574-599 行整段）：

```vue
    <!-- API 失敗 → 顯式錯誤卡＋重試，不得落入下方「尚未建立」空狀態
         （比照 OverviewWorkbenchView.vue 的 appraisalRootError 既有作法） -->
    <el-alert
      v-if="!cycleLoading && cycleFetchFailed"
      type="error"
      :closable="false"
      data-test="cycle-fetch-error-banner"
      class="banner"
    >
      <template #title>載入本學期考核週期失敗</template>
      <template #default>
        <div class="banner__body">
          <span>請檢查網路連線後重試，不代表本學期尚未建立週期。</span>
          <el-button
            size="small"
            type="primary"
            data-test="cycle-fetch-retry-btn"
            @click="reloadAll"
          >重試</el-button>
        </div>
      </template>
    </el-alert>

    <!-- cycle 不存在 banner -->
    <el-alert
      v-if="!cycleLoading && !cycleFetchFailed && !currentCycle"
      type="warning"
      :closable="false"
      data-test="no-cycle-banner"
      class="banner"
    >
      <template #title>
        本學期（{{ termStore.school_year }} 學年度
        {{ termStore.semester === 1 ? '上' : '下' }}學期）尚未建立考核週期
      </template>
      <template #default>
        <div class="banner__body">
          <span>建立後即可開始彙整出缺勤、班級留校率、才藝報名率、懲處記錄。</span>
          <el-button
            type="primary"
            :icon="Plus"
            data-test="create-cycle-btn"
            @click="openCreateDialog"
          >
            建立本學期週期
          </el-button>
        </div>
      </template>
    </el-alert>
```

**3. 測試檔改動**：在既有 `describe('CurrentSemesterOverview', ...)` 區塊內、既有「cycle 為 null 時顯示 banner 與建立按鈕」測試之後新增：

```js
  it('cycle 載入失敗時顯示錯誤卡而非「尚未建立週期」banner，重試成功後恢復正常', async () => {
    getAppraisalCurrentCycle.mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="cycle-fetch-error-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="no-cycle-banner"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="create-cycle-btn"]').exists()).toBe(false)

    getAppraisalCurrentCycle.mockResolvedValueOnce({ data: SAMPLE_CYCLE })
    await wrapper.find('[data-test="cycle-fetch-retry-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="cycle-fetch-error-banner"]').exists()).toBe(false)
    expect(getAppraisalCurrentCycle).toHaveBeenCalledTimes(2)
  })
```

（`flushPromises` 已在檔案頂部 `import { mount, flushPromises } from '@vue/test-utils'` 匯入，`SAMPLE_CYCLE` 為既有測試已在用的 fixture 常數，不需要新增定義；若實測發現 `mountView()` 沒有回傳前已經 `flushPromises` 過一次，這裡的 `await flushPromises()` 仍是必要的第二次排乾，保留不省略。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js`
Expected: PASS

- [ ] **Step 2: 依上方 1-3 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js`
Expected: PASS（既有全數 + 1 個新增）

- [ ] **Step 4: 跑更廣範圍（含 race 測試確認 epoch 守衛未受影響）**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS，特別確認 `CurrentSemesterOverview.race.test.ts` 全綠（本次改動未動 `reloadAll()`/epoch 守衛邏輯本身，只在 `fetchCurrentCycle()` 內多寫一個 ref，理論上不影響切學期 race 行為，但仍須實測確認）。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/CurrentSemesterOverview.vue src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/CurrentSemesterOverview.vue src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js
git commit -m "fix(appraisal): 當期週期 API 失敗不再誤顯示「尚未建立週期」

fetchCurrentCycle() 失敗時新增 cycleFetchFailed 標記，顯示獨立的錯誤卡
＋重試按鈕，不再落入跟『該學期真的還沒建立週期』相同的空狀態 banner——
後者附帶『建立本學期週期』按鈕，誤按可能造成重複建立週期的資料問題。
比照 OverviewWorkbenchView.vue 已寫過的同款教訓補回這個姊妹頁
（V2 IA 簡化 Phase 1 Batch 9 Task 1，考核簽核階段卡死無重試見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `CycleDetailPanel.vue`（考核簽核階段）補載入失敗錯誤區塊＋重試

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`
- Modify test: `src/views/appraisal/__tests__/CycleDetailPanel.spec.js`

**⚠ 前置條件：Task 1 必須先完成並 commit（兩者程式碼互不耦合，此依賴僅為本計畫文件的執行順序約定）。**

**Interfaces:**
- 不新增 props/emit；`load()` 既有簽名不變，內部新增 `loadError` ref 副作用；`defineExpose` 新增 `loadError`。

**現況**：`loading` ref（`CycleDetailPanel.vue:67`）設值但**從未綁到任何模板元素**（純死碼——`grep loading` 只找到宣告、`load()` 內的 true/false 賦值、與第 355 行 `:loading="busy"` 這個無關的另一個 ref）。`load()` 現況（`CycleDetailPanel.vue:137-161`）：

```ts
async function load() {
  loading.value = true
  try {
    // 五支彼此無資料依賴（皆只吃 cycleId 或無參）→ 併發載入，首載等待取最慢者
    // 而非五次 round-trip 相加（比照 yearEnd/YearEndDetailView.vue load()）。
    const [cyclesRes, participantsRes, summariesRes, catalogRes, statusRes] = await Promise.all([
      listAppraisalCycles(),
      listAppraisalParticipants(cycleId.value),
      listAppraisalSummaries(cycleId.value),
      listAppraisalCatalog(),
      getAppraisalAllEmployeesStatus(cycleId.value),
    ])
    const cycles = cyclesRes.data as unknown as Cycle[]
    cycle.value = cycles.find((c) => c.id === cycleId.value) || null
    participants.value = participantsRes.data as Participant[]
    summaries.value = summariesRes.data as Summary[]
    catalog.value = catalogRes.data as unknown[]
    aggregatedParticipants.value = (statusRes.data as { participants?: AggregatedParticipant[] })?.participants ?? []
    loadRules()
  } catch (e) {
    ElMessage.error(apiError(e, MSG.load_failed))
  } finally {
    loading.value = false
  }
}
```

失敗時只有一次性 `ElMessage.error` toast（幾秒後自動消失），畫面停在初始空值狀態（`cycle`/`participants`/`summaries` 皆為空），沒有任何持久提示或重試手段，使用者唯一的救援是整頁重新整理（若切分頁再切回來，`:key="cycleId"` 才會重新掛載——不是使用者直覺會做的事）。

`AppraisalWorkspaceView.vue`（Batch 3 已建立、已審查過的 pattern，`src/views/appraisal/AppraisalWorkspaceView.vue:78-81` + CSS `:125-132`）：

```vue
    <div v-if="loadError" class="ap-workspace__error">
      載入失敗
      <el-button data-test="workspace-retry" size="small" text type="primary" @click="load">重試</el-button>
    </div>
```
```css
.ap-workspace__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
```

**1. 新增 `loadError` ref，`load()` 成功/失敗各自維護它**（取代原本第 137-161 行整段）：

```ts
const loadError = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    // 五支彼此無資料依賴（皆只吃 cycleId 或無參）→ 併發載入，首載等待取最慢者
    // 而非五次 round-trip 相加（比照 yearEnd/YearEndDetailView.vue load()）。
    const [cyclesRes, participantsRes, summariesRes, catalogRes, statusRes] = await Promise.all([
      listAppraisalCycles(),
      listAppraisalParticipants(cycleId.value),
      listAppraisalSummaries(cycleId.value),
      listAppraisalCatalog(),
      getAppraisalAllEmployeesStatus(cycleId.value),
    ])
    const cycles = cyclesRes.data as unknown as Cycle[]
    cycle.value = cycles.find((c) => c.id === cycleId.value) || null
    participants.value = participantsRes.data as Participant[]
    summaries.value = summariesRes.data as Summary[]
    catalog.value = catalogRes.data as unknown[]
    aggregatedParticipants.value = (statusRes.data as { participants?: AggregatedParticipant[] })?.participants ?? []
    loadRules()
  } catch (e) {
    ElMessage.error(apiError(e, MSG.load_failed))
    loadError.value = true
  } finally {
    loading.value = false
  }
}
```

**2. `defineExpose` 新增 `loadError`**（`CycleDetailPanel.vue:299-310` 附近，取代原本整個 `defineExpose` 陳述式）：

```ts
defineExpose({
  view,
  selectedIds,
  openReject,
  openComment,
  openLog,
  openDetail,
  sign,
  signingIds,
  isSigning,
  summaries,
  loadError,
})
```

**3. template 根 `<div>` 補 `v-loading` 綁定＋新增錯誤區塊**（取代原本第 338-340 行附近的開頭三行）：

```vue
<template>
  <div v-loading="loading" class="cycle-detail">
    <div v-if="loadError" class="cdp-error">
      載入失敗
      <el-button data-test="cdp-retry" size="small" text type="primary" @click="load">重試</el-button>
    </div>

    <div v-if="cycle" class="meta">
```

**4. `<style scoped>` 新增 `.cdp-error`**（放在既有 `<style scoped>` 區塊，`CycleDetailPanel.vue:450` 附近，第一條規則之前）：

```css
.cdp-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
```

**5. 測試檔改動**：在既有 `vi.mock('@/api/appraisal', () => ({...}))` 之後新增一行 import（取得 mocked 函式參照，供測試呼叫 `.mockRejectedValueOnce`）：

```js
import { listAppraisalParticipants } from '@/api/appraisal'
```

在既有 `describe('CycleDetailPanel', ...)` 區塊最後新增：

```js
  it('load() 失敗時顯示錯誤區塊，點重試成功後消失', async () => {
    listAppraisalParticipants.mockRejectedValueOnce(new Error('network error'))
    const wrapper = mountPanel()
    await flush()

    expect(wrapper.find('[data-test="cdp-retry"]').exists()).toBe(true)

    listAppraisalParticipants.mockResolvedValueOnce({ data: [] })
    await wrapper.find('[data-test="cdp-retry"]').trigger('click')
    await flush()

    expect(wrapper.find('[data-test="cdp-retry"]').exists()).toBe(false)
    expect(listAppraisalParticipants).toHaveBeenCalledTimes(2)
  })
```

（`mountPanel`/`flush` 為既有 helper，不需新增；`listAppraisalParticipants` 在既有 mock 工廠中已是 `vi.fn().mockResolvedValue({ data: [] })`，`.mockRejectedValueOnce`/`.mockResolvedValueOnce` 疊加在同一個 mock 實例上是合法用法。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS

- [ ] **Step 2: 依上方 1-5 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（既有全數 + 1 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS，特別確認 `CycleDetailPanel.opt.test.ts` 與 `AppraisalWorkspaceView.spec.js` 未受波及（後者是 Batch 3 已有的 `loadError` pattern 來源，本次只是抄同款寫法到另一個檔案，兩者測試互相獨立）。

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
git add -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
git commit -m "fix(appraisal): 簽核階段面板載入失敗補錯誤區塊與重試

CycleDetailPanel.vue 的 load() 原本只靠一次性 toast 提示失敗，畫面停在
空白狀態、無持久提示也無重試手段（loading ref 原本也是死碼、沒綁模板）。
比照 Batch 3 已審查過的 AppraisalWorkspaceView.vue loadError pattern
補上錯誤區塊＋重試按鈕，並把 loading 接上 v-loading（V2 IA 簡化 Phase 1
Batch 9 Task 2，收尾本批次）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：本批次只處理 scout 5 個優先缺口中「誤導性空狀態」與「完全卡死無重試」這兩個最高嚴重度的（缺口 3 與缺口 1）。**未涵蓋、留給後續批次**：缺口 2（`YearEndConfigView.vue`/`CycleDetailPanel.vue` 的寫入按鈕未依 cycle 狀態機禁用——這是縱深防禦的授權衛生問題，需要盤點所有寫入路徑而非單純視覺補丁，範圍與風險都比本批次大，值得獨立一批）、缺口 4（5 個檔案的一般錯誤僅一次性 toast）、缺口 5（`YearEndWorkspaceView.vue` CLOSED 缺唯讀提示文案）。這是刻意的範圍取捨，已在 Global Constraints 說明，不是遺漏。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；測試檔的「若實測發現...」條件式指示（Task 1 的 flushPromises 保留說明）是必要澄清，非模糊佔位。
3. **Type consistency**：`fetchCurrentCycle(): Promise<CurrentCycle | null>`／`load(): Promise<void>` 簽名不變；新增 ref 皆為 `Ref<boolean>`，與既有 `loadError`（`AppraisalWorkspaceView.vue`）、`appraisalRootError`（`OverviewWorkbenchView.vue`）同型別慣例一致。
4. **風險守則**：兩個 task 都是「抄同一個 codebase 內已審查過、已上線的既有 pattern」而非發明新設計，降低審查與回歸風險；皆不改變成功路徑的任何行為，只在失敗路徑新增可視化與重試，向下相容。Task 1 特別確認不影響既有 `CurrentSemesterOverview.race.test.ts` 的 epoch 守衛邏輯（未觸碰 `reloadAll()`/`isStale()` 機制本身）。
