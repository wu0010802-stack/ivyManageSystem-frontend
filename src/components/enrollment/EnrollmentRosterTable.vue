<template>
  <div class="roster-wrapper">
    <!-- 外層並排：主表（可橫向滾動）+ 員工名單（右側固定） -->
    <div class="roster-outer">
      <!-- 主表 -->
      <div class="roster-scroll">
        <table class="roster-table">
          <thead>
            <!-- 標題列 -->
            <tr class="title-row">
              <td class="corner-cell" rowspan="2"></td>
              <td class="title-cell" :colspan="roster.classes.length">
                {{ rosterTitle }}
              </td>
              <td class="date-cell" rowspan="2">{{ roster.generated_date }}</td>
            </tr>
            <!-- 班級序號 -->
            <tr class="subtitle-row">
              <th
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                scope="col"
                class="class-num-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.class_number }}</th>
            </tr>
            <!-- 年級（垂直捲動時釘住） -->
            <tr class="sticky-grade-row">
              <th scope="row" class="row-label">年級</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="grade-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ shortGrade(cls.grade_name, cls.class_number) }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 班名（垂直捲動時釘住） -->
            <tr class="sticky-name-row">
              <th scope="row" class="row-label">班名</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="class-name-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.class_name }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 班導師 -->
            <tr>
              <th scope="row" class="row-label teacher-label">班導師</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="teacher-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.head_teacher_name ?? '' }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 副班導 -->
            <tr>
              <th scope="row" class="row-label teacher-label">副班導</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="teacher-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.assistant_teacher_name ?? '' }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 美師 -->
            <tr>
              <th scope="row" class="row-label teacher-label">美師</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="teacher-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.art_teacher_name ?? '' }}</td>
              <td class="corner-cell"></td>
            </tr>
          </thead>

          <!-- 學生本體 -->
          <tbody>
            <tr v-for="rowIdx in maxStudentCount" :key="rowIdx">
              <th scope="row" class="seq-cell">{{ rowIdx }}</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="student-cell"
                :class="[
                  studentTagClass(cls.students[rowIdx - 1]),
                  { 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) },
                  { 'is-hit': isHit(cls.students[rowIdx - 1]) }
                ]"
              >
                <template v-if="cls.students[rowIdx - 1]">
                  <button
                    type="button"
                    class="student-link"
                    @click="onClick(cls.students[rowIdx - 1])"
                  >{{ cls.students[rowIdx - 1].name }}</button><sup
                    v-if="statusMark(cls.students[rowIdx - 1])"
                    class="status-mark"
                  >{{ statusMark(cls.students[rowIdx - 1]) }}</sup>
                </template>
              </td>
              <td class="corner-cell"></td>
            </tr>
          </tbody>

          <!-- 底部統計 -->
          <tfoot>
            <!-- 合計 -->
            <tr class="total-row">
              <th scope="row" class="row-label total-label">合計</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="total-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.total }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 舊生 -->
            <tr class="old-row">
              <th scope="row" class="row-label">舊生</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="count-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.old_count || '' }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 新生 -->
            <tr class="new-row">
              <th scope="row" class="row-label">新生</th>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="count-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.new_count || '' }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 年級小計 -->
            <tr class="grade-total-row">
              <th scope="row" class="row-label">年級合計</th>
              <template v-for="gs in roster.grade_summaries" :key="gs.grade_name">
                <td :colspan="gs.class_numbers.length" class="grade-total-cell grade-border-right">
                  {{ gs.grade_name }} {{ gs.total }}人
                </td>
              </template>
              <td class="corner-cell"></td>
            </tr>
            <!-- 年級舊生/新生 -->
            <tr class="grade-breakdown-row">
              <th scope="row" class="row-label">舊／新</th>
              <template v-for="gs in roster.grade_summaries" :key="gs.grade_name">
                <td :colspan="gs.class_numbers.length" class="grade-breakdown-cell grade-border-right">
                  舊{{ gs.old_count }} ／ 新{{ gs.new_count }}
                </td>
              </template>
              <td class="corner-cell"></td>
            </tr>
            <!-- 全園總計 -->
            <tr class="grand-total-row">
              <td class="row-label grand-total-label" :colspan="roster.classes.length + 2">
                總計：{{ roster.grand_total }} 人
                &nbsp;（舊生 {{ roster.old_grand_total }} ／ 新生 {{ roster.new_grand_total }}）
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 右側員工名單面板 -->
      <div class="staff-panel">
        <!-- 圖例：直接示範學生格的實際樣式（顏色 + 右上標記） -->
        <div class="legend">
          <div class="legend-item"><span class="legend-sample tag-new">名<sup class="status-mark">新</sup></span>新生</div>
          <div class="legend-item"><span class="legend-sample tag-underage">名<sup class="status-mark">齡</sup></span>不足齡</div>
          <div class="legend-item"><span class="legend-sample tag-special">名<sup class="status-mark">特</sup></span>特教生</div>
          <div class="legend-item"><span class="legend-sample tag-indigenous">名<sup class="status-mark">原</sup></span>原住民</div>
        </div>
        <!-- 員工依職稱分組 -->
        <div class="staff-section">
          <div
            v-for="(entries, role) in roster.staff_by_role"
            :key="role"
            class="staff-group"
          >
            <div class="staff-role">{{ role }}</div>
            <div class="staff-names">
              <span v-for="e in entries" :key="e.name" class="staff-name">{{ e.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { coerceRocYear } from '@/utils/academic'
import type { Roster, RosterStudent } from './rosterTypes'

const props = defineProps<{
  roster: Roster
  highlightKeyword?: string
}>()

const emit = defineEmits<{
  'select-student': [{ id: number; name: string }]
}>()

const rosterTitle = computed(() => {
  const rawYear = props.roster.school_year
  const yr = coerceRocYear(rawYear)
  const sem = props.roster.semester === 1 ? '上' : '下'
  return `${yr}(${sem})幼兒在籍記錄`
})

const maxStudentCount = computed(() => {
  if (!props.roster.classes.length) return 0
  return Math.max(...props.roster.classes.map(c => c.students.length))
})

// 各年級最後一班的 class_number，用於加粗右邊框
const gradeLastClassNumbers = computed(() => {
  const set = new Set<number>()
  for (const gs of props.roster.grade_summaries) {
    if (gs.class_numbers.length) {
      set.add(gs.class_numbers[gs.class_numbers.length - 1])
    }
  }
  return set
})

// 年級簡稱：取年級名稱首字 + 班在年級內的序號
const gradeClassIndex = computed(() => {
  const map: Record<string, number> = {}
  for (const cls of props.roster.classes) {
    if (!map[cls.grade_name]) map[cls.grade_name] = 0
    map[cls.grade_name]++
    map[`${cls.grade_name}-${cls.class_number}`] = map[cls.grade_name]
  }
  return map
})

function shortGrade(gradeName: string, classNumber: number) {
  const idx = gradeClassIndex.value[`${gradeName}-${classNumber}`]
  const prefix = gradeName.charAt(0)
  return `${prefix}${idx}`
}

function studentTagClass(student: RosterStudent | undefined) {
  if (!student) return ''
  switch (student.status_tag) {
    case '新生': return 'tag-new'
    case '不足齡': return 'tag-underage'
    case '特教生': return 'tag-special'
    case '原住民': return 'tag-indigenous'
    default: return ''
  }
}

// 狀態右上標記：顏色之外的第二重指示（a11y：純色不可作為唯一狀態指示）
const STATUS_MARKS: Record<string, string> = {
  新生: '新',
  不足齡: '齡',
  特教生: '特',
  原住民: '原',
}

function statusMark(student: RosterStudent | undefined) {
  if (!student?.status_tag) return ''
  return STATUS_MARKS[student.status_tag] ?? ''
}

function isHit(student: RosterStudent | undefined) {
  const kw = (props.highlightKeyword ?? '').trim()
  return !!kw && !!student && student.name.includes(kw)
}

function onClick(student: RosterStudent | undefined) {
  if (student?.student_id) emit('select-student', { id: student.student_id, name: student.name })
}
</script>

<style>
/* 在籍狀態標籤色：EnrollmentRosterDialog 工具列 chips 共用，白底對比皆 ≥ 4.5:1（AA） */
:root {
  --roster-tag-new: var(--color-success-darker);
  --roster-tag-underage: var(--color-warning-darker);
  --roster-tag-special: #6d28d9;
  --roster-tag-indigenous: var(--color-info-darker);
}
</style>

<style scoped>
/* ── 外層 Layout ── */
.roster-wrapper {
  font-size: 14px;
  color: var(--text-primary);
  /* 表格線與紙本表格的暖黃帶（班級／教師列識別色，非語意色故留局部定義） */
  --roster-line: var(--neutral-300);
  --roster-line-strong: var(--neutral-500);
  --roster-band: #fffbe6;
  --roster-band-strong: #fff9db;
  --roster-sticky-row-h: 32px;
}

.roster-outer {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.roster-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  max-height: max(420px, calc(100vh - 260px));
}

.staff-panel {
  flex-shrink: 0;
  width: 160px;
}

/* ── 主表基礎 ──
   border-collapse: separate 是垂直 sticky 的前提（collapse 模式下框線屬於
   table 圖層，釘住的儲存格會與框線脫離）；框線改為每格畫右、下兩邊。 */
.roster-table {
  border-collapse: separate;
  border-spacing: 0;
  white-space: nowrap;
  color: var(--text-primary);
}

th {
  font-weight: inherit;
}

.roster-table th,
.roster-table td {
  border-right: 1px solid var(--roster-line);
  border-bottom: 1px solid var(--roster-line);
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
}

.roster-table thead tr:first-child th,
.roster-table thead tr:first-child td {
  border-top: 1px solid var(--roster-line);
}

.roster-table th:first-child,
.roster-table td:first-child {
  border-left: 1px solid var(--roster-line);
}

/* 佔位空格（最後一欄，寬度極小） */
.corner-cell {
  border: none !important;
  padding: 0 !important;
  width: 2px;
  min-width: 0;
}

/* ── 表頭 ── */
.title-cell {
  font-size: 17px;
  font-weight: 700;
  text-align: left !important;
  padding-left: 10px !important;
  border-left: 1px solid var(--roster-line);
}

.date-cell {
  font-size: 12px;
  color: var(--neutral-600);
  min-width: 72px;
}

.class-num-cell {
  min-width: 72px;
  font-weight: 600;
  background: var(--neutral-50);
}

/* 行標籤（sticky 固定左欄） */
.row-label {
  position: sticky;
  left: 0;
  z-index: 2;
  text-align: center;
  font-weight: 600;
  background: var(--neutral-100);
  min-width: 56px;
  white-space: nowrap;
  border-right: 2px solid var(--roster-line-strong) !important;
}

thead th.row-label,
thead td.corner-cell:first-child {
  z-index: 3;
}

.grade-cell {
  background: var(--roster-band-strong);
  font-weight: 600;
}

.class-name-cell {
  font-size: 13px;
  background: var(--neutral-0);
}

.teacher-label {
  background: var(--roster-band);
}

.teacher-cell {
  background: var(--roster-band);
  font-size: 13px;
}

/* ── 年級／班名列：垂直捲動時釘住，長名冊往下捲仍知道欄位是哪一班 ── */
.sticky-grade-row th,
.sticky-grade-row td,
.sticky-name-row th,
.sticky-name-row td {
  position: sticky;
  z-index: 4;
  height: var(--roster-sticky-row-h);
  padding-top: 0;
  padding-bottom: 0;
}

.sticky-grade-row th,
.sticky-grade-row td {
  top: 0;
}

.sticky-name-row th,
.sticky-name-row td {
  top: var(--roster-sticky-row-h);
}

.sticky-grade-row .row-label,
.sticky-name-row .row-label {
  z-index: 6;
}

/* ── 學生本體 ── */
.seq-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--neutral-100);
  color: var(--text-secondary);
  font-size: 12px;
  min-width: 32px;
  border-right: 2px solid var(--roster-line-strong) !important;
}

