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

    <!-- 班級快選（①快速找到繳費的學生，2026-08-16）：現場收費時家長多半自報班級，
         點一下即列出全班，比打字搜尋更快命中；改自原本的下拉選單。 -->
    <div class="pos-search__class-chips" role="group" aria-label="班級快選">
      <el-check-tag
        class="pos-search__class-chip"
        :checked="!classroomFilter"
        @change="$emit('update:classroomFilter', '')"
      >
        全部
      </el-check-tag>
      <el-check-tag
        v-for="c in classroomOptions"
        :key="c"
        class="pos-search__class-chip"
        :checked="classroomFilter === c"
        @change="$emit('update:classroomFilter', classroomFilter === c ? '' : c)"
      >
        {{ c }}
      </el-check-tag>
    </div>

    <div class="pos-panel__filters">
      <el-switch
        v-if="!isRefundMode"
        :model-value="overdueOnly"
        size="small"
        active-text="只看逾期"
        inline-prompt
        @update:model-value="$emit('update:overdueOnly', $event)"
      />
    </div>

    <el-alert
      v-if="!searching && truncated"
      class="pos-panel__truncated"
      type="warning"
      :title="truncationText"
      :closable="false"
      show-icon
    />

    <div class="pos-panel__summary" v-if="!searching && resultCount > 0">
      <span>{{ resultSummaryText }}</span>
      <span class="pos-panel__summary-total">
        待{{ isRefundMode ? '退' : '收' }}合計 <strong>{{ formatTWD(totalAmount) }}</strong>
      </span>
    </div>

    <el-scrollbar class="pos-panel__results" v-loading="searching">
      <template v-if="mode === 'by-student'">
        <!-- 空狀態不能綁「有關鍵字」：搜尋框是過濾器不是啟動條件（一進頁就預載全部），
             且父層載入失敗時會 fail-closed 清空清單。兩種情況關鍵字都是空的，
             綁著就變成整片空白，看起來像「全部繳清」。 -->
        <div v-if="typedGroups.length === 0 && !searching" class="pos-panel__empty">
          {{ emptyStateText }}
        </div>
        <div
          v-for="g in typedGroups"
          :key="g.student_key"
          class="pos-group"
        >
          <!-- 只有一筆報名時整組攤平成單列：群組表頭在那種情況下只是把姓名與同一個
               金額再印一次（多數學生只報一門課）。多筆才需要表頭承載合計。 -->
          <div v-if="!isFlatGroup(g)" class="pos-group__head">
            <div>
              <div class="pos-group__name">{{ g.student_name }}</div>
              <div class="pos-group__sub">
                {{ g.class_name || '—' }}
                <span v-if="g.birthday">· 生日 {{ g.birthday }}</span>
              </div>
            </div>
            <div class="pos-group__owed" :class="{ 'pos-group__owed--refund': isRefundMode }">
              {{ groupTotalLabel }} {{ formatTWD(g.group_owed_total) }}
            </div>
          </div>
          <div
            v-for="reg in g.registrations"
            :key="reg.id"
            class="pos-reg"
            :class="{
              'pos-reg--selected': isSelected(reg.id),
              'pos-reg--flat': isFlatGroup(g),
            }"
            @click="emit('toggle', reg, g.student_name || '')"
          >
            <el-checkbox
              :model-value="isSelected(reg.id)"
              @click.stop
              @change="emit('toggle', reg, g.student_name || '')"
            />
            <div class="pos-reg__info">
              <div v-if="isFlatGroup(g)" class="pos-reg__student">
                <span class="pos-reg__student-name">{{ g.student_name }}</span>
                <span class="pos-reg__student-class">
                  {{ g.class_name || '—' }}
                  <template v-if="g.birthday">· 生日 {{ g.birthday }}</template>
                </span>
              </div>
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
              <!-- 已繳 0 時這行只是把欠款金額換句話再說一次；部分繳費才有資訊量，
                   順帶讓這種人在滿是「未繳」的清單裡自然凸顯。 -->
              <div v-if="hasPartialPayment(reg)" class="pos-reg__meta">
                應繳 {{ formatTWD(reg.total_amount) }} · 已繳 {{ formatTWD(reg.paid_amount) }}
              </div>
              <!-- 待審核防漏（③學期對帳追加，2026-08-16）：課程 pending_review 的
                   報名 total_amount 算不到，過去 owed=0 會在收款清單隱形；現場
                   收銀員仍要看得到人與待確認金額，提醒需先完成審核才能正式收款。 -->
              <el-tag
                v-if="reg.pending_review"
                type="danger"
                size="small"
                effect="dark"
                class="pos-reg__pending-tag"
              >
                待審核 · 待確認 {{ formatTWD(reg.pending_amount || 0) }}
              </el-tag>
            </div>
            <div class="pos-reg__owed" :class="{ 'pos-reg__owed--refund': isRefundMode }">
              <span v-if="isFlatGroup(g)" class="pos-reg__owed-label">{{ groupTotalLabel }}</span>
              {{ formatTWD(isRefundMode ? reg.paid_amount : reg.owed) }}
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="pos-cal__nav">
          <el-button aria-label="上個月" size="small" :icon="ArrowLeft" circle @click="shiftMonth(-1)" />
          <span class="pos-cal__month">{{ monthLabel }}</span>
          <el-button aria-label="下個月" size="small" :icon="ArrowRight" circle @click="shiftMonth(1)" />
          <el-button size="small" plain @click="gotoToday">今日</el-button>
        </div>

        <!-- 月曆走完整 grid 語意（grid > row > gridcell）＋ roving tabindex，
             鍵盤與讀屏使用者才選得到日期；純 div + @click 對他們是死路。 -->
        <div ref="gridRef" class="pos-cal__grid" role="grid" aria-label="報名日期月曆">
          <div class="pos-cal__weekdays" role="row">
            <div v-for="d in weekdayLabels" :key="d" role="columnheader">{{ d }}</div>
          </div>

          <div
            v-for="(row, ri) in calendarRows"
            :key="`row-${ri}`"
            class="pos-cal__row"
            role="row"
          >
            <div
              v-for="cell in row"
              :key="cell.dateKey"
              class="pos-cal__cell"
              role="gridcell"
              :data-cell-index="cell.index"
              :tabindex="cell.index === activeFocusIndex ? 0 : -1"
              :aria-selected="cell.dateKey === selectedDate ? 'true' : 'false'"
              :aria-label="cellAriaLabel(cell)"
              :class="{
                'pos-cal__cell--out': !cell.inMonth,
                'pos-cal__cell--active': cell.dateKey === selectedDate,
                'pos-cal__cell--today': cell.dateKey === todayKey,
                'pos-cal__cell--has': cell.count > 0,
              }"
              @click="activateCell(cell)"
              @focus="focusedCellIndex = cell.index"
              @keydown.enter.prevent="activateCell(cell)"
              @keydown.space.prevent="activateCell(cell)"
              @keydown.left.prevent="moveFocus(cell.index, -1)"
              @keydown.right.prevent="moveFocus(cell.index, 1)"
              @keydown.up.prevent="moveFocus(cell.index, -7)"
              @keydown.down.prevent="moveFocus(cell.index, 7)"
              @keydown.home.prevent="moveFocus(cell.index, -(cell.index % 7))"
              @keydown.end.prevent="moveFocus(cell.index, 6 - (cell.index % 7))"
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
        </div>

        <div class="pos-cal__list">
          <!-- loadError 要排在「點日期查看當日報名」之前：載入失敗時整份月曆都是空的，
               照原樣提示點日期，櫃台會點遍每一天都看到「當日無未結清報名」，
               與依學生模式同款誤導（P3-06）。 -->
          <div v-if="loadError" class="pos-panel__empty">{{ emptyStateText }}</div>
          <div v-else-if="!selectedDate" class="pos-panel__empty">點日期查看當日報名</div>
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
import { computed, nextTick, ref, watch } from 'vue'
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
  pending_review?: boolean
  pending_amount?: number
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
  /** 父層 runSearch 失敗（P3-06）：空清單要說「讀取失敗」而非「目前沒有未結清」 */
  loadError?: boolean
  // Using Record<string, unknown>[] for compatibility with composable return types
  groups?: Record<string, unknown>[]
  registrations?: Record<string, unknown>[]
  selectedIds?: (number | string)[]
  isRefundMode?: boolean
  classroomOptions?: string[]
  truncated?: boolean
  truncatedTotal?: number
}>(), {
  classroomFilter: '',
  overdueOnly: false,
  searching: false,
  loadError: false,
  groups: () => [],
  registrations: () => [],
  selectedIds: () => [],
  isRefundMode: false,
  classroomOptions: () => [],
  truncated: false,
  truncatedTotal: 0,
})

