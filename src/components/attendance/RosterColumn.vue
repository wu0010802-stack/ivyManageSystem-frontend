<template>
  <div class="roster-column" v-loading="loading">
    <div class="roster-column__search">
      <el-input
        v-model="searchQuery"
        placeholder="搜尋姓名/編號"
        clearable
      />
    </div>

    <div v-if="!loading && sortedFiltered.length === 0" class="roster-column__empty">
      <EmptyState
        variant="inline"
        :title="searchQuery.trim() ? '沒有符合搜尋的人員' : '目前沒有出勤人員紀錄'"
        :description="searchQuery.trim() ? '請調整搜尋條件' : '請確認該月出勤資料'"
      />
      <el-button v-if="searchQuery.trim()" @click="searchQuery = ''">清除搜尋</el-button>
    </div>

    <!-- WAI-ARIA listbox（roving tabindex）：整個名冊只有一個 Tab 停點（選取列或第一列），
         ↑↓／Home／End 移動焦點、Enter／Space 選取；分組用 role="group" 包 option，標題文字對輔助科技隱藏
         改由 group 的 aria-label 唸出（listbox 的子層只能是 option 或 group）。 -->
    <ul
      v-else
      ref="listRef"
      class="roster-column__list"
      role="listbox"
      aria-label="人員名冊"
      @focusout="onListFocusOut"
    >
      <template v-for="group in groupedRows" :key="group.key">
        <li v-if="group.rows.length" class="roster-column__group" role="presentation">
          <div class="roster-column__group-label" aria-hidden="true">
            {{ group.label }}<span class="roster-column__group-count">{{ group.rows.length }}</span>
          </div>
          <ul
            class="roster-column__group-list"
            role="group"
            :aria-label="`${group.label}，${group.rows.length} 人`"
          >
            <li
              v-for="row in group.rows"
              :key="row.employee_id"
              class="roster-item"
              :class="{ 'roster-item--selected': row.employee_id === props.selectedEmployeeId }"
              role="option"
              :data-employee-id="row.employee_id"
              :tabindex="row.employee_id === tabStopId ? 0 : -1"
              :aria-selected="row.employee_id === props.selectedEmployeeId"
              @click="emit('select', row.employee_id)"
              @focus="focusedId = row.employee_id"
              @keydown="onOptionKeydown($event, row)"
            >
              <div class="roster-item__info">
                <span class="roster-item__name">{{ row.employee_name }}</span>
                <span v-if="row.employee_number" class="roster-item__number">
                  {{ row.employee_number }}
                </span>
                <!-- 整月同一種情形（多半是設定問題）：待辦數已排除這些格，標出來才不會讓人以為他沒事 -->
                <span v-if="hasPattern(row)" class="roster-item__pattern" data-test="roster-pattern">設定問題</span>
              </div>
              <div class="roster-item__badges">
                <el-tag v-if="row.has_summary === false" type="info" size="small">尚無統計</el-tag>
                <template v-else-if="anomalyCount(row) === 0">
                  <!-- P1-3：expected workdays 未定義前不宣稱「全勤」（待業主裁定） -->
                  <el-tag type="success" size="small">紀錄無異常</el-tag>
                </template>
                <template v-else>
                  <!-- 與排班與出勤格子同一套語意：遲到／早退會扣款＝danger，缺卡不扣款只記次數＝warning -->
                  <el-tag v-if="row.late_count > 0" type="danger" size="small">
                    遲{{ row.late_count }}
                  </el-tag>
                  <el-tag v-if="row.early_leave_count > 0" type="danger" size="small">
                    早{{ row.early_leave_count }}
                  </el-tag>
                  <el-tag
                    v-if="row.missing_punch_in > 0 || row.missing_punch_out > 0"
                    type="warning"
                    size="small"
                  >
                    缺{{ row.missing_punch_in + row.missing_punch_out }}
                  </el-tag>
                </template>
              </div>
            </li>
          </ul>
        </li>
      </template>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { RosterRow } from '@/composables/useAttendanceWorkspace'
import { groupRoster, rosterAnomalyCount, sortRoster } from '@/utils/attendanceRoster'

const props = defineProps<{
  roster: RosterRow[]
  selectedEmployeeId: number | null
  loading: boolean
  /**
   * 每位員工「尚未處理」的異常日卡數（key＝employee_number），由父層以
   * anomalyQueue 的 confirmed_action 計算。名冊上的 late_count 等欄位來自月統計，
   * **不會**因為管理者接受扣款或豁免而減少；分組若沿用它，處理完的人仍掛在
   * 「有待處理」底下。未提供時退回月統計數（單元測試等獨立掛載情境）。
   */
  pendingCounts?: Record<string, number>
  /**
   * 本月被判成「設定問題」的人（整月沒打卡、每天固定遲到早退等，key＝employee_number）。
   * 他們的設定問題格不算在 pendingCounts 裡（修好設定才會消失，不是逐日處理），名冊上補一個小標。
   */
  patternEmployeeNumbers?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  (e: 'select', employeeId: number): void
}>()

