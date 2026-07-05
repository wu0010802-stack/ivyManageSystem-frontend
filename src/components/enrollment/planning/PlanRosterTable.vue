<template>
  <div class="plan-roster-wrapper">
    <div class="plan-roster-scroll">
      <table class="plan-roster-table">
        <thead>
          <!-- 年級跨欄 -->
          <tr class="grade-row">
            <td class="corner-cell"></td>
            <template v-for="group in gradeGroups" :key="group.gradeId">
              <td class="grade-group-cell" :colspan="group.classes.length">{{ group.gradeName }}</td>
            </template>
          </tr>
          <!-- 班名 -->
          <tr>
            <td class="row-label">班名</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="class-name-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <span class="class-name-text">{{ cls.target_name }}</span>
              <button
                v-if="editable"
                type="button"
                class="class-edit-btn"
                title="編輯班級"
                @click="emit('class-edit', cls.id)"
              >✎</button>
            </td>
          </tr>
          <!-- 容量 badge -->
          <tr>
            <td class="row-label">人數</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="capacity-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <span class="capacity-badge" :class="{ 'over-capacity': isOverCapacity(cls) }">
                {{ cls.assigned_count }}/{{ cls.capacity ?? '—' }}
              </span>
            </td>
          </tr>
          <!-- 班導 -->
          <tr>
            <td class="row-label teacher-label">班導</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="teacher-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <span v-if="cls.head_teacher_name" class="teacher-name">{{ cls.head_teacher_name }}</span>
              <span v-else class="teacher-unassigned" :title="referenceTitle(cls)">待確認</span>
            </td>
          </tr>
          <!-- 副班導 -->
          <tr>
            <td class="row-label teacher-label">副班導</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="teacher-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <span v-if="cls.assistant_teacher_name" class="teacher-name">{{ cls.assistant_teacher_name }}</span>
              <span v-else class="teacher-unassigned" :title="referenceTitle(cls)">待確認</span>
            </td>
          </tr>
          <!-- 美語老師 -->
          <tr>
            <td class="row-label teacher-label">美語老師</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="teacher-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <span v-if="cls.art_teacher_name" class="teacher-name">{{ cls.art_teacher_name }}</span>
              <span v-else class="teacher-unassigned" :title="referenceTitle(cls)">待確認</span>
            </td>
          </tr>
        </thead>

        <tbody>
          <tr v-for="rowIdx in maxRowCount" :key="rowIdx">
            <td class="seq-cell">{{ rowIdx }}</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="student-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <template v-if="studentsByClass.get(cls.id)?.[rowIdx - 1]">
                <label class="student-line">
                  <input
                    v-if="editable"
                    type="checkbox"
                    class="student-checkbox"
                    :checked="selected.has(studentsByClass.get(cls.id)![rowIdx - 1].id)"
                    @change="onToggleStudent(studentsByClass.get(cls.id)![rowIdx - 1].id, ($event.target as HTMLInputElement).checked)"
                  >
                  <span class="student-name">{{ studentsByClass.get(cls.id)![rowIdx - 1].name }}</span>
                  <span
                    v-if="dispositionTag(studentsByClass.get(cls.id)![rowIdx - 1])"
                    class="disposition-tag"
                    :class="`disposition-tag-${studentsByClass.get(cls.id)![rowIdx - 1].disposition}`"
                  >{{ dispositionTag(studentsByClass.get(cls.id)![rowIdx - 1]) }}</span>
                </label>
                <div class="student-source">{{ studentsByClass.get(cls.id)![rowIdx - 1].source_classroom_name ?? '' }}</div>
              </template>
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr class="grade-total-row">
            <td class="row-label">年級小計</td>
            <template v-for="group in gradeGroups" :key="group.gradeId">
              <td :colspan="group.classes.length" class="grade-total-cell">
                {{ group.gradeName }} 共 {{ gradeAssignedTotal(group) }} 人
              </td>
            </template>
          </tr>
          <tr class="grand-total-row">
            <td class="row-label grand-total-label" :colspan="flatClasses.length + 1">
              總計：{{ grandTotal }} 人（不含畢業／排除）
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 未分班（promote/retain 但無 plan_class_id）：正常流程不應出現，僅防呆顯示避免資料被靜默吃掉 -->
    <div v-if="unassignedStudents.length" class="side-section unassigned-section">
      <button type="button" class="side-toggle" @click="unassignedOpen = !unassignedOpen">
        待分班（{{ unassignedStudents.length }}）
      </button>
      <ul v-if="unassignedOpen" class="side-list">
        <li v-for="s in unassignedStudents" :key="s.id">
          <span class="student-name">{{ s.name }}</span>
          <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
        </li>
      </ul>
    </div>

    <!-- 畢業名單 -->
    <div class="side-section graduate-section">
      <button type="button" class="side-toggle" @click="graduateOpen = !graduateOpen">
        畢業名單（{{ graduateStudents.length }}）
      </button>
      <ul v-if="graduateOpen" class="side-list">
        <li v-for="s in graduateStudents" :key="s.id">
          <span class="student-name">{{ s.name }}</span>
          <span class="disposition-tag disposition-tag-graduate">畢</span>
          <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
        </li>
      </ul>
    </div>

    <!-- 排除名單 -->
    <div class="side-section exclude-section">
      <button type="button" class="side-toggle" @click="excludeOpen = !excludeOpen">
        排除名單（{{ excludeStudents.length }}）
      </button>
      <ul v-if="excludeOpen" class="side-list">
        <li v-for="s in excludeStudents" :key="s.id">
          <span class="student-name">{{ s.name }}</span>
          <span class="disposition-tag disposition-tag-exclude">除</span>
          <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
          <span v-if="s.exclude_reason" class="exclude-reason">（{{ s.exclude_reason }}）</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Schema } from '@/api/_generated/typed'

