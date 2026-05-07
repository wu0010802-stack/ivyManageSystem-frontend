# 教師端 Portal 大 polish — Phase 6 實作計畫（簡化版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** PortalStudentAttendanceView 662 → ~220 行 + 4 子元件 + 套用 OfflineQueueBadge；保留既有 offline queue 機制不動。

**Architecture:** 4 子元件按 Tabs / Rollcall / Monthly / Offline 分職責；主檔 orchestration + state。

**Tech Stack:** Vue 3 + `<script setup>` / Element Plus / Chart.js + vue-chartjs / Vitest

**Spec:** `docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-6-design.md`

**Branch:** `feat/teacher-acd-v1-6-student-attendance` from `feat/teacher-acd-v1-5-schedule`

---

### Task 6F.1: 開 phase-6 branch + 建目錄

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1
git checkout -b feat/teacher-acd-v1-6-student-attendance
git add docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-6-design.md \
        docs/superpowers/plans/2026-05-06-teacher-portal-acd-phase-6.md
git commit -m "docs: Phase 6 spec + plan（簡化版）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
mkdir -p src/views/portal/components/studentAttendance tests/unit/views/portal/studentAttendance
npm run test 2>&1 | tail -5
```

Expected：955 passed。

---

### Task 6F.2: 抽 OfflinePanel + Tabs（Round 1）

兩個結構單純的元件 subagent 一次處理。

#### Sub-task A: StudentOfflinePanel.vue

職責：離線狀態橫條（紅）+ pendingCount > 0 時用 OfflineQueueBadge 顯示 + 立即同步按鈕。

接收 props：
- `isOnline: Boolean`
- `pendingCount: Number`
- `syncing: Boolean`

emit：`sync-now`。

範例：

```vue
<script setup>
import OfflineQueueBadge from '@/components/portal/OfflineQueueBadge.vue'

defineProps({
  isOnline: { type: Boolean, required: true },
  pendingCount: { type: Number, default: 0 },
  syncing: { type: Boolean, default: false },
})

defineEmits(['sync-now'])
</script>

<template>
  <div v-if="!isOnline || pendingCount > 0" class="offline-panel" :class="{ 'is-offline': !isOnline }">
    <div class="offline-panel__status">
      <span v-if="!isOnline" class="status-text status-text--offline">⚠ 目前離線，操作將存入佇列</span>
      <OfflineQueueBadge
        v-else-if="pendingCount > 0"
        :count="pendingCount"
        status="pending"
      />
    </div>
    <div v-if="isOnline && pendingCount > 0" class="offline-panel__actions">
      <el-button size="small" type="primary" :loading="syncing" @click="$emit('sync-now')">
        立即同步
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.offline-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}

.offline-panel.is-offline {
  background: #fee2e2;
  border-color: #fecaca;
}

.status-text {
  font-size: var(--text-sm);
  color: var(--pt-text-strong);
}

.status-text--offline {
  color: #b91c1c;
  font-weight: 500;
}

.offline-panel__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
```

vitest 5 條：
- 線上 + 無 pending → 不渲染（v-if=false）
- 離線 → 渲染 offline 文字
- 線上 + pending > 0 → 渲染 badge + 立即同步按鈕
- 立即同步按鈕點擊 emit `sync-now`
- syncing 時按鈕 loading

#### Sub-task B: StudentAttendanceTabs.vue

簡單 wrapper，職責：tab 容器 + classroom select + 把日 / 月內容透過 slot 注入。

```vue
<script setup>
defineProps({
  activeTab: { type: String, required: true },  // 'daily' | 'monthly'
  classrooms: { type: Array, required: true },
  classroomId: { type: [Number, null], default: null },
})

defineEmits(['update:activeTab', 'update:classroomId'])
</script>

<template>
  <div class="student-attendance-tabs">
    <div class="tabs-header">
      <el-radio-group
        :model-value="activeTab"
        @update:model-value="$emit('update:activeTab', $event)"
      >
        <el-radio-button label="daily">日點名</el-radio-button>
        <el-radio-button label="monthly">月統計</el-radio-button>
      </el-radio-group>

      <el-select
        :model-value="classroomId"
        placeholder="選擇班級"
        style="width: 200px"
        @update:model-value="$emit('update:classroomId', $event)"
      >
        <el-option
          v-for="c in classrooms"
          :key="c.classroom_id"
          :label="c.classroom_name"
          :value="c.classroom_id"
        />
      </el-select>
    </div>

    <div class="tabs-content">
      <slot v-if="activeTab === 'daily'" name="daily" />
      <slot v-else-if="activeTab === 'monthly'" name="monthly" />
    </div>
  </div>
</template>

