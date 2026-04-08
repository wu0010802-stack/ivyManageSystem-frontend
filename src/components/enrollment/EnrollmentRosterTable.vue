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

<script setup>
import { computed } from 'vue'

const props = defineProps({
  roster: {
    type: Object,
    required: true,
  },
})

const rosterTitle = computed(() => {
  const rawYear = props.roster.school_year
  const yr = rawYear > 1911 ? rawYear - 1911 : rawYear
  const sem = props.roster.semester === 1 ? '上' : '下'
  return `${yr}(${sem})幼兒在籍記錄`
})

const maxStudentCount = computed(() => {
  if (!props.roster.classes.length) return 0
  return Math.max(...props.roster.classes.map(c => c.students.length))
})

// 各年級最後一班的 class_number，用於加粗右邊框
const gradeLastClassNumbers = computed(() => {
  const set = new Set()
  for (const gs of props.roster.grade_summaries) {
    if (gs.class_numbers.length) set.add(gs.class_numbers.at(-1))
  }
  return set
})

// 年級簡稱：取年級名稱首字 + 班在年級內的序號
const gradeClassIndex = computed(() => {
  const map = {}
  for (const cls of props.roster.classes) {
    if (!map[cls.grade_name]) map[cls.grade_name] = 0
    map[cls.grade_name]++
    map[`${cls.grade_name}-${cls.class_number}`] = map[cls.grade_name]
  }
  return map
})

function shortGrade(gradeName, classNumber) {
  const idx = gradeClassIndex.value[`${gradeName}-${classNumber}`]
  const prefix = gradeName.charAt(0)
  return `${prefix}${idx}`
}

function studentTagClass(student) {
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
  font-size: 12px;
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
}

.roster-table td {
  border: 1px solid #aaa;
  padding: 2px 5px;
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
  font-size: 15px;
  font-weight: 700;
  text-align: left !important;
  padding-left: 8px !important;
}

.date-cell {
  font-size: 11px;
  color: #555;
  min-width: 60px;
}

.class-num-cell {
  min-width: 58px;
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
  background: #f0f2f5;
  min-width: 44px;
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
  font-size: 11px;
}

.teacher-label {
  background: #fffbe6;
}

.teacher-cell {
  background: #fffbe6;
  font-size: 11px;
}

/* ── 學生本體 ── */
.seq-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #f0f2f5;
  color: #666;
  font-size: 11px;
  min-width: 24px;
  border-right: 2px solid #8c8c8c !important;
}

.student-cell {
  min-width: 58px;
  max-width: 80px;
}

.indigenous-mark {
  font-size: 9px;
  color: #2563eb;
  margin-left: 1px;
  vertical-align: super;
}

/* ── 色彩標籤 ── */
.tag-new        { color: #16a34a; }
.tag-underage   { color: #ea580c; }
.tag-special    { color: #7c3aed; }
.tag-indigenous { color: #2563eb; }

/* ── 年級分隔粗邊框 ── */
.grade-border-right {
  border-right: 2px solid #475569 !important;
}

/* ── tfoot 統計區 ── */
tfoot tr:first-child td {
  border-top: 2px solid #475569;
}

.total-label {
  color: #dc2626;
}

.total-cell {
  font-weight: 700;
  color: #dc2626;
}

.count-cell {
  font-size: 11px;
}

.grade-total-cell {
  background: #e2e8f0;
  font-weight: 700;
}

.grade-breakdown-cell {
  background: #f1f5f9;
  font-size: 11px;
}

.grand-total-row td {
  background: #dbeafe;
  font-weight: 700;
  font-size: 13px;
  text-align: left !important;
  padding-left: 12px !important;
  border-top: 2px solid #3b82f6 !important;
}

/* ── 右側員工名單 ── */
.legend {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.legend-item {
  font-size: 11px;
}

.staff-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
  border: 1px solid #e2e8f0;
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
  font-size: 11px;
  color: #334155;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 1px;
  margin-bottom: 2px;
}

.staff-names {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.staff-name {
  font-size: 11px;
  color: #475569;
}

/* ── 列印 ── */
@media print {
  .roster-outer {
    display: flex !important;
    flex-direction: row !important;
  }
  .roster-scroll {
    overflow: visible !important;
    flex: 1;
  }
  .staff-panel {
    width: 150px !important;
    flex-shrink: 0;
  }
  /* 修正 sticky 在列印時不需要 */
  .row-label,
  .seq-cell {
    position: static !important;
  }
}

@page {
  size: A4 landscape;
  margin: 8mm;
}
</style>