type PlanDetail = Schema<'PlanDetailOut'>
type PlanClass = Schema<'PlanClassOut'>
type PlanStudent = Schema<'PlanStudentOut'>

const props = defineProps<{
  plan: PlanDetail
  editable: boolean
}>()

const emit = defineEmits<{
  'select-students': [ids: number[]]
  'class-edit': [planClassId: number]
  'student-move': [payload: { studentId: number; fromPlanClassId: number | null; toPlanClassId: number | null }]
}>()

// ── 年級分組（依 target_grade_id 首次出現順序分組，容忍後端非嚴格連續排序）──
interface GradeGroup {
  gradeId: number
  gradeName: string
  classes: PlanClass[]
}

const gradeGroups = computed<GradeGroup[]>(() => {
  const order: number[] = []
  const map = new Map<number, PlanClass[]>()
  for (const cls of props.plan.classes) {
    if (!map.has(cls.target_grade_id)) {
      map.set(cls.target_grade_id, [])
      order.push(cls.target_grade_id)
    }
    map.get(cls.target_grade_id)!.push(cls)
  }
  return order.map(gid => ({
    gradeId: gid,
    gradeName: map.get(gid)![0].grade_name ?? '未分年級',
    classes: map.get(gid)!,
  }))
})

const flatClasses = computed<PlanClass[]>(() => gradeGroups.value.flatMap(g => g.classes))

const lastClassIds = computed(() => {
  const set = new Set<number>()
  for (const group of gradeGroups.value) {
    const last = group.classes[group.classes.length - 1]
    if (last) set.add(last.id)
  }
  return set
})

function isOverCapacity(cls: PlanClass): boolean {
  return cls.capacity != null && cls.assigned_count > cls.capacity
}

// 教師「待確認」hover 參考：PlanClassOut 沒有承接自來源班的教師姓名欄位（generator
// 產生草稿班時刻意不帶入教師，見 services/classroom_year_plan/generator.py
// _ensure_system_classes），故唯一可用的「原班」提示只有 source_name（來源班級
// 名稱字串）。Task 12 若要顯示真正的原班教師，需後端另外補欄位。
function referenceTitle(cls: PlanClass): string {
  return cls.source_name ? `原班參考：${cls.source_name}` : '新班級，無原班對應'
}

function gradeAssignedTotal(group: GradeGroup): number {
  return group.classes.reduce((sum, cls) => sum + cls.assigned_count, 0)
}

const grandTotal = computed(() =>
  flatClasses.value.reduce((sum, cls) => sum + cls.assigned_count, 0)
)