<style scoped>
.student-attendance-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tabs-header {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.tabs-content {
  /* daily / monthly slots 用各自 children 排版 */
}
</style>
```

⚠ 實際 `classrooms[*]` 物件 schema：原 view 用 `classroom_id` / `classroom_name`，按此命名。

vitest 4-5 條：
- 渲染 radio group + select
- daily slot 渲染（activeTab=daily）
- monthly slot 渲染（activeTab=monthly）
- 切 tab emit `update:activeTab`
- 切 classroom emit `update:classroomId`

#### Final Round 1: commit

```bash
git add src/views/portal/components/studentAttendance/StudentOfflinePanel.vue \
        src/views/portal/components/studentAttendance/StudentAttendanceTabs.vue \
        tests/unit/views/portal/studentAttendance/StudentOfflinePanel.test.js \
        tests/unit/views/portal/studentAttendance/StudentAttendanceTabs.test.js
git commit -m "feat(portal-student-attendance): 抽出 OfflinePanel + Tabs 子元件

- StudentOfflinePanel: 離線提示 + OfflineQueueBadge（首次套用 phase 1 元件）
- StudentAttendanceTabs: 日/月 tab + classroom select + slot 注入

Phase 6 Round 1（2/4）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected：~10 條新 test，全 vitest 965。

---

### Task 6F.3: 抽 RollcallTable + MonthlyStats（Round 2）

#### Sub-task A: StudentRollcallTable.vue

接 props：
- `students: Array` （roster + 當日 attendance status）
- `loading: Boolean`
- `disabled: Boolean`（離線時可仍允許輸入）

emit：
- `update-status({ student_id, status, notes })`
- `quick-set-all(status)`

子元件純展示，不打 API；主檔接 emit 後處理 enqueueOp / syncQueue。

vitest 5-7 條：
- 渲染學生列表
- status select 變更 emit `update-status`
- 備註輸入 emit `update-status`
- 快速按鈕 emit `quick-set-all`
- 空 students 渲染空狀態
- disabled 時 select 仍可點（離線情境）

#### Sub-task B: StudentMonthlyStats.vue

接 props：
- `data: Object` （`monthlyData`：含 `summary` / `students` / `alerts` / 每日數據）
- `monthPicker: String` (yyyy-MM)
- `loading: Boolean`

emit：
- `update:monthPicker`
- `export-csv`

組成：
- 月度摘要卡（套用 StatCard 6 個指標）
- Chart.js Bar 圖（每日出席 vs 缺席）
- Alerts 列表（連續缺席學生）
- 月份選擇 + CSV 匯出按鈕

vitest 5-6 條：
- 月份切換 emit
- 匯出按鈕 emit
- summary 卡渲染
- alerts 列表渲染（含空狀態）
- Chart.js stub render

#### Final Round 2: commit

```bash
git add src/views/portal/components/studentAttendance/StudentRollcallTable.vue \
        src/views/portal/components/studentAttendance/StudentMonthlyStats.vue \
        tests/unit/views/portal/studentAttendance/StudentRollcallTable.test.js \
        tests/unit/views/portal/studentAttendance/StudentMonthlyStats.test.js
git commit -m "feat(portal-student-attendance): 抽出 RollcallTable + MonthlyStats 子元件

Phase 6 Round 2（4/4 子元件全部建立）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected：~12 條新 test，全 vitest 977。

---

### Task 6F.4: 主檔整合 + 收尾

整合 4 子元件進 PortalStudentAttendanceView：

1. import 4 子元件
2. 主檔保留 state（`dailyData` / `monthlyData` / `classrooms` / `monthPicker` / `activeTab` / `pendingCount` / `syncing` / `isOnline`）+ `useOnlineStatus()` + `enqueueOp` / `syncQueue` orchestration
3. 主檔提供 4 個 handler 接子元件 emit：
   - `onStatusUpdate({ student_id, status, notes })` → enqueueOp 或直接打 API
   - `onQuickSetAll(status)` → 對 students 迴圈 enqueueOp
   - `onSyncNow()` → syncQueue
   - `onExportCsv()` → 既有 export 邏輯
4. 移除已搬遷的 inline template + style
5. dev mode 手動驗證 + commit

收尾：
- 跑全 vitest（預期 977 passed）
- `wc -l src/views/portal/PortalStudentAttendanceView.vue`（< 280）
- `npm run build` 確認語法
- commit

---

## Phase 6 完成檢核

- [ ] 4 子元件建立 + vitest
- [ ] PortalStudentAttendanceView 主檔 < 280 行
- [ ] OfflineQueueBadge 套用實戰
- [ ] 既有 offline queue 機制不變
- [ ] 全 vitest ~977 綠
