<template>
  <el-card class="pos-panel" shadow="never">
    <div class="pos-panel__header">
      <el-radio-group
        :model-value="mode"
        @update:model-value="onModeChange"
      >
        <el-radio-button
          v-for="m in modeOptions"
          :key="m.value"
          :value="m.value"
        >
          {{ m.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <el-input
      :model-value="searchQuery"
      :placeholder="placeholder"
      clearable
      size="large"
      :prefix-icon="Search"
      autofocus
      @update:model-value="$emit('update:searchQuery', $event)"
      @input="$emit('search')"
      @clear="$emit('search')"
      @keyup.enter="$emit('search')"
    />

    <div class="pos-panel__filters">
      <el-select
        :model-value="classroomFilter"
        placeholder="全部班級"
        clearable
        size="small"
        class="pos-panel__classroom"
        @update:model-value="$emit('update:classroomFilter', $event ?? '')"
      >
        <el-option label="全部班級" value="" />
        <el-option
          v-for="c in classroomOptions"
          :key="c"
          :label="c"
          :value="c"
        />
      </el-select>
      <el-switch
        v-if="!isRefundMode"
        :model-value="overdueOnly"
        size="small"
        active-text="只看逾期"
        inline-prompt
        @update:model-value="$emit('update:overdueOnly', $event)"
      />
    </div>

    <div class="pos-panel__summary" v-if="!searching && resultCount > 0">
      <span>{{ resultSummaryText }}</span>
      <span class="pos-panel__summary-total">
        待{{ isRefundMode ? '退' : '收' }}合計 <strong>{{ formatTWD(totalAmount) }}</strong>
      </span>
    </div>

    <el-scrollbar class="pos-panel__results" v-loading="searching">
      <template v-if="mode === 'by-student'">
        <div v-if="typedGroups.length === 0 && searchQuery && !searching" class="pos-panel__empty">
          無結果
        </div>
        <div
          v-for="g in typedGroups"
          :key="g.student_key"
          class="pos-group"
        >
          <div class="pos-group__head">
            <div>
              <div class="pos-group__name">{{ g.student_name }}</div>
              <div class="pos-group__sub">
                {{ g.class_name || '—' }}
                <span v-if="g.birthday">· 生日 {{ g.birthday }}</span>
              </div>
            </div>
            <div class="pos-group__owed">
              欠 {{ formatTWD(g.group_owed_total) }}
            </div>
          </div>
          <div
            v-for="reg in g.registrations"
            :key="reg.id"
            class="pos-reg"
            :class="{ 'pos-reg--selected': isSelected(reg.id) }"
            @click="emit('toggle', reg, g.student_name || '')"
          >
            <el-checkbox
              :model-value="isSelected(reg.id)"
              @click.stop
              @change="emit('toggle', reg, g.student_name || '')"
            />
            <div class="pos-reg__info">
              <div class="pos-reg__lines">
                <span
                  v-for="(c, i) in reg.courses"
                  :key="`c-${i}`"
                  class="pos-reg__line"
                >
                  {{ c.name }}
                </span>
                <span
                  v-for="(s, i) in reg.supplies"
                  :key="`s-${i}`"
                  class="pos-reg__line pos-reg__line--supply"
                >
                  {{ s.name }}
                </span>
              </div>
              <div class="pos-reg__meta">
                應繳 {{ formatTWD(reg.total_amount) }} · 已繳 {{ formatTWD(reg.paid_amount) }}
              </div>
            </div>
            <div class="pos-reg__owed" :class="{ 'pos-reg__owed--refund': isRefundMode }">
              {{ formatTWD(isRefundMode ? reg.paid_amount : reg.owed) }}
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="pos-cal__nav">
          <el-button size="small" :icon="ArrowLeft" circle @click="shiftMonth(-1)" />
          <span class="pos-cal__month">{{ monthLabel }}</span>
          <el-button size="small" :icon="ArrowRight" circle @click="shiftMonth(1)" />
          <el-button size="small" plain @click="gotoToday">今日</el-button>
        </div>

        <div class="pos-cal__weekdays">
          <div v-for="d in weekdayLabels" :key="d">{{ d }}</div>
        </div>

        <div class="pos-cal__grid">
          <div
            v-for="cell in calendarCells"
            :key="cell.dateKey"
            class="pos-cal__cell"
            :class="{
              'pos-cal__cell--out': !cell.inMonth,
              'pos-cal__cell--active': cell.dateKey === selectedDate,
              'pos-cal__cell--today': cell.dateKey === todayKey,
              'pos-cal__cell--has': cell.count > 0,
            }"
            @click="selectDate(cell.dateKey)"
          >
            <div class="pos-cal__day">{{ cell.day }}</div>
            <div
              v-if="cell.count > 0"
              class="pos-cal__amt"
              :class="{ 'pos-cal__amt--refund': isRefundMode }"
            >
              {{ compactTWD(cell.amount) }}
            </div>
            <div v-if="cell.count > 0" class="pos-cal__cnt">{{ cell.count }} 筆</div>
          </div>
        </div>

        <div class="pos-cal__list">
          <div v-if="!selectedDate" class="pos-panel__empty">點日期查看當日報名</div>
          <template v-else>
            <div class="pos-cal__list-head">
              {{ selectedDate }} · {{ selectedDateRows.length }} 筆報名
            </div>
            <div
              v-if="selectedDateRows.length === 0"
              class="pos-panel__empty"
            >
              當日無{{ isRefundMode ? '可退費' : '未結清' }}報名
            </div>
            <div
              v-for="row in selectedDateRows"
              :key="row.id"
              class="pos-reg pos-reg--solo"
              :class="{ 'pos-reg--selected': isSelected(row.id) }"
              @click="handleSingleToggle(row)"
            >
              <el-checkbox
                :model-value="isSelected(row.id)"
                @click.stop
                @change="handleSingleToggle(row)"
              />
              <div class="pos-reg__info">
                <div class="pos-reg__name">{{ row.student_name }} · {{ row.class_name || '—' }}</div>
                <div class="pos-reg__meta">
                  {{ row.course_names || '' }}
                </div>
                <div class="pos-reg__meta">
                  應繳 {{ formatTWD(row.total_amount) }} · 已繳 {{ formatTWD(row.paid_amount) }}
                </div>
              </div>
              <div class="pos-reg__owed" :class="{ 'pos-reg__owed--refund': isRefundMode }">
                {{ formatTWD(isRefundMode ? (row.paid_amount || 0) : computeOwed(row.total_amount, row.paid_amount)) }}
              </div>
            </div>
          </template>
        </div>
      </template>
    </el-scrollbar>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Search } from '@element-plus/icons-vue'

