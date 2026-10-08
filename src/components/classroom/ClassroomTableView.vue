<script setup lang="ts">
// 班級管理主頁預設檢視：依年級分組的密集表。一眼比較各班在籍/容量/師資，取代「一班一張卡」。
// 資料由父層過濾好後傳入（搜尋／年級／快篩都在父層），本元件只負責分組、排序與呈現。
// 手機（useIsMobile）改渲染分組清單：整列可點、≥44px，不出現橫向捲動的 table。
import { computed } from 'vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { capacityPercent, capacityStatus } from '@/utils/classroomCapacity'
import { reservedCountFor } from '@/utils/classroomReserved'
import ClassroomRowMenu from './ClassroomRowMenu.vue'
import type { ClassroomCommand, ClassroomRow, GradeLite } from './types'

const props = defineProps<{
  classrooms: ClassroomRow[]
  grades: GradeLite[]
  canWrite: boolean
  canReadStudents: boolean
  reservedByGrade: Record<number, number>
}>()

const emit = defineEmits<{
  open: [classroom: ClassroomRow]
  command: [cmd: ClassroomCommand, classroom: ClassroomRow]
}>()

const { isMobile } = useIsMobile()

const UNSET_GRADE = '未設定年級'
const UNKNOWN_ORDER = 99
const COLLATOR_LOCALE = 'zh-Hant'
const COLUMN_COUNT = 7

interface Summary {
  classCount: number
  enrolled: number
  capacity: number
  remaining: number
}

interface RowGroup extends Summary {
  key: string
  name: string
  reserved: number
  rows: ClassroomRow[]
}

const isActive = (c: ClassroomRow) => c.is_active !== false

// 啟用中的班才計入彙總（口徑與父層統計列 rosterStats 一致）；停用班只是「找回來看」的紀錄列
const summarize = (rows: ClassroomRow[]): Summary => {
  let enrolled = 0
  let capacity = 0
  let classCount = 0
  for (const c of rows) {
    if (!isActive(c)) continue
    classCount += 1
    enrolled += c.current_count ?? 0
    capacity += c.capacity ?? 0
  }
  return { classCount, enrolled, capacity, remaining: Math.max(0, capacity - enrolled) }
}

// 無代號排最後 → 代號自然排序（大2 在 大10 前）→ 班名
const compareRows = (a: ClassroomRow, b: ClassroomRow): number => {
  const ca = a.class_code || ''
  const cb = b.class_code || ''
  if (Boolean(ca) !== Boolean(cb)) return ca ? -1 : 1
  if (ca && cb) {
    const byCode = ca.localeCompare(cb, COLLATOR_LOCALE, { numeric: true })
    if (byCode !== 0) return byCode
  }
  return a.name.localeCompare(b.name, COLLATOR_LOCALE, { numeric: true })
}

const groups = computed<RowGroup[]>(() => {
  const order = new Map(props.grades.map((g) => [g.name, g.sort_order ?? UNKNOWN_ORDER]))
  const byGrade = new Map<string, ClassroomRow[]>()
  for (const c of props.classrooms) {
    const key = c.grade_name || UNSET_GRADE
    const list = byGrade.get(key)
    if (list) list.push(c)
    else byGrade.set(key, [c])
  }
  const names = Array.from(byGrade.keys()).sort((a, b) => {
    if ((a === UNSET_GRADE) !== (b === UNSET_GRADE)) return a === UNSET_GRADE ? 1 : -1
    const byOrder = (order.get(a) ?? UNKNOWN_ORDER) - (order.get(b) ?? UNKNOWN_ORDER)
    return byOrder || a.localeCompare(b, COLLATOR_LOCALE)
  })
  return names.map((name) => {
    const rows = [...(byGrade.get(name) ?? [])].sort(compareRows)
    // 保留數是年級口徑：取同組任一班的 grade_id 即可（同年級 grade_id 相同）
    const gradeId = rows.find((r) => r.grade_id != null)?.grade_id ?? null
    return {
      key: name,
      name,
      reserved: reservedCountFor(props.reservedByGrade, { grade_id: gradeId }),
      rows,
      ...summarize(rows),
    }
  })
})