// 截斷提示文案：依模式區分。資料量超過後端上限時清單/日曆/金額不完整，提醒櫃台
// 用班級或關鍵字縮小範圍，避免靜默漏掉待收/待退款（code review P1/P2）。
const truncationText = computed(() => {
  const total = props.truncatedTotal || 0
  const totalHint = total > 0 ? `符合條件約 ${total} 筆，` : ''
  const action = props.isRefundMode ? '退款' : '收款'
  if (props.mode === 'by-student') {
    return `資料筆數較多（${totalHint}已達上限），清單僅顯示部分，請用班級或關鍵字縮小搜尋範圍，以免遺漏待${action}項目。`
  }
  return `部分交易未載入（${totalHint}每狀態上限 200 筆），日曆與金額可能少算，請用班級或關鍵字縮小範圍後再核對。`
})

// 分組表頭金額標籤：退費模式下後端（filter=refundable）回的 group_owed_total 語意是
// 「已繳／可退金額」而非欠款，沿用「欠」會讓櫃台把已繳清的學生誤判成欠費。標籤與配色
// 都對齊上方「待退／待收合計」。語意正規化理應在父層 composable 做，此處先於元件內收斂。
const groupTotalLabel = computed(() => (props.isRefundMode ? '可退' : '欠'))

// 空狀態文案：關鍵字只是過濾器，沒關鍵字也可能是空清單（母體本來就空，或父層載入
// 失敗 fail-closed 清空）。空白畫面會被讀成「全部繳清」，所以任何時候都要說話。
// loadError 分支必須排在最前面：載入失敗與「真的沒資料」在畫面上長得一模一樣，
// 講成「目前沒有未結清的報名」等於叫櫃台放人走，漏收款（P3-06）。
const emptyStateText = computed(() => {
  if (props.loadError) return '讀取清單失敗，請按重新整理重試'
  if (props.searchQuery) return `找不到符合「${props.searchQuery}」的學生`
  return props.isRefundMode ? '目前沒有可退費的報名' : '目前沒有未結清的報名'
})