import { POS_MODES, computeOwed, formatTWD, normalizeByDateRow } from '@/constants/pos'

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

function taipeiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  return {
    year: Number(parts.find((p) => p.type === 'year')!.value),
    month: Number(parts.find((p) => p.type === 'month')!.value) - 1,
    day: Number(parts.find((p) => p.type === 'day')!.value),
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function compactTWD(n: number | string | null | undefined) {
  const v = Number(n) || 0
  if (v <= 0) return ''
  if (v < 1000) return `$${v}`
  if (v < 10000) {
    const k = (v / 1000).toFixed(1).replace(/\.0$/, '')
    return `$${k}k`
  }
  return `$${Math.round(v / 1000)}k`
}

interface RegistrationEntry {
  id: number | string
  student_name?: string
  class_name?: string
  total_amount?: number
  paid_amount?: number
  owed?: number
  courses?: { name: string }[]
  supplies?: { name: string }[]
  course_names?: string
  created_at?: string
  [key: string]: unknown
}

interface GroupEntry {
  student_key?: string
  student_name?: string
  class_name?: string
  birthday?: string
  group_owed_total?: number
  registrations?: RegistrationEntry[]
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  mode: string
  searchQuery: string
  classroomFilter?: string
  overdueOnly?: boolean
  searching?: boolean
  // Using Record<string, unknown>[] for compatibility with composable return types
  groups?: Record<string, unknown>[]
  registrations?: Record<string, unknown>[]
  selectedIds?: (number | string)[]
  isRefundMode?: boolean
  classroomOptions?: string[]
}>(), {
  classroomFilter: '',
  overdueOnly: false,
  searching: false,
  groups: () => [],
  registrations: () => [],
  selectedIds: () => [],
  isRefundMode: false,
  classroomOptions: () => [],
})

const emit = defineEmits<{
  'update:mode': [value: string | number | boolean]
  'update:searchQuery': [value: string | number | boolean]
  'update:classroomFilter': [value: string | number | boolean | null | undefined]
  'update:overdueOnly': [value: boolean | string | number]
  'search': []
  'toggle': [row: Record<string, unknown>, studentName: string]
}>()

function onModeChange(v: string | number | boolean | undefined) { if (v !== undefined) emit('update:mode', v) }

