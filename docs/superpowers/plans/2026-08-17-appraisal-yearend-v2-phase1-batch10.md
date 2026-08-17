# 考核與年終 V2 Phase 1 — Batch 10：年終設定/總表補錯誤重試＋封存唯讀提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 延續 Batch 9，繼續處理 Phase 1 子項 ⑨「狀態矩陣」scout 報告點名的剩餘缺口中風險最低、最機械化的兩項：缺口4（`YearEndConfigView.vue` 的全校設定/班級設定載入失敗只有一次性 toast，無持久錯誤＋重試）與缺口5（`YearEndWorkspaceView.vue` CLOSED 週期缺唯讀提示文案）。同時處理缺口4 在 `YearEndGridView.vue` 的一個特殊變體——`loadGrid()` 失敗跟「真的還沒試算」目前共用同一個空表格外觀，需要新增獨立錯誤標記讓兩者不再混在一起。

**Architecture:** 三處都是**沿用 Batch 9 已確立、Batch 3/OverviewWorkbenchView.vue 已審查過的既有模式**：獨立 boolean ref 標記「載入失敗」，成功時歸零、失敗時設真，`v-if` 上失敗狀態優先於其他空狀態判斷，配一個可視錯誤區塊＋重試按鈕。`YearEndWorkspaceView.vue` 的 CLOSED 提示則是照抄同檔案已有的 LOCKED alert 寫法，純新增一個鏡射版本。**不改動任何計算邏輯、API 呼叫語意、寫入權限判斷語意，只補錯誤狀態的可視化與重試路徑。**

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/implementation-plan.md` Phase 1 子項 ⑨；盤點依據見 Batch 9 scout 完整報告（缺口4、缺口5，已存 memory `project_appraisal_yearend_v2_design_gate_2026_08_15.md`）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、權限判斷語意。
- **本批次刻意不處理**（留給後續批次）：
  - 缺口4 剩餘的 `YearEndDetailView.vue`（4 個函式：load/sign/submitReject/signBatch）與 `AppraisalPayoutView.vue`（4 個函式：loadPreview 非422分支/loadGenerated/onGenerate/onVoid）——這兩個檔案涉及的是**寫入類操作**（簽核/核定/退回/生成/作廢）失敗後的錯誤處理，跟本批次單純的「讀取失敗」性質不同，且函式數量較多，值得獨立一批仔細處理，避免跟寫入操作的既有 loading/disabled 狀態機混在一起改出錯。
  - 缺口2（`YearEndConfigView.vue`/`CycleDetailPanel.vue` 的寫入按鈕未依週期狀態機禁用）——授權衛生問題，需要盤點所有寫入路徑，範圍與風險都比本批次大，維持獨立批次處理。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `YearEndConfigView.vue` 補全校/班級設定載入失敗重試＋`YearEndWorkspaceView.vue` 補 CLOSED 唯讀提示

**Files:**
- Modify: `src/views/yearEnd/YearEndConfigView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndConfigView.spec.ts`
- Modify: `src/views/yearEnd/YearEndWorkspaceView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`

**Interfaces:**
- 不新增 props/emit；`loadOrgSettings()`/`loadClassTargets()` 既有簽名不變，新增 `orgLoadError`/`classLoadError` ref 副作用並加入 `defineExpose`。

**1. `YearEndConfigView.vue` 改動**

現況（`YearEndConfigView.vue:112-155`）：

```ts
async function loadOrgSettings() {
  orgLoading.value = true
  try {
    const res = await getOrgSettings(cycleId)
    orgSettings.value = res.data
    // Seed edit buffer from current values
    for (const row of res.data) {
      const key = String(row.semester_first)
      orgEdits.value[key] = {
        enrollment_target: row.enrollment_target,
        meeting_absence_deduction: Number(row.meeting_absence_deduction),
        school_achievement_rate_override:
          row.school_achievement_rate_override == null
            ? null
            : Number(row.school_achievement_rate_override),
      }
    }
  } catch {
    ElMessage.error('全校設定載入失敗')
  } finally {
    orgLoading.value = false
  }
}