const searchQuery = defineModel<string>('search', { default: '' })

const anomalyCount = rosterAnomalyCount

const hasPattern = (row: RosterRow): boolean => !!row.employee_number && !!props.patternEmployeeNumbers?.has(row.employee_number)

const sortedFiltered = computed<RosterRow[]>(() => sortRoster(props.roster, searchQuery.value))

// 名冊依「有待處理 → 無異常 → 尚無打卡」分組（UI/UX 改版提案 09-10）；組內沿用
// sortedFiltered 既有的 anomalyCount 遞減排序，只是按組拆段呈現，不改變排序邏輯。
// 排序與分組在 utils/attendanceRoster（頁面預設選人也用同一份，才會選到畫面上的第一位）。
const groupedRows = computed(() => groupRoster(sortedFiltered.value, props.pendingCounts))

// ── 鍵盤操作（listbox + roving tabindex）────────────────────────────────────────
const listRef = ref<HTMLElement | null>(null)
/** 目前持有焦點的列（焦點離開名冊後清掉，Tab 停點回到選取列） */
const focusedId = ref<number | null>(null)

/** 畫面上由上到下的實際順序（跨分組攤平）；方向鍵依此移動，不依 sortedFiltered 的原排序 */
const visibleRows = computed<RosterRow[]>(() => groupedRows.value.flatMap((g) => g.rows))

/** roving tabindex 的唯一 Tab 停點：持有焦點的列 → 選取列 → 第一列（皆須在目前可見清單內） */
const tabStopId = computed<number | null>(() => {
  const ids = visibleRows.value.map((r) => r.employee_id)
  if (focusedId.value !== null && ids.includes(focusedId.value)) return focusedId.value
  if (props.selectedEmployeeId !== null && ids.includes(props.selectedEmployeeId)) {
    return props.selectedEmployeeId
  }
  return ids[0] ?? null
})

function focusRow(employeeId: number): void {
  focusedId.value = employeeId
  listRef.value?.querySelector<HTMLElement>(`[data-employee-id="${employeeId}"]`)?.focus()
}

function onOptionKeydown(e: KeyboardEvent, row: RosterRow): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const rows = visibleRows.value
  const index = rows.findIndex((r) => r.employee_id === row.employee_id)
  let nextIndex: number
  switch (e.key) {
    case 'ArrowDown':
      nextIndex = Math.min(index + 1, rows.length - 1)
      break
    case 'ArrowUp':
      nextIndex = Math.max(index - 1, 0)
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = rows.length - 1
      break
    case 'Enter':
    case ' ':
      // 與點擊同一路徑；Space 預設會捲動容器，必須擋掉
      e.preventDefault()
      emit('select', row.employee_id)
      return
    default:
      return
  }
  e.preventDefault()
  const target = rows[nextIndex]
  if (target) focusRow(target.employee_id)
}

function onListFocusOut(e: FocusEvent): void {
  const next = e.relatedTarget as Node | null
  if (!next || !listRef.value?.contains(next)) focusedId.value = null
}
</script>

<style scoped>
.roster-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.roster-column__search {
  padding: var(--space-3);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.roster-column__empty {
  padding: var(--space-4);
}

.roster-column__list,
.roster-column__group-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.roster-column__list {
  overflow-y: auto;
  flex: 1;
}

.roster-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color-light);
  transition: background-color var(--transition-fast);
  gap: var(--space-2);
}

.roster-item:hover {
  background-color: var(--el-fill-color-light);
}

/* 捲動容器內往內畫焦點框，避免被 overflow 裁掉 */
.roster-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.roster-item--selected {
  /* 2026-09-10 改版移除側邊色條（impeccable AI-slop 偵測命中），選取態單純以底色區分。 */
  background-color: var(--color-primary-lighter);
}

.roster-column__group-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3) 2px;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}

.roster-column__group-count {
  color: var(--text-tertiary);
}

.roster-item__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.roster-item__name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.roster-item__number {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: 1px;
}

.roster-item__pattern {
  font-size: var(--text-xs);
  color: var(--color-warning-darker);
  margin-top: 1px;
}

/* 選取列底色較深：工號改用一般字色，維持 AA 對比（原本 4.15:1） */
.roster-item--selected .roster-item__number {
  color: var(--el-text-color-regular);
}

.roster-item__badges {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}
</style>