/**
 * 只有一筆報名 → 攤平成單列（姓名與金額同行、品項在下），不再包群組表頭。
 * 表頭在這種情況下只是把姓名與同一個金額再印一次，而多數學生只報一門課。
 * 多筆時表頭仍要留著承載合計，各列才不必逐列重複姓名。
 */
function isFlatGroup(g: GroupEntry): boolean {
  return (g.registrations?.length ?? 0) === 1
}

/**
 * 是否為部分繳費（已繳 > 0 但尚未結清）。
 * 只有這種列才印「應繳 X · 已繳 Y」——已繳 0 時那行等於把欠款金額換句話再說一次。
 */
function hasPartialPayment(r: RegistrationEntry): boolean {
  const paid = Number(r.paid_amount || 0)
  const total = Number(r.total_amount || 0)
  return paid > 0 && paid < total
}

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
  // 帶上 index：roving tabindex 與方向鍵移動都以扁平索引為準
  return cells.map((c, index) => ({ ...c, index }))
})

type CalendarCell = (typeof calendarCells)['value'][number]

// 切成每列 7 格，讓 DOM 有 role="row" 這層——grid 直接掛 gridcell 對讀屏是壞結構。
const calendarRows = computed((): CalendarCell[][] => {
  const rows: CalendarCell[][] = []
  const cells = calendarCells.value
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
})

const gridRef = ref<HTMLElement | null>(null)
// null＝尚未用鍵盤移動過，此時焦點格取預設（已選日 → 今日 → 當月第一天）
const focusedCellIndex = ref<number | null>(null)

const defaultFocusIndex = computed(() => {
  const cells = calendarCells.value
  const selected = cells.findIndex((c) => c.dateKey === selectedDate.value)
  if (selected >= 0) return selected
  const today = cells.findIndex((c) => c.dateKey === todayKey && c.inMonth)
  if (today >= 0) return today
  const firstInMonth = cells.findIndex((c) => c.inMonth)
  return firstInMonth >= 0 ? firstInMonth : 0
})

const activeFocusIndex = computed(() => focusedCellIndex.value ?? defaultFocusIndex.value)

