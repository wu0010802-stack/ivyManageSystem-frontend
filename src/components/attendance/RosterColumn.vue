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

    <ul v-else class="roster-column__list" role="listbox" aria-label="人員名冊">
      <template v-for="group in groupedRows" :key="group.key">
        <li v-if="group.rows.length" class="roster-column__group-label" role="presentation">
          {{ group.label }}<span class="roster-column__group-count">{{ group.rows.length }}</span>
        </li>
        <li
          v-for="row in group.rows"
          :key="row.employee_id"
          class="roster-item"
          :class="{ 'roster-item--selected': row.employee_id === props.selectedEmployeeId }"
          role="option"
          :aria-selected="row.employee_id === props.selectedEmployeeId"
          @click="emit('select', row.employee_id)"
        >
          <div class="roster-item__info">
            <span class="roster-item__name">{{ row.employee_name }}</span>
            <span v-if="row.employee_number" class="roster-item__number">
              {{ row.employee_number }}
            </span>
          </div>
          <div class="roster-item__badges">
            <el-tag v-if="row.has_summary === false" type="info" size="small">尚無統計</el-tag>
            <template v-else-if="anomalyCount(row) === 0">
              <!-- P1-3：expected workdays 未定義前不宣稱「全勤」（待業主裁定） -->
              <el-tag type="success" size="small">紀錄無異常</el-tag>
            </template>
            <template v-else>
              <el-tag
                v-if="row.late_count > 0 || row.early_leave_count > 0"
                type="warning"
                size="small"
              >
                遲{{ row.late_count + row.early_leave_count }}
              </el-tag>
              <el-tag
                v-if="row.missing_punch_in > 0 || row.missing_punch_out > 0"
                type="danger"
                size="small"
              >
                缺{{ row.missing_punch_in + row.missing_punch_out }}
              </el-tag>
            </template>
          </div>
        </li>
      </template>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { RosterRow } from '@/composables/useAttendanceWorkspace'

const props = defineProps<{
  roster: RosterRow[]
  selectedEmployeeId: number | null
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'select', employeeId: number): void
}>()

const searchQuery = defineModel<string>('search', { default: '' })

function anomalyCount(r: RosterRow): number {
  return r.late_count + r.early_leave_count + r.missing_punch_in + r.missing_punch_out
}

const sortedFiltered = computed<RosterRow[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()

  const filtered = q
    ? props.roster.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(q) ||
          (r.employee_number?.toLowerCase().includes(q) ?? false),
      )
    : [...props.roster]

  return filtered.slice().sort((a, b) => {
    const diff = anomalyCount(b) - anomalyCount(a)
    if (diff !== 0) return diff
    return a.employee_name.localeCompare(b.employee_name, 'zh-TW')
  })
})

// 名冊依「有待處理 → 無異常 → 尚無打卡」分組（UI/UX 改版提案 09-10）；組內沿用
// sortedFiltered 既有的 anomalyCount 遞減排序，只是按組拆段呈現，不改變排序邏輯。
const groupedRows = computed(() => {
  const pending: RosterRow[] = []
  const clean: RosterRow[] = []
  const noSummary: RosterRow[] = []
  for (const row of sortedFiltered.value) {
    if (row.has_summary === false) noSummary.push(row)
    else if (anomalyCount(row) > 0) pending.push(row)
    else clean.push(row)
  }
  return [
    { key: 'pending', label: '有待處理', rows: pending },
    { key: 'clean', label: '無異常', rows: clean },
    { key: 'no-summary', label: '尚無打卡', rows: noSummary },
  ]
})
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

.roster-column__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.roster-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color-light, #f1f5f9);
  transition: background-color 0.15s;
  gap: var(--space-2);
}

.roster-item:hover {
  background-color: var(--fill-color-light, #f9fafb);
}

.roster-item--selected {
  /* fallback 與 token 真值對齊（design-tokens.css html.ivy-admin）；2026-09-10 改版
     移除側邊色條（impeccable AI-slop 偵測命中），選取態單純以底色區分。 */
  background-color: var(--brand-primary-soft, #e0f2fe);
}

.roster-column__group-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3) 2px;
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-tertiary, #94a3b8);
  letter-spacing: 0.04em;
}

.roster-column__group-count {
  color: var(--text-tertiary, #94a3b8);
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
  color: var(--text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.roster-item__number {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-tertiary, #94a3b8);
  margin-top: 1px;
}

.roster-item__badges {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}
</style>
