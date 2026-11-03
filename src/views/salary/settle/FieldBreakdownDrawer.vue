<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    :size="drawerSize"
    :modal="false"
    :lock-scroll="false"
    class="fb-drawer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="fb-head">
        <h2 class="fb-head__title">{{ row?.employee_name ?? '薪資明細' }}｜{{ year }} 年 {{ month }} 月</h2>
        <p v-if="headMeta" class="fb-head__meta">{{ headMeta }}</p>
      </div>
    </template>

    <div v-if="row" class="fb-body">
      <div class="fb-tabs" role="tablist" aria-label="薪資項目">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          role="tab"
          class="fb-tab"
          :class="{ 'is-active': t.key === field }"
          :aria-selected="t.key === field"
          @click="emit('update:field', t.key)"
        >{{ t.label }}</button>
      </div>

      <div v-loading="loading" class="fb-content">
        <div v-if="loadError" class="fb-error" role="alert">
          <p>明細載入失敗，請重試。</p>
          <el-button size="small" @click="load">重試</el-button>
        </div>
        <template v-else-if="data">
          <div class="fb-summary">
            <span class="fb-summary__title">{{ data.title || fieldLabel }}</span>
            <strong class="fb-summary__amount">合計 {{ money(data.summary?.amount ?? 0) }}</strong>
          </div>
          <el-alert v-if="data.note" :title="data.note" type="info" :closable="false" class="fb-note" />
          <el-table v-if="(data.rows ?? []).length > 0" :data="data.rows" border stripe max-height="520">
            <el-table-column
              v-for="column in data.columns ?? []"
              :key="column.key"
              :prop="column.key"
              :label="column.label"
              min-width="96"
            >
              <template #default="scope">{{ renderValue(scope.row, column.key) }}</template>
            </el-table-column>
          </el-table>
          <p v-else class="fb-empty">這個項目本月沒有逐筆紀錄。</p>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="fb-foot">
        <div class="fb-foot__nav">
          <el-button :disabled="!prevRow" @click="prevRow && emit('update:row', prevRow)">‹ 上一位</el-button>
          <span v-if="navIndex >= 0" class="fb-foot__pos">{{ navIndex + 1 }} / {{ navRows.length }}</span>
          <el-button :disabled="!nextRow" @click="nextRow && emit('update:row', nextRow)">下一位 ›</el-button>
        </div>
        <router-link v-if="row && ATTENDANCE_FIELDS.has(field)" class="fb-foot__link" :to="attendanceLink">
          到出勤核對處理
        </router-link>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { getSalaryFieldBreakdown } from '@/api/salary'
import { money, pad2 } from '@/utils/format'
import type { SettlementRecord } from '@/composables/useSalarySettlement'
import { MONEY_COLUMNS, cellValue } from './reviewColumns'

const props = defineProps<{
    modelValue: boolean
    row: SettlementRecord | null
    field: string
    /** 上一位／下一位的巡覽範圍（通常是畫面上目前篩選後的名冊） */
    navRows: SettlementRecord[]
    year: number
    month: number
}>()
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'update:row', row: SettlementRecord): void
    (e: 'update:field', field: string): void
}>()

interface Breakdown {
    employee?: { employee_code?: string; job_title?: string }
    title?: string
    rows?: Record<string, unknown>[]
    columns?: { key: string; label?: string }[]
    note?: string
    summary?: { amount?: number }
}

/** 出勤造成的扣款：明細底部帶「到出勤核對處理」 */
const ATTENDANCE_FIELDS = new Set(['absence_deduction', 'leave_deduction', 'late_deduction', 'early_leave_deduction'])
const BREAKDOWN_COLUMNS = MONEY_COLUMNS.filter((c) => c.breakdown)
const MONEY_KEYS = new Set(['bonusBase', 'result', 'perPerson', 'pay', 'deduction', 'dailySalary', 'ruleAmount', 'penalty', 'accrual'])

const { width } = useWindowSize()
const drawerSize = computed(() => (width.value < 768 ? '100%' : '560px'))

const fieldLabel = computed(() => BREAKDOWN_COLUMNS.find((c) => c.key === props.field)?.label ?? '薪資明細')
/** 頁籤：這個人本月有金額的可拆解欄位＋目前欄位（0 的欄位沒有東西可看） */
const tabs = computed(() => {
    const row = props.row
    if (!row) return []
    return BREAKDOWN_COLUMNS.filter((c) => c.key === props.field || cellValue(row, c) !== 0)
})

const headMeta = computed(() => {
    const parts = [data.value?.employee?.job_title || (props.row?.job_title as string | undefined), data.value?.employee?.employee_code]
    return parts.filter(Boolean).join(' · ')
})

const navIndex = computed(() => (props.row ? props.navRows.findIndex((r) => r.id === props.row!.id) : -1))
const prevRow = computed(() => (navIndex.value > 0 ? props.navRows[navIndex.value - 1] : null))
const nextRow = computed(() =>
    navIndex.value >= 0 && navIndex.value < props.navRows.length - 1 ? props.navRows[navIndex.value + 1] : null,
)

const attendanceLink = computed(() => ({
    path: '/attendance',
    query: { date: `${props.year}-${pad2(props.month)}-01`, emp: String(props.row?.employee_id ?? '') },
}))

const loading = ref(false)
const loadError = ref(false)
const data = ref<Breakdown | null>(null)
let requestSeq = 0

const load = async () => {
    const row = props.row
    if (!props.modelValue || !row?.id || !props.field) return
    const seq = ++requestSeq
    loading.value = true
    loadError.value = false
    data.value = null // 切換人／欄位時不讓上一筆明細配著新標題露出
    try {
        const res = await getSalaryFieldBreakdown(row.id, props.field)
        if (seq !== requestSeq) return // 快速切換時，晚到的舊回應不得蓋掉新的
        data.value = res.data as Breakdown
    } catch {
        if (seq !== requestSeq) return
        data.value = null
        loadError.value = true
    } finally {
        if (seq === requestSeq) loading.value = false
    }
}
watch(() => [props.modelValue, props.row?.id, props.field] as const, load, { immediate: true })

const renderValue = (row: Record<string, unknown>, key: string) => {
    const value = row?.[key]
    if (value === null || value === undefined || value === '') return '-'
    if (MONEY_KEYS.has(key)) return money(value)
    if (key === 'value' && typeof value === 'number') return money(value)
    return value
}
</script>

<style scoped>
.fb-head__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--el-text-color-primary);
}

.fb-head__meta {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}

.fb-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.fb-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.fb-tab {
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md);
  background: var(--surface-color);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.fb-tab.is-active {
  border-color: var(--brand-primary-strong, var(--el-color-primary));
  background: var(--brand-primary-soft, var(--el-color-primary-light-9));
  color: var(--brand-primary-strong, var(--el-color-primary));
  font-weight: var(--font-weight-semibold);
}

.fb-tab:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.fb-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 160px;
}

.fb-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--el-fill-color-lighter);
  border-radius: var(--radius-md);
}

.fb-summary__amount {
  font-size: var(--text-lg);
  font-variant-numeric: tabular-nums;
}

.fb-empty,
.fb-error p {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.fb-error {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.fb-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.fb-foot__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fb-foot__pos {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.fb-foot__link {
  color: var(--brand-primary-strong, var(--el-color-primary));
  font-size: var(--text-sm);
}
</style>