.student-cell {
  min-width: 72px;
  max-width: 96px;
}

/* 橫向追蹤輔助：寬表格 hover 該列淡淡打底 */
tbody tr:hover td.student-cell:not(.is-hit) {
  background: var(--neutral-50);
}

.student-link {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.student-link:hover {
  text-decoration: underline;
  color: var(--color-primary);
}

.student-link:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 1px;
  border-radius: 2px;
}

/* 狀態右上標記（顏色之外的第二重指示） */
.status-mark {
  font-size: 10px;
  margin-left: 1px;
  vertical-align: super;
}

/* ── 色彩標籤 ── */
.tag-new        { color: var(--roster-tag-new); }
.tag-underage   { color: var(--roster-tag-underage); }
.tag-special    { color: var(--roster-tag-special); }
.tag-indigenous { color: var(--roster-tag-indigenous); }

/* 搜尋命中高亮 */
.student-cell.is-hit {
  background: var(--color-warning-soft);
  outline: 2px solid var(--color-warning);
  font-weight: 700;
}

/* ── 年級分隔粗邊框 ── */
.grade-border-right {
  border-right: 2px solid var(--roster-line-strong) !important;
}

/* ── tfoot 統計區 ── */
.roster-table tbody tr:last-child th,
.roster-table tbody tr:last-child td {
  border-bottom: 2px solid var(--roster-line-strong);
}

.total-label {
  color: var(--color-danger-darker);
}

.total-cell {
  font-weight: 700;
  color: var(--color-danger-darker);
}

.count-cell {
  font-size: 13px;
}

.grade-total-cell {
  background: var(--border-color);
  font-weight: 700;
}

.grade-breakdown-cell {
  background: var(--bg-color-soft);
  font-size: 13px;
}

.grade-breakdown-row th,
.grade-breakdown-row td {
  border-bottom: 0;
}

.grand-total-row td {
  background: var(--brand-primary-soft);
  font-weight: 700;
  font-size: 15px;
  text-align: left !important;
  padding-left: 14px !important;
  border-top: 2px solid var(--brand-primary) !important;
}

/* ── 右側員工名單 ── */
.legend {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-item {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-sample {
  font-weight: 600;
}

.staff-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--neutral-50);
}

.staff-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.staff-role {
  font-weight: 700;
  font-size: 12px;
  color: var(--neutral-700);
  border-bottom: 1px solid var(--neutral-300);
  padding-bottom: 1px;
  margin-bottom: 2px;
}

.staff-names {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.staff-name {
  font-size: 12px;
  color: var(--neutral-600);
}
</style>