// Typed views of props for template access — the props stay as Record<string,unknown>[]
// to stay compatible with the composable's return type
const typedGroups = computed((): GroupEntry[] => props.groups as GroupEntry[])
const typedRegistrations = computed((): RegistrationEntry[] => props.registrations as RegistrationEntry[])
const selectedDateRows = computed((): RegistrationEntry[] =>
  (selectedDate.value ? dateMap.value.get(selectedDate.value)?.rows || [] : []) as RegistrationEntry[]
)

const modeOptions = POS_MODES

const placeholder = computed(() => {
  // 新語意：搜尋是過濾器（已預載全部）而非啟動條件
  if (props.isRefundMode) return '搜尋姓名 / 班級 / 家長手機（已列出全部可退費）'
  return props.mode === 'by-student'
    ? '搜尋姓名 / 班級 / 家長手機（已列出全部未結清）'
    : '搜尋姓名 / 班級（依報名日期瀏覽）'
})

function extractDateKey(iso: string | null | undefined) {
  if (!iso) return ''
  // created_at 為 UTC ISO，以 Asia/Taipei 時區為準切出 YYYY-MM-DD
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${day}`
}

// 每日欠款彙總：Map<YYYY-MM-DD, { rows, amount }>
const dateMap = computed(() => {
  const m = new Map<string, { rows: RegistrationEntry[]; amount: number }>()
  for (const row of typedRegistrations.value) {
    const key = extractDateKey(row.created_at) || '未知'
    if (!m.has(key)) m.set(key, { rows: [], amount: 0 })
    const g = m.get(key)!
    g.rows.push(row)
    g.amount += props.isRefundMode
      ? Number(row.paid_amount || 0)
      : computeOwed(row.total_amount, row.paid_amount)
  }
  return m
})

// 月曆狀態
const _today = taipeiToday()
const todayKey = `${_today.year}-${pad2(_today.month + 1)}-${pad2(_today.day)}`
const currentMonth = ref({ year: _today.year, month: _today.month })
const selectedDate = ref('')

const monthLabel = computed(
  () => `${currentMonth.value.year} 年 ${pad2(currentMonth.value.month + 1)} 月`
)

const calendarCells = computed(() => {
  const { year, month } = currentMonth.value
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()
  const cells = []

  // 上月補滿前導
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const pm = month === 0 ? 12 : month
    const py = month === 0 ? year - 1 : year
    const key = `${py}-${pad2(pm)}-${pad2(d)}`
    const entry = dateMap.value.get(key)
    cells.push({
      day: d,
      dateKey: key,
      inMonth: false,
      amount: entry?.amount || 0,
      count: entry?.rows.length || 0,
    })
  }

  // 當月
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad2(month + 1)}-${pad2(d)}`
    const entry = dateMap.value.get(key)
    cells.push({
      day: d,
      dateKey: key,
      inMonth: true,
      amount: entry?.amount || 0,
      count: entry?.rows.length || 0,
    })
  }

  // 下月補滿到 6 列
  let nd = 1
  while (cells.length < 42) {
    const nm = month === 11 ? 1 : month + 2
    const ny = month === 11 ? year + 1 : year
    const key = `${ny}-${pad2(nm)}-${pad2(nd)}`
    const entry = dateMap.value.get(key)
    cells.push({
      day: nd,
      dateKey: key,
      inMonth: false,
      amount: entry?.amount || 0,
      count: entry?.rows.length || 0,
    })
    nd++
  }
  return cells
})

function shiftMonth(delta: number) {
  const { year, month } = currentMonth.value
  const newIdx = month + delta
  if (newIdx < 0) currentMonth.value = { year: year - 1, month: 11 }
  else if (newIdx > 11) currentMonth.value = { year: year + 1, month: 0 }
  else currentMonth.value = { year, month: newIdx }
  selectedDate.value = ''
}

function gotoToday() {
  const t = taipeiToday()
  currentMonth.value = { year: t.year, month: t.month }
  selectedDate.value = `${t.year}-${pad2(t.month + 1)}-${pad2(t.day)}`
}

function selectDate(key: string) {
  // 點到上／下月帶動月份切換
  const [y, m] = key.split('-').map(Number)
  if (y !== currentMonth.value.year || m - 1 !== currentMonth.value.month) {
    currentMonth.value = { year: y, month: m - 1 }
  }
  selectedDate.value = selectedDate.value === key ? '' : key
}

// 切換搜尋 / 班級 / 模式時，若選中日期已無對應資料則清掉
watch(
  () => [props.mode, typedRegistrations.value.length, props.classroomFilter, props.searchQuery],
  () => {
    if (!selectedDate.value) return
    if (!dateMap.value.has(selectedDate.value)) selectedDate.value = ''
  }
)

const resultCount = computed(() =>
  props.mode === 'by-student' ? typedGroups.value.length : typedRegistrations.value.length
)