const totals = computed(() => summarize(props.classrooms))

const groupMeta = (g: RowGroup): string => (
  `${g.classCount} 班 · 在籍 ${g.enrolled} / ${g.capacity} · 尚餘 ${g.remaining}`
)
const reservedText = (g: RowGroup): string => ` · 保留 ${g.reserved}`
const totalsText = computed(() => (
  `合計 ${totals.value.classCount} 班 · 在籍 ${totals.value.enrolled} / ${totals.value.capacity} · 尚餘 ${totals.value.remaining}`
))

type Tone = 'normal' | 'warning' | 'full'
interface CapacityView {
  count: number
  capacityText: string
  percent: number
  tone: Tone
  label: string
  remaining: string
}

// 容量缺失（null / 0）時 capacityStatus 會當單位容量 1，count>0 即「已滿」——表格不該憑空亮紅
const capacityView = (c: ClassroomRow): CapacityView => {
  const cap = Number(c.capacity)
  const hasCap = Number.isFinite(cap) && cap > 0
  const count = Math.max(0, c.current_count ?? 0)
  const tone: Tone = hasCap ? capacityStatus(c.current_count, c.capacity) : 'normal'
  return {
    count,
    capacityText: hasCap ? String(cap) : '—',
    percent: hasCap ? capacityPercent(c.current_count, c.capacity) : 0,
    tone,
    label: tone === 'full' ? '已滿' : tone === 'warning' ? '接近額滿' : '',
    remaining: hasCap ? String(Math.max(0, cap - count)) : '—',
  }
}

// 停用班的師資在停用時已被清空，空值不是「漏指派」，不亮警示
const headText = (c: ClassroomRow): string => (
  c.head_teacher_name || (isActive(c) ? '未指派' : '—')
)
const headMissing = (c: ClassroomRow): boolean => !c.head_teacher_name && isActive(c)
const englishText = (c: ClassroomRow): string => c.english_teacher_name || c.art_teacher_name || '—'
const teachersLine = (c: ClassroomRow): string => {
  const head = `班導 ${headText(c)}`
  return c.assistant_teacher_name ? `${head} · 副班 ${c.assistant_teacher_name}` : head
}

const open = (c: ClassroomRow) => emit('open', c)
const onCommand = (cmd: ClassroomCommand, c: ClassroomRow) => emit('command', cmd, c)
</script>

