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
        title="無符合人員"
        description="請調整搜尋條件或確認該月是否有出勤資料"
      />
    </div>

    <ul v-else class="roster-column__list" role="listbox" aria-label="人員名冊">
      <li
        v-for="row in sortedFiltered"
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
          <template v-if="anomalyCount(row) === 0">
            <el-tag type="success" size="small">全勤</el-tag>
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
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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

const searchQuery = ref('')

function anomalyCount(r: RosterRow): number {
  return r.late_count + r.early_leave_count + r.missing_punch_in + r.missing_punch_out
}

const sortedFiltered = computed<RosterRow[]>(() => {
  const q = searchQuery.value.toLowerCase()

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
  background-color: var(--brand-primary-soft, #eff6ff);
  border-left: 3px solid var(--brand-primary, #3b82f6);
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