async function loadClassTargets() {
  classLoading.value = true
  try {
    const res = await getClassTargets(cycleId)
    classTargets.value = res.data
    for (const row of res.data) {
      classEdits.value[row.id] = {
        head_count_target: row.head_count_target,
        head_teacher_employee_id: row.head_teacher_employee_id,
        returning_student_rate: Number(row.returning_student_rate),
        assistant_employee_id: row.assistant_employee_id,
      }
    }
  } catch {
    ElMessage.error('班級設定載入失敗')
  } finally {
    classLoading.value = false
  }
}
```

改為（在成功路徑分支開頭補歸零、catch 補設真；只加這兩行，函式其餘邏輯逐字不動）：

```ts
const orgLoadError = ref(false)

async function loadOrgSettings() {
  orgLoading.value = true
  orgLoadError.value = false
  try {
    const res = await getOrgSettings(cycleId)
    orgSettings.value = res.data
    // Seed edit buffer from current values
    for (const row of res.data) {
      const key = String(row.semester_first)
      orgEdits.value[key] = {
        enrollment_target: row.enrollment_target,
        meeting_absence_deduction: Number(row.meeting_absence_deduction),
        school_achievement_rate_override:
          row.school_achievement_rate_override == null
            ? null
            : Number(row.school_achievement_rate_override),
      }
    }
  } catch {
    ElMessage.error('全校設定載入失敗')
    orgLoadError.value = true
  } finally {
    orgLoading.value = false
  }
}

const classLoadError = ref(false)

async function loadClassTargets() {
  classLoading.value = true
  classLoadError.value = false
  try {
    const res = await getClassTargets(cycleId)
    classTargets.value = res.data
    for (const row of res.data) {
      classEdits.value[row.id] = {
        head_count_target: row.head_count_target,
        head_teacher_employee_id: row.head_teacher_employee_id,
        returning_student_rate: Number(row.returning_student_rate),
        assistant_employee_id: row.assistant_employee_id,
      }
    }
  } catch {
    ElMessage.error('班級設定載入失敗')
    classLoadError.value = true
  } finally {
    classLoading.value = false
  }
}
```

（`orgLoadError`/`classLoadError` 兩個新 ref 宣告緊接在各自函式定義之前，取代原本兩個函式獨立存在的位置——即 `loadOrgSettings` 前新增 `const orgLoadError = ref(false)`、`loadClassTargets` 前新增 `const classLoadError = ref(false)`。）

`defineExpose`（`YearEndConfigView.vue:299-317`）新增兩個欄位（取代原本整個陳述式）：

```ts
defineExpose({
  orgSettings,
  classTargets,
  orgEdits,
  classEdits,
  employeeOptions,
  classroomMap,
  canWrite,
  cycleTargets,
  loadOrgSettings,
  loadClassTargets,
  loadCycleTargets,
  saveOrgSettings,
  saveClassTarget,
  saveAllClassTargets,
  goToYearEndRules,
  cycleId,
  orgLoadError,
  classLoadError,
})
```

template「全校目標」小標題下方新增錯誤區塊（`YearEndConfigView.vue:336-341` 附近，取代原本這幾行）：

```vue
      <!-- 全校目標 (org_settings) -->
      <h3 class="sub-title">全校目標</h3>
      <div v-if="orgLoadError" class="yec-error">
        載入失敗
        <el-button data-test="org-load-retry" size="small" text type="primary" @click="loadOrgSettings">重試</el-button>
      </div>
      <div
        v-loading="orgLoading"
        class="org-settings-grid"
      >