function cellAriaLabel(cell: CalendarCell) {
  const action = props.isRefundMode ? '可退費' : '未結清'
  if (cell.count <= 0) return `${cell.dateKey}，無${action}報名`
  return `${cell.dateKey}，${cell.count} 筆${action}報名，合計 ${formatTWD(cell.amount)}`
}

function activateCell(cell: CalendarCell) {
  focusedCellIndex.value = cell.index
  selectDate(cell.dateKey)
}

function moveFocus(from: number, delta: number) {
  const next = from + delta
  if (next < 0 || next >= calendarCells.value.length) return
  focusedCellIndex.value = next
  nextTick(() => {
    gridRef.value
      ?.querySelector<HTMLElement>(`[data-cell-index="${next}"]`)
      ?.focus()
  })
}

function shiftMonth(delta: number) {
  const { year, month } = currentMonth.value
  const newIdx = month + delta
  if (newIdx < 0) currentMonth.value = { year: year - 1, month: 11 }
  else if (newIdx > 11) currentMonth.value = { year: year + 1, month: 0 }
  else currentMonth.value = { year, month: newIdx }
  selectedDate.value = ''
  // 換月後扁平索引整組位移，鍵盤焦點格回到預設
  focusedCellIndex.value = null
}

function gotoToday() {
  const t = taipeiToday()
  currentMonth.value = { year: t.year, month: t.month }
  selectedDate.value = `${t.year}-${pad2(t.month + 1)}-${pad2(t.day)}`
  focusedCellIndex.value = null
}

function selectDate(key: string) {
  // 點到上／下月帶動月份切換
  const [y, m] = key.split('-').map(Number)
  if (y !== currentMonth.value.year || m - 1 !== currentMonth.value.month) {
    currentMonth.value = { year: y, month: m - 1 }
    focusedCellIndex.value = null
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

.pos-search__class-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pos-panel__filters {
  display: flex;
  gap: 10px;
  align-items: center;
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

/* 金額／警示一律走 *-darker：*-hover 是互動態 token，a11y.css 的 html.dark 刻意
   沒翻（站上有多處拿它當背景／邊框），深色下疊深底只有 2.5–3.6:1。 */
.pos-panel__summary-total strong {
  color: var(--color-danger-darker);
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
  /* 寫死 #eef0fd 在深色模式下是淺底配翻轉後的近白字＝隱形，而這塊正是櫃台辨識
     收款對象的主要區塊。沿用 AttendanceMonthSticky 的既有 token 寫法。 */
  background: var(--brand-primary-soft, #eef0fd);
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
  color: var(--color-danger-darker);
  font-size: 15px;
}

/* 退費模式不是欠款警示，配色與單列可退金額（.pos-reg__owed--refund）一致 */
.pos-group__owed--refund {
  color: var(--color-info-darker);
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

/* 攤平列：姓名與金額必須落在同一行，所以改頂端對齊——置中會讓金額浮在
   姓名與品項之間，掃描「誰欠多少」時對不上。 */
.pos-reg--flat {
  align-items: flex-start;
}

.pos-reg__student {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin-bottom: 4px;
}

.pos-reg__student-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.pos-reg__student-class {
  font-size: 12px;
  color: var(--text-secondary);
}

.pos-reg__owed-label {
  font-weight: 500;
  font-size: 13px;
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

.pos-reg__pending-tag {
  margin-top: 4px;
}

.pos-reg__owed {
  font-weight: 600;
  color: var(--color-danger-darker);
  font-size: 14px;
  white-space: nowrap;
}

.pos-reg__owed--refund {
  color: var(--color-info-darker);
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
  margin-bottom: 4px;
}

/* grid 語意需要 row 這一層，所以外層改直列堆疊、每列自己開七欄 grid，
   視覺與原本的單層七欄 grid 等價。 */
.pos-cal__grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
}

.pos-cal__row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.pos-cal__cell {
  position: relative;
  min-height: 62px;
  padding: 4px 6px;
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
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
  color: var(--color-info-darker);
  font-weight: 700;
}

.pos-cal__cell--active {
  background: var(--color-info-soft) !important;
  border-color: var(--color-info-darker) !important;
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
  color: var(--color-danger-darker);
  margin-top: auto;
}

.pos-cal__amt--refund {
  color: var(--color-info-darker);
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