<template>
  <div class="classroom-table" data-test="classroom-table">
    <div v-if="!isMobile" class="table-scroll">
      <table class="grade-table" aria-label="班級清單">
        <thead>
          <tr>
            <th scope="col" class="col-name">班級</th>
            <th scope="col" class="col-count">在籍 / 容量</th>
            <th scope="col" class="col-remain">尚餘</th>
            <th scope="col" class="col-head">班導</th>
            <th scope="col" class="col-assistant">副班導</th>
            <th scope="col" class="col-english">美語老師</th>
            <th scope="col" class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody v-for="g in groups" :key="g.key">
          <tr class="group-row" data-test="group-row">
            <th scope="rowgroup" :colspan="COLUMN_COUNT">
              <span class="group-name">{{ g.name }}</span>{{ ' ' }}
              <span class="group-meta">{{ groupMeta(g) }}</span>
              <span
                v-if="g.reserved > 0"
                class="group-meta group-reserved"
                :title="`同年級暫定編班（未註冊）${g.reserved} 人`"
              >{{ reservedText(g) }}</span>
            </th>
          </tr>
          <tr
            v-for="c in g.rows"
            :key="c.id"
            class="class-row"
            :class="{ 'is-inactive': !isActive(c) }"
            data-test="classroom-row"
            :data-id="c.id"
            @click="open(c)"
          >
            <td class="col-name">
              <div class="name-cell">
                <button type="button" class="class-name-btn" @click.stop="open(c)">{{ c.name }}</button>
                <span v-if="c.class_code" class="class-code">{{ c.class_code }}</span>
                <span v-if="!isActive(c)" class="tag-inactive">已停用</span>
              </div>
            </td>
            <td class="col-count">
              <div class="count-cell">
                <span class="count-num" :class="`is-${capacityView(c).tone}`">{{ capacityView(c).count }} / {{ capacityView(c).capacityText }}</span>
                <span class="bar" aria-hidden="true">
                  <span class="bar-fill" :class="`is-${capacityView(c).tone}`" :style="{ width: `${capacityView(c).percent}%` }" />
                </span>
                <span v-if="capacityView(c).label" class="count-status" :class="`is-${capacityView(c).tone}`">{{ capacityView(c).label }}</span>
              </div>
            </td>
            <td class="col-remain">{{ capacityView(c).remaining }}</td>
            <td class="col-head" :class="{ 'is-missing': headMissing(c), 'is-empty': !c.head_teacher_name && !headMissing(c) }">{{ headText(c) }}</td>
            <td class="col-assistant" :class="{ 'is-empty': !c.assistant_teacher_name }">{{ c.assistant_teacher_name || '—' }}</td>
            <td class="col-english" :class="{ 'is-empty': englishText(c) === '—' }">{{ englishText(c) }}</td>
            <td class="col-actions" @click.stop>
              <div class="actions">
                <button
                  v-if="canReadStudents"
                  type="button"
                  class="roster-btn"
                  data-test="row-open"
                  @click="open(c)"
                >名冊</button>
                <ClassroomRowMenu
                  :classroom="c"
                  :can-write="canWrite"
                  :can-read-students="canReadStudents"
                  @command="(cmd) => onCommand(cmd, c)"
                />
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td :colspan="COLUMN_COUNT">{{ totalsText }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div v-else class="m-list">
      <section v-for="g in groups" :key="g.key" class="m-group">
        <div class="m-group__head" data-test="group-row">
          <span class="group-name">{{ g.name }}</span>{{ ' ' }}
          <span class="group-meta">{{ groupMeta(g) }}</span>
          <span
            v-if="g.reserved > 0"
            class="group-meta group-reserved"
            :title="`同年級暫定編班（未註冊）${g.reserved} 人`"
          >{{ reservedText(g) }}</span>
        </div>
        <div
          v-for="c in g.rows"
          :key="c.id"
          class="m-row"
          :class="{ 'is-inactive': !isActive(c) }"
          data-test="classroom-row"
          :data-id="c.id"
        >
          <button type="button" class="m-row__main" data-test="row-main" @click="open(c)">
            <span class="m-row__top">
              <span class="m-row__title">
                <span class="m-row__name">{{ c.name }}</span>
                <span v-if="c.class_code" class="class-code">{{ c.class_code }}</span>
                <span v-if="!isActive(c)" class="tag-inactive">已停用</span>
              </span>
              <span class="m-row__count">
                <span v-if="capacityView(c).label" class="count-status" :class="`is-${capacityView(c).tone}`">{{ capacityView(c).label }}</span>
                <span class="count-num" :class="`is-${capacityView(c).tone}`">{{ capacityView(c).count }} / {{ capacityView(c).capacityText }}</span>
              </span>
            </span>
            <span class="bar bar--thin" aria-hidden="true">
              <span class="bar-fill" :class="`is-${capacityView(c).tone}`" :style="{ width: `${capacityView(c).percent}%` }" />
            </span>
            <span class="m-row__teachers" :class="{ 'is-missing': headMissing(c) }">{{ teachersLine(c) }}</span>
          </button>
          <div class="m-row__menu" @click.stop>
            <ClassroomRowMenu
              :classroom="c"
              :can-write="canWrite"
              :can-read-students="canReadStudents"
              @command="(cmd) => onCommand(cmd, c)"
            />
          </div>
        </div>
      </section>
      <p class="m-total">{{ totalsText }}</p>
    </div>
  </div>
</template>

<style scoped>
.classroom-table {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
}

.grade-table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  font-size: var(--text-base);
  color: var(--text-primary);
}

/* ── 表頭 ─────────────────────────────────────────────────────────────── */
.grade-table thead th {
  height: 40px;
  padding: 0 var(--space-3);
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-tertiary);
  text-align: left;
  white-space: nowrap;
}

.grade-table thead th:first-child,
.grade-table tbody td:first-child {
  padding-left: var(--space-4);
}