const resultSummaryText = computed(() => {
  if (props.mode === 'by-student') return `${typedGroups.value.length} 位學生`
  return `${typedRegistrations.value.length} 筆報名 · ${dateMap.value.size} 個日期`
})

const totalAmount = computed(() => {
  if (props.mode === 'by-student') {
    return typedGroups.value.reduce((s, g) => s + (g.group_owed_total || 0), 0)
  }
  return typedRegistrations.value.reduce((s, r) => {
    const base = props.isRefundMode
      ? r.paid_amount || 0
      : computeOwed(r.total_amount, r.paid_amount)
    return s + base
  }, 0)
})

const isSelected = (id: unknown) => props.selectedIds.includes(id as number | string)

function handleSingleToggle(row: RegistrationEntry) {
  // 優先使用後端回傳的真實 courses / supplies（含 price），
  // 若缺失則 fallback 到 course_names 拆解（normalizeByDateRow 內部處理）。
  const normalized = normalizeByDateRow(row as Record<string, unknown>)
  emit('toggle', normalized, row.student_name ?? '')
}
</script>

<style scoped>
.pos-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.pos-panel :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px;
}

.pos-panel__header {
  display: flex;
  justify-content: center;
}

.pos-panel__filters {
  display: flex;
  gap: 10px;
  align-items: center;
}

.pos-panel__classroom {
  flex: 1;
  min-width: 0;
}

.pos-panel__summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--neutral-600);
  padding: 6px 10px;
  background: var(--bg-color-soft);
  border-radius: 8px;
}

.pos-panel__summary-total strong {
  color: var(--color-danger-hover);
  font-size: 15px;
  margin-left: 4px;
}

.pos-panel__results {
  flex: 1;
  min-height: 0;
}

.pos-panel__empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px 0;
}

.pos-group {
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-color);
}

.pos-group__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #eef0fd;
  border-bottom: 1px solid var(--border-color);
}

.pos-group__name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.pos-group__sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.pos-group__owed {
  font-weight: 700;
  color: var(--color-danger-hover);
  font-size: 15px;
}

.pos-reg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.pos-reg:first-child {
  border-top: none;
}

.pos-reg:hover {
  background: var(--bg-color-soft);
}

.pos-reg--solo {
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: 8px;
}

.pos-reg--selected {
  background: var(--color-success-soft) !important;
  border-color: var(--color-success) !important;
}

.pos-reg__info {
  flex: 1;
  min-width: 0;
}

.pos-reg__lines {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 13px;
  color: var(--neutral-700);
}

.pos-reg__line {
  background: var(--brand-primary-soft);
  color: var(--brand-primary-hover);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.pos-reg__line--supply {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}

.pos-reg__name {
  font-weight: 600;
  color: var(--text-primary);
}

.pos-reg__meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.pos-reg__owed {
  font-weight: 600;
  color: var(--color-danger-hover);
  font-size: 14px;
  white-space: nowrap;
}

.pos-reg__owed--refund {
  color: #0284c7;
}

/* ── 月曆視圖 ─────────────────────────────────────────────── */
.pos-cal__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 4px 0 8px;
}

.pos-cal__month {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 110px;
  text-align: center;
}

.pos-cal__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-color);
}

.pos-cal__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 8px 0;
}

.pos-cal__cell {
  position: relative;
  min-height: 62px;
  padding: 4px 6px;
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pos-cal__cell:hover {
  border-color: var(--text-tertiary);
  background: var(--bg-color);
}

.pos-cal__cell--out {
  opacity: 0.4;
}

.pos-cal__cell--today {
  border-color: var(--color-info);
}

.pos-cal__cell--today .pos-cal__day {
  color: var(--color-info-hover);
  font-weight: 700;
}

.pos-cal__cell--active {
  background: var(--color-info-soft) !important;
  border-color: var(--color-info-hover) !important;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}

.pos-cal__cell--has {
  background: var(--color-danger-soft);
  border-color: var(--color-danger-soft);
}

.pos-cal__cell--has.pos-cal__cell--active {
  background: var(--color-danger-soft) !important;
}

.pos-cal__day {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.pos-cal__amt {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-danger-hover);
  margin-top: auto;
}

.pos-cal__amt--refund {
  color: #0284c7;
}

.pos-cal__cnt {
  font-size: 10px;
  color: var(--text-secondary);
}

.pos-cal__list {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
  margin-top: 6px;
}

.pos-cal__list-head {
  font-size: 13px;
  font-weight: 600;
  color: var(--neutral-600);
  padding: 4px 0 8px;
}
</style>
