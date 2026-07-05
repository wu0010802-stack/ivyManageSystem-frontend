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
              <el-button
                v-if="editable"
                :icon="Edit"
                circle
                size="small"
                class="class-edit-btn"
                title="編輯班級"
                @click="emit('class-edit', cls.id)"
              />
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
              <span v-else class="teacher-unassigned" :title="referenceTitle(cls, 'head')">待確認</span>
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
              <span v-else class="teacher-unassigned" :title="referenceTitle(cls, 'assistant')">待確認</span>
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
              <span v-else class="teacher-unassigned" :title="referenceTitle(cls, 'art')">待確認</span>
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
              <!-- cellStudents 回傳 0~1 筆，藉 v-for 取得模板內的區域變數 student，
                   避免同一格重複 studentsByClass.get(cls.id)![rowIdx-1] 七次 -->
              <template v-for="student in cellStudents(cls.id, rowIdx)" :key="student.id">
                <label class="student-line">
                  <el-checkbox
                    v-if="editable"
                    class="student-checkbox"
                    :model-value="selected.has(student.id)"
                    @change="(val: string | number | boolean) => onToggleStudent(student.id, Boolean(val))"
                  />
                  <span class="student-name">{{ student.name }}</span>
                  <span
                    v-if="dispositionTag(student)"
                    class="disposition-tag"
                    :class="`disposition-tag-${student.disposition}`"
                  >{{ dispositionTag(student) }}</span>
                </label>
                <div class="student-source">{{ student.source_classroom_name ?? '' }}</div>
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

    <el-collapse v-model="openSections" class="side-collapse">
      <!-- 未分班（promote/retain 但無 plan_class_id）：正常流程不應出現，僅防呆顯示避免資料被靜默吃掉 -->
      <el-collapse-item
        v-if="unassignedStudents.length"
        name="unassigned"
        class="side-section unassigned-section"
        :title="`待分班（${unassignedStudents.length}）`"
      >
        <ul class="side-list">
          <li v-for="s in unassignedStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
          </li>
        </ul>
      </el-collapse-item>

      <!-- 畢業名單 -->
      <el-collapse-item name="graduate" class="side-section graduate-section" :title="`畢業名單（${graduateStudents.length}）`">
        <ul class="side-list">
          <li v-for="s in graduateStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="disposition-tag disposition-tag-graduate">畢</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
          </li>
        </ul>
      </el-collapse-item>

      <!-- 排除名單 -->
      <el-collapse-item name="exclude" class="side-section exclude-section" :title="`排除名單（${excludeStudents.length}）`">
        <ul class="side-list">
          <li v-for="s in excludeStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="disposition-tag disposition-tag-exclude">除</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
            <span v-if="s.exclude_reason" class="exclude-reason">（{{ s.exclude_reason }}）</span>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Edit } from '@element-plus/icons-vue'
import type { Schema } from '@/api/_generated/typed'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'

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
  // 對齊後端 BulkStudentsRequest 語意（批次 student_ids＋op＋plan_class_id）；拖曳搬班
  // 尚未接線（brief 明示 checkbox 批次優先，拖曳延後），單人移動＝ids 長度 1。
  'student-move': [payload: { studentIds: number[]; op: BulkOp; planClassId?: number | null; excludeReason?: string | null }]
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

// 教師「待確認」hover 參考：改顯示對應原班的三師姓名之一（source_head/assistant/
// art_teacher_name，Task 12 後端已補此三欄），None 顯「—」；取代 Task 11 只能顯示
// 來源班名稱字串的粗略提示。
function referenceTitle(cls: PlanClass, role: 'head' | 'assistant' | 'art'): string {
  const label = role === 'head' ? '班導' : role === 'assistant' ? '副班導' : '美語老師'
  const sourceName =
    role === 'head' ? cls.source_head_teacher_name
    : role === 'assistant' ? cls.source_assistant_teacher_name
    : cls.source_art_teacher_name
  return `原班${label}：${sourceName ?? '—'}`
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

/** 回傳 0~1 筆學生（供 template `v-for` 取得區域變數，避免同一格重複 `.get()`）。 */
function cellStudents(classId: number, rowIdx: number): PlanStudent[] {
  const student = studentsByClass.value.get(classId)?.[rowIdx - 1]
  return student ? [student] : []
}

const unassignedStudents = computed(() =>
  props.plan.students.filter(
    s => (s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id == null
  )
)
const graduateStudents = computed(() => props.plan.students.filter(s => s.disposition === 'graduate'))
const excludeStudents = computed(() => props.plan.students.filter(s => s.disposition === 'exclude'))

// 三個側欄收合區預設全開（沿用 Task 11 行為），改用 el-collapse 的 name 陣列。
const openSections = ref<string[]>(['unassigned', 'graduate', 'exclude'])

function dispositionTag(student: PlanStudent): string | null {
  switch (student.disposition) {
    case 'retain': return '留'
    case 'graduate': return '畢'
    case 'exclude': return '除'
    default: return null // promote 為預設分派，不需要 tag
  }
}

// ── 勾選集合：父層 PlanBatchToolbar 消費 select-students 事件實作批次操作 ──
const selected = ref<Set<number>>(new Set())

function onToggleStudent(studentId: number, checked: boolean): void {
  if (checked) selected.value.add(studentId)
  else selected.value.delete(studentId)
  emit('select-students', Array.from(selected.value))
}

// 草稿被其他操作（regenerate/發布/批次調整）異動後 version 會遞增；重新載入的新 plan
// 不該殘留舊版本的勾選集合，否則使用者可能對已不存在的分派繼續批次操作。
watch(
  () => props.plan.version,
  () => {
    selected.value.clear()
    emit('select-students', [])
  },
)

// student-move：拖曳搬班留待未來接線，本 task 僅先把事件型別對齊 BulkStudentsRequest。
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
  margin-left: 4px;
  vertical-align: middle;
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

.side-collapse {
  margin-top: var(--space-4);
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