.grade-table thead th.col-remain,
.grade-table tbody td.col-remain {
  text-align: right;
}

.grade-table thead th.col-actions {
  text-align: right;
  padding-right: var(--space-4);
}

/* ── 年級組標頭 ───────────────────────────────────────────────────────── */
.group-row th {
  height: 36px;
  padding: 0 var(--space-4);
  background: var(--bg-color-soft);
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  font-weight: 400;
}

.group-name {
  margin-right: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.group-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.group-reserved {
  cursor: help;
}

/* ── 班級列 ───────────────────────────────────────────────────────────── */
.class-row {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.class-row:hover {
  background: var(--bg-color);
}

.class-row td {
  height: 56px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border-color-light);
  vertical-align: middle;
}

.class-row.is-inactive .col-name,
.class-row.is-inactive .col-count,
.class-row.is-inactive .col-remain {
  opacity: 0.65;
}

.name-cell {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.class-name-btn {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.class-name-btn:hover {
  color: var(--brand-primary-hover);
  text-decoration: underline;
}

.class-name-btn:focus-visible,
.roster-btn:focus-visible,
.m-row__main:focus-visible {
  outline: 2px solid var(--brand-primary-strong);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.class-code {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}

.tag-inactive {
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--bg-color-soft);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

/* ── 在籍 / 容量 ──────────────────────────────────────────────────────── */
.count-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.count-num {
  min-width: 56px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.count-num.is-warning,
.count-status.is-warning {
  color: var(--color-warning-darker);
}

.count-num.is-full,
.count-status.is-full {
  color: var(--color-danger-darker);
}

.count-status {
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
}

.bar {
  flex: 0 1 120px;
  width: 120px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--neutral-200);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--neutral-400);
}

.bar-fill.is-warning {
  background: var(--color-warning);
}

.bar-fill.is-full {
  background: var(--color-danger);
}

.col-remain {
  font-variant-numeric: tabular-nums;
  text-align: right;
  padding-right: var(--space-4);
}

/* ── 師資 ─────────────────────────────────────────────────────────────── */
.col-head,
.col-assistant,
.col-english {
  color: var(--text-secondary);
}

.col-head.is-missing {
  color: var(--color-danger-darker);
  font-weight: 500;
}

.col-head.is-empty,
.col-assistant.is-empty,
.col-english.is-empty {
  color: var(--neutral-400);
}

/* ── 操作 ─────────────────────────────────────────────────────────────── */
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  padding-right: var(--space-2);
}

.roster-btn {
  padding: var(--space-2);
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--text-sm);
  color: var(--brand-primary-strong);
  cursor: pointer;
}

.roster-btn:hover {
  color: var(--brand-primary-hover);
  text-decoration: underline;
}

/* ── 表尾 ─────────────────────────────────────────────────────────────── */
.total-row td {
  padding: var(--space-3) var(--space-4);
  background: var(--bg-color);
  border-top: 1px solid var(--border-color);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* ── 手機清單 ─────────────────────────────────────────────────────────── */
.m-group__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-color-soft);
  border-bottom: 1px solid var(--border-color);
}

.m-group__head .group-name {
  margin-right: 0;
}

.m-row {
  display: flex;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color-light);
}

.m-row.is-inactive .m-row__main {
  opacity: 0.65;
}

.m-row__main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--touch-target-min);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-3) var(--space-1) var(--space-3) var(--space-4);
  border: 0;
  background: none;
  font: inherit;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.m-row__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.m-row__title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
}

.m-row__name {
  font-size: var(--text-lg);
  font-weight: 600;
}

.m-row__count {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-shrink: 0;
}

.m-row__count .count-num {
  min-width: 0;
  font-size: var(--text-lg);
}

.bar--thin {
  display: block;
  width: 100%;
  flex: none;
  height: 4px;
}

.m-row__teachers {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.m-row__teachers.is-missing {
  color: var(--color-danger-darker);
}

.m-row__menu {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-1) 0 0;
}

.m-total {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-color);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

@media (prefers-reduced-motion: reduce) {
  .class-row {
    transition: none;
  }
}
</style>