```

template「各班編制」小標題所在的 `.class-targets-header` 區塊之後新增錯誤區塊（`YearEndConfigView.vue:428-441` 附近，`</div>`（class-targets-header 結束）與 `<el-table` 之間插入一行）：

```vue
      <!-- 各班編制 (class_targets) -->
      <div class="class-targets-header">
        <h3 class="sub-title">各班編制</h3>
        <el-button
          v-if="canWrite"
          type="success"
          size="small"
          :loading="classAllSaving"
          data-test="save-all-class-targets"
          @click="saveAllClassTargets"
        >
          全部儲存
        </el-button>
      </div>
      <div v-if="classLoadError" class="yec-error">
        載入失敗
        <el-button data-test="class-load-retry" size="small" text type="primary" @click="loadClassTargets">重試</el-button>
      </div>
      <el-table
        v-loading="classLoading"
        :data="classTargets"
```

`<style scoped>`（`YearEndConfigView.vue:560` 附近）新增一條規則（放在 `<style scoped>` 開頭第一條規則之前，比照 `AppraisalWorkspaceView.vue` 既有 `.ap-workspace__error` 逐字抄）：

```css
.yec-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
```

測試檔改動（`YearEndConfigView.spec.ts`）：既有 `describe('YearEndConfigView', ...)` 區塊內新增兩個測試（比照既有測試的 `stubSupportApis()`／`vi.mocked(yearEndApi.xxx)` 慣例，注意這個測試檔的既有慣例是**直接呼叫 `wrapper.vm.<函式>()`，不透過點擊 stub 按鈕**——`el-button` 在 `mountView()` 全域被 stub 成 `true`，點擊行為未經驗證可靠，勿新創點擊互動測試）：

```ts
  it('全校設定載入失敗時標記 orgLoadError，重試成功後清除', async () => {
    stubSupportApis()
    vi.mocked(yearEndApi.getOrgSettings).mockRejectedValueOnce(new Error('network'))
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown = { orgLoadError: boolean; loadOrgSettings: () => Promise<void> }
    expect(vm.orgLoadError).toBe(true)

    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValueOnce({ data: [] } as never)
    await vm.loadOrgSettings()
    await nextTick()

    expect(vm.orgLoadError).toBe(false)
    expect(yearEndApi.getOrgSettings).toHaveBeenCalledTimes(2)
  })

  it('班級設定載入失敗時標記 classLoadError，重試成功後清除', async () => {
    stubSupportApis()
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockRejectedValueOnce(new Error('network'))

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { classLoadError: boolean; loadClassTargets: () => Promise<void> }
    expect(vm.classLoadError).toBe(true)

    vi.mocked(yearEndApi.getClassTargets).mockResolvedValueOnce({ data: [] } as never)
    await vm.loadClassTargets()
    await nextTick()

    expect(vm.classLoadError).toBe(false)
    expect(yearEndApi.getClassTargets).toHaveBeenCalledTimes(2)
  })
```

（上面第一個測試的 `as unknown = {...}` 是筆誤示範，正確寫法是 `as unknown as {...}`——跟第二個測試一致，實作時請用第二個測試的正確語法，兩個測試都要用 `as unknown as {...}`。）

**2. `YearEndWorkspaceView.vue` 改動**

現況（`YearEndWorkspaceView.vue:218-224`）：

```vue
        <!-- LOCKED 週期語意明示——鎖定後僅可簽核/核定，不可再試算/手動調整/改設定 -->
        <el-alert
          v-if="cycle?.status === 'LOCKED'"
          type="info" :closable="false" show-icon
          title="週期已鎖定：僅可簽核與核定；不可再試算、手動調整或修改設定。"
          style="margin-bottom: 12px"
        />