// ── 學生分桶：main grid（promote/retain 已分班）／未分班／畢業／排除 ──
const studentsByClass = computed(() => {
  const map = new Map<number, PlanStudent[]>()
  for (const s of props.plan.students) {
    if ((s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id != null) {
      if (!map.has(s.plan_class_id)) map.set(s.plan_class_id, [])
      map.get(s.plan_class_id)!.push(s)
    }
  }
  return map
})

const maxRowCount = computed(() => {
  let max = 0
  for (const list of studentsByClass.value.values()) {
    if (list.length > max) max = list.length
  }
  return max
})

const unassignedStudents = computed(() =>
  props.plan.students.filter(
    s => (s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id == null
  )
)
const graduateStudents = computed(() => props.plan.students.filter(s => s.disposition === 'graduate'))
const excludeStudents = computed(() => props.plan.students.filter(s => s.disposition === 'exclude'))

const unassignedOpen = ref(true)
const graduateOpen = ref(true)
const excludeOpen = ref(true)

function dispositionTag(student: PlanStudent): string | null {
  switch (student.disposition) {
    case 'retain': return '留'
    case 'graduate': return '畢'
    case 'exclude': return '除'
    default: return null // promote 為預設分派，不需要 tag
  }
}

// ── 勾選集合：Task 12 消費 select-students 事件實作批次操作 ──
const selected = ref<Set<number>>(new Set())

function onToggleStudent(studentId: number, checked: boolean): void {
  if (checked) selected.value.add(studentId)
  else selected.value.delete(studentId)
  emit('select-students', Array.from(selected.value))
}

// student-move：拖曳搬班為 Task 12 互動範圍，本 task 僅先宣告事件型別供銜接。
</script>

<style scoped>
.plan-roster-wrapper {
  font-size: 14px;
  color: var(--text-primary);
}

.plan-roster-scroll {
  overflow-x: auto;
}

.plan-roster-table {
  border-collapse: collapse;
  white-space: nowrap;
  color: var(--text-primary);
}

.plan-roster-table td {
  border: 1px solid var(--neutral-300);
  padding: 5px 8px;
  text-align: center;
  vertical-align: top;
}

.corner-cell {
  border: none !important;
}

.grade-group-cell {
  font-weight: 700;
  background: var(--neutral-100);
  border-right: 2px solid var(--neutral-600) !important;
}

.row-label {
  position: sticky;
  left: 0;
  z-index: 2;
  font-weight: 600;
  background: var(--neutral-100);
  border-right: 2px solid var(--neutral-600) !important;
  white-space: nowrap;
}

.class-name-cell {
  font-weight: 600;
}

.class-edit-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-info-hover);
  font-size: 12px;
  margin-left: 2px;
}

.capacity-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-full, 9999px);
  font-weight: 600;
  background: var(--neutral-100);
}

.capacity-badge.over-capacity {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.teacher-label {
  background: var(--color-warning-soft);
}

.teacher-cell {
  font-size: 13px;
}

.teacher-unassigned {
  color: var(--color-warning-hover);
  border: 1px dashed var(--color-warning);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  cursor: help;
}

.seq-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--neutral-100);
  color: var(--text-secondary);
  font-size: 12px;
  border-right: 2px solid var(--neutral-600) !important;
}

.student-cell {
  min-width: 96px;
  text-align: left;
}

.student-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: default;
}

.student-source {
  font-size: 11px;
  color: var(--text-secondary);
}

.disposition-tag {
  font-size: 11px;
  border-radius: var(--radius-sm);
  padding: 0 4px;
}

.disposition-tag-retain {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.disposition-tag-graduate {
  color: var(--color-info-hover);
  background: var(--color-info-soft);
}

.disposition-tag-exclude {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.grade-border-right {
  border-right: 2px solid var(--neutral-600) !important;
}

tfoot tr:first-child td {
  border-top: 2px solid var(--neutral-600);
}

.grade-total-cell {
  background: var(--neutral-100);
  font-weight: 700;
  font-size: 13px;
}

.grand-total-row td {
  background: var(--color-info-soft);
  font-weight: 700;
  text-align: left !important;
  padding-left: 14px !important;
}

.side-section {
  margin-top: var(--space-4);
}

.side-toggle {
  border: 1px solid var(--border-color, var(--neutral-300));
  background: var(--neutral-50);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-weight: 600;
  cursor: pointer;
}

.side-list {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side-list li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.exclude-reason {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
