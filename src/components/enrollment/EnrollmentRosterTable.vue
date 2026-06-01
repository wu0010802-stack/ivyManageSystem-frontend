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
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="class-num-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ cls.class_number }}</td>
            </tr>
            <!-- 年級 -->
            <tr>
              <td class="row-label">年級</td>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="grade-cell"
                :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
              >{{ shortGrade(cls.grade_name, cls.class_number) }}</td>
              <td class="corner-cell"></td>
            </tr>
            <!-- 班名 -->
            <tr>
              <td class="row-label">班名</td>
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
              <td class="row-label teacher-label">班導師</td>
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
              <td class="row-label teacher-label">副班導</td>
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
              <td class="row-label teacher-label">美師</td>
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
              <td class="seq-cell">{{ rowIdx }}</td>
              <td
                v-for="cls in roster.classes"
                :key="cls.classroom_id"
                class="student-cell"
                :class="[
                  studentTagClass(cls.students[rowIdx - 1]),
                  { 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }
                ]"
              >
                <template v-if="cls.students[rowIdx - 1]">
                  {{ cls.students[rowIdx - 1].name
                  }}<span
                    v-if="cls.students[rowIdx - 1].status_tag === '原住民'"
                    class="indigenous-mark"
                  >原</span>
                </template>
              </td>
              <td class="corner-cell"></td>
            </tr>
          </tbody>

          <!-- 底部統計 -->
          <tfoot>
            <!-- 合計 -->
            <tr class="total-row">
              <td class="row-label total-label">合計</td>
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
              <td class="row-label">舊生</td>
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
              <td class="row-label">新生</td>
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
              <td class="row-label">年級合計</td>
              <template v-for="gs in roster.grade_summaries" :key="gs.grade_name">
                <td :colspan="gs.class_numbers.length" class="grade-total-cell grade-border-right">
                  {{ gs.grade_name }} {{ gs.total }}人
                </td>
              </template>
              <td class="corner-cell"></td>
            </tr>
            <!-- 年級舊生/新生 -->
            <tr class="grade-breakdown-row">
              <td class="row-label">舊／新</td>
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
        <!-- 圖例 -->
        <div class="legend">
          <div class="legend-item tag-new">■ 新生</div>
          <div class="legend-item tag-underage">■ 不足齡</div>
          <div class="legend-item tag-special">■ 特教生</div>
          <div class="legend-item tag-indigenous">■ 原住民</div>
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

interface RosterStudent {
  name: string
  status_tag?: string
}

interface RosterClass {
  classroom_id: number
  class_number: number
  grade_name: string
  class_name: string
  head_teacher_name?: string | null
  assistant_teacher_name?: string | null
  art_teacher_name?: string | null
  students: RosterStudent[]
  total: number
  old_count: number
  new_count: number
}

interface GradeSummary {
  grade_name: string
  class_numbers: number[]
  total: number
  old_count: number
  new_count: number
}

interface Roster {
  school_year: number
  semester: number
  generated_date: string
  classes: RosterClass[]
  grade_summaries: GradeSummary[]
  grand_total: number
  old_grand_total: number
  new_grand_total: number
  staff_by_role: Record<string, { name: string }[]>
}

const props = defineProps<{
  roster: Roster
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
</script>

<style scoped>
/* ── 外層 Layout ── */
.roster-wrapper {
  font-size: 14px;
  color: var(--text-primary);
}

.roster-outer {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.roster-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.staff-panel {
  flex-shrink: 0;
  width: 160px;
}

/* ── 主表基礎 ── */
.roster-table {
  border-collapse: collapse;
  white-space: nowrap;
  color: var(--text-primary);
}

.roster-table td {
  border: 1px solid #aaa;
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
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
}

.date-cell {
  font-size: 12px;
  color: var(--neutral-600);
  min-width: 72px;
}

.class-num-cell {
  min-width: 72px;
  font-weight: 600;
  background: #f8f9fa;
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
  border-right: 2px solid #8c8c8c !important;
}

thead td.row-label,
thead td.corner-cell:first-child {
  z-index: 3;
}

.grade-cell {
  background: #fff9db;
  font-weight: 600;
}

.class-name-cell {
  font-size: 13px;
}

.teacher-label {
  background: #fffbe6;
}

.teacher-cell {
  background: #fffbe6;
  font-size: 13px;
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
  border-right: 2px solid #8c8c8c !important;
}

.student-cell {
  min-width: 72px;
  max-width: 96px;
}

.indigenous-mark {
  font-size: 10px;
  color: var(--color-info-hover);
  margin-left: 1px;
  vertical-align: super;
}

/* ── 色彩標籤 ── */
.tag-new        { color: var(--color-success-hover); }
.tag-underage   { color: #ea580c; }
.tag-special    { color: #7c3aed; }
.tag-indigenous { color: var(--color-info-hover); }

/* ── 年級分隔粗邊框 ── */
.grade-border-right {
  border-right: 2px solid var(--neutral-600) !important;
}

/* ── tfoot 統計區 ── */
tfoot tr:first-child td {
  border-top: 2px solid var(--neutral-600);
}

.total-label {
  color: var(--color-danger-hover);
}

.total-cell {
  font-weight: 700;
  color: var(--color-danger-hover);
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

.grand-total-row td {
  background: var(--color-info-soft);
  font-weight: 700;
  font-size: 15px;
  text-align: left !important;
  padding-left: 14px !important;
  border-top: 2px solid var(--color-info) !important;
}

/* ── 右側員工名單 ── */
.legend {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.legend-item {
  font-size: 12px;
}

.staff-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: #fafafa;
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