```

改為新增一個鏡射版本（取代原本這幾行，在既有 LOCKED alert 之後緊接新增 CLOSED alert）：

```vue
        <!-- LOCKED 週期語意明示——鎖定後僅可簽核/核定，不可再試算/手動調整/改設定 -->
        <el-alert
          v-if="cycle?.status === 'LOCKED'"
          type="info" :closable="false" show-icon
          title="週期已鎖定：僅可簽核與核定；不可再試算、手動調整或修改設定。"
          style="margin-bottom: 12px"
        />

        <!-- CLOSED 週期語意明示——已封存，僅能操作退回鎖定（批次 A①／Batch 10 補齊，
             原本只有 LOCKED 有對應提示，CLOSED 只能從按鈕組合變化間接推敲狀態） -->
        <el-alert
          v-if="cycle?.status === 'CLOSED'"
          type="info" :closable="false" show-icon
          title="週期已封存：僅可檢視與匯出；如需異動請先退回鎖定狀態。"
          data-test="closed-readonly-hint"
          style="margin-bottom: 12px"
        />
```

測試檔改動（`YearEndWorkspaceView.spec.ts`）：在既有「CLOSED 週期 + 具 YEAR_END_FINALIZE 權限 → 頭部顯示「退回鎖定」鈕」測試（約第 119-130 行）之後新增：

```ts
  it('CLOSED 週期 → 頭部顯示已封存唯讀提示', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'CLOSED', bonus_calc_date: '2026-01-15' }],
    } as never)

    const wrapper = await mountShell()

    expect(wrapper.find('[data-test="closed-readonly-hint"]').exists()).toBe(true)
  })
```

（`api`、`routeRef`、`mountShell` 皆為既有 import/helper，直接沿用；若實測發現 `el-alert` 在 `mountShell()` 的 stub 設定下不會渲染 `data-test` 屬性到可查詢的 DOM 節點，比照同檔案既有「header-load-error」/「rail-count-detail」等 `data-test` 斷言已驗證可行的模式調整，不需要改用其他斷言方式。）

- [ ] **Step 1: 跑既有測試確認目前基準**

```bash
npm run test -- --run src/views/yearEnd/__tests__/YearEndConfigView.spec.ts
npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: 兩者皆 PASS

- [ ] **Step 2: 依上方 1-2 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

```bash
npm run test -- --run src/views/yearEnd/__tests__/YearEndConfigView.spec.ts
npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: 兩者皆 PASS（各自既有全數 + 新增測試）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/yearEnd/YearEndConfigView.vue src/views/yearEnd/__tests__/YearEndConfigView.spec.ts src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/yearEnd/YearEndConfigView.vue src/views/yearEnd/__tests__/YearEndConfigView.spec.ts src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
git commit -m "fix(year-end): 設定頁補載入失敗重試＋工作區補封存唯讀提示

YearEndConfigView.vue 的全校/班級設定載入失敗原本只有一次性 toast，補上
orgLoadError/classLoadError 標記＋錯誤區塊＋重試按鈕（比照 Batch 9 已
確立的 pattern）。YearEndWorkspaceView.vue 原本只有 LOCKED 週期有唯讀
提示，CLOSED 使用者只能從按鈕組合變化間接推敲狀態，補上對等的封存提示
（V2 IA 簡化 Phase 1 Batch 10 Task 1，年終總表 loadGrid 錯誤處理見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `YearEndGridView.vue` 區分「載入失敗」與「真的還沒試算」

**Files:**
- Modify: `src/views/yearEnd/YearEndGridView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndGridView.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（兩者程式碼互不耦合，此依賴僅為本計畫文件的執行順序約定）。**

**Interfaces:**
- 不新增 props/emit；`loadGrid()` 既有簽名不變，新增 `gridLoadError` ref 副作用並加入 `defineExpose`。

**現況**：`loadGrid()`（`YearEndGridView.vue:252-262`附近，行號依實際檔案現況為準——Batch 8 未動過此檔案，行號應與 scout 報告一致）：

```ts
async function loadGrid() {
  loading.value = true
  try {
    const res = await getYearEndGrid(cycleId)
    rows.value = res.data
  } catch {
    ElMessage.error('總表載入失敗')
  } finally {
    loading.value = false
  }
}
```

template 現況（「尚未試算」提示，`YearEndGridView.vue:423-431` 附近）：

```vue
    <!-- Task 5（批次2b-1）：進頁不再自動試算，尚未試算過（rows 為空）時明確引導使用者
         點「開始試算」，避免誤以為系統忘記載入資料。 -->
    <el-alert
      v-if="!rows.length && canWrite && cycleStatus === 'OPEN'"
      type="info"
      :closable="false"
      show-icon
      title="尚未試算，點『開始試算』產生結算"
      data-test="empty-grid-hint"
      class="grid-alert"
    />
```

**問題**：`rows` 為空陣列時，「尚未試算，點『開始試算』產生結算」這個提示無條件顯示（只要 `canWrite && cycleStatus === 'OPEN'`），不管 `rows` 是空的真因是「真的還沒試算」還是「`getYearEndGrid` API 呼叫失敗」。使用者看到失敗案例時會誤以為只是還沒操作，點「開始試算」（若 `canWrite`）反而可能觸發非預期的試算行為，或至少讓使用者浪費時間排查錯誤方向。

**1. 新增 `gridLoadError` ref，`loadGrid()` 成功/失敗各自維護它**（取代原本 `loadGrid()` 整個函式）：

```ts
const gridLoadError = ref(false)

async function loadGrid() {
  loading.value = true
  try {
    const res = await getYearEndGrid(cycleId)
    rows.value = res.data
    gridLoadError.value = false
  } catch {
    ElMessage.error('總表載入失敗')
    gridLoadError.value = true
  } finally {
    loading.value = false
  }
}
```

**2. template 新增錯誤區塊（放在既有「尚未試算」提示之前），並把該提示排除失敗情境**（取代原本第 423-431 行附近整段）：

```vue
    <!-- 載入失敗 → 顯式錯誤卡＋重試，不得落入下方「尚未試算」提示（比照 Batch 9
         CurrentSemesterOverview.vue 的 cycleFetchFailed 既有作法：API 失敗與
         「真的沒資料」是兩件事，不能共用同一個空狀態判斷） -->
    <el-alert
      v-if="gridLoadError"
      type="error"
      :closable="false"
      show-icon
      title="總表載入失敗"
      data-test="grid-load-error"
      class="grid-alert"
    >
      <el-button size="small" data-test="grid-load-retry" @click="loadGrid">重試</el-button>
    </el-alert>

    <!-- Task 5（批次2b-1）：進頁不再自動試算，尚未試算過（rows 為空）時明確引導使用者
         點「開始試算」，避免誤以為系統忘記載入資料。 -->
    <el-alert
      v-if="!rows.length && !gridLoadError && canWrite && cycleStatus === 'OPEN'"
      type="info"
      :closable="false"
      show-icon
      title="尚未試算，點『開始試算』產生結算"
      data-test="empty-grid-hint"
      class="grid-alert"
    />
```

**3. `defineExpose` 新增 `gridLoadError`**（既有 `defineExpose` 陳述式，取代原本整個陳述式，只在最後新增一行）：

```ts
defineExpose({
  rows, loading, bonusColumns, canWrite,
  loadGrid, onBuild,
  buildDialogVisible,
  cycleStatus, lastBuiltAt, initGrid,
  buildResult, buildSummaryText,
  // 批次 B：試算就緒檢查
  exceptions, exceptionsLoadFailed, loadExceptions, buildGated,
  gatingItems, gatingSummary, nonGatingBlockingSummary, warningCount, infoCount,
  // Task 3（批次2b-1）：獎金欄開關 chips 供測試直接驅動（避免透過 stub 層模擬點擊的脆弱性）。
  visibleBonusCols, toggleBonusCol, visibleBonusColumns, specialBonusTotal,
  // 批次 A③：需注意列過濾
  attentionOnly, attentionCount, displayedRows, isAttentionRow,
  // Task 4（批次2b-1）：舊手改 dialog（editVisible/editForm/editingRow/openEdit/submitEdit）
  // 已移除，改由 GridRowDetailDrawer 承接（含就地編輯）；grid 這層只保留開關抽屜狀態。
  drawerVisible, drawerRow, openDrawer,
  gridLoadError,
})
```

**4. 測試檔改動**：先確認 `YearEndGridView.spec.ts` 現有的 `mountView()`/mock 慣例（`getYearEndGrid` 的 mock 函式名稱、`describe` 區塊分組——本檔案有多個獨立 `describe`，比照 Batch 8 Task 2 的處理方式，新測試放進最貼近的既有 `describe` 區塊，或若找不到合適分組則新開一個 `describe('YearEndGridView 載入失敗處理', ...)`，比照既有「需注意列過濾」`describe` 區塊的 `beforeEach` 寫法）新增：

```ts
  it('loadGrid() 失敗時標記 gridLoadError，不顯示「尚未試算」提示；重試成功後恢復', async () => {
    vi.mocked(api.getYearEndGrid).mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="grid-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="empty-grid-hint"]').exists()).toBe(false)

    vi.mocked(api.getYearEndGrid).mockResolvedValueOnce({ data: [makeRow()] } as never)
    await wrapper.find('[data-test="grid-load-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="grid-load-error"]').exists()).toBe(false)
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
  })
```

（若實測發現 `el-button` 在該測試檔的 stub 設定下無法可靠觸發 `@click`，改用 `wrapper.vm.loadGrid()` 直接呼叫，比照 Task 1 `YearEndConfigView.spec.ts` 新測試採用的 `wrapper.vm.<函式>()` 直接呼叫慣例；`mountView`/`makeRow`/`api` 皆為該測試檔既有 helper，直接沿用，不需新增定義。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndGridView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-4 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndGridView.spec.ts`
Expected: PASS（既有全數 + 1 個新增）

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
git add -- src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git commit -m "fix(year-end): 年終總表區分「載入失敗」與「真的還沒試算」

loadGrid() 失敗時原本會跟『尚未試算過』共用同一個空表格外觀＋『開始試算』
引導提示，使用者誤以為只是還沒操作。新增 gridLoadError 標記＋錯誤區塊＋
重試按鈕，兩種空狀態不再混在一起（V2 IA 簡化 Phase 1 Batch 10 Task 2，
收尾本批次）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：本批次處理 scout 5 個優先缺口中的缺口4（部分：`YearEndConfigView.vue`＋`YearEndGridView.vue` 兩處，`YearEndDetailView.vue`／`AppraisalPayoutView.vue` 留給後續批次）與缺口5（完整）。缺口2 明確排除，理由見 Global Constraints。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；測試檔的「若實測發現...改用...」條件式指示（`el-button` 點擊 fallback、`describe` 分組 fallback）為必要澄清，非模糊佔位。Task 1 的第一個測試範例刻意示範了一個筆誤（`as unknown = {...}`）並在正下方明講這是筆誤、正確寫法為何，這是刻意的教學性澄清而非真的要照抄兩種寫法。
3. **Type consistency**：`loadOrgSettings()`/`loadClassTargets()`/`loadGrid()` 簽名皆不變；新增三個 ref 皆為 `Ref<boolean>`，與 Batch 9 的 `cycleFetchFailed`/`loadError` 同型別慣例一致，變數命名延續各檔案既有前綴風格（`org`/`class`/`grid` 字首＋`LoadError`）。
4. **風險守則**：三處修改皆是「抄同一個 codebase 內已審查過、已上線的既有 pattern」，向下相容（只在失敗路徑新增可視化與重試，不改變成功路徑行為）。`YearEndConfigView.vue`／`YearEndGridView.vue` 的測試新增優先採用該檔案既有的 `wrapper.vm.<函式>()` 直接呼叫慣例而非 DOM 點擊模擬，降低因 stub 設定不支援點擊轉發而測試失效的風險。
