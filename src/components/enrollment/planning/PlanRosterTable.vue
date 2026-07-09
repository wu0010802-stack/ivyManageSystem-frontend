<template>
  <div ref="rootEl" class="plan-roster-wrapper">
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
              :data-plan-class-id="cls.id"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id), 'drop-target-active': dragOverClassId === cls.id }"
              @dragover.prevent="onDragOver(cls.id, $event)"
              @dragleave="onDragLeave(cls.id)"
              @drop="onDrop(cls.id, $event)"
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
              :class="{ 'grade-border-right': lastClassIds.has(cls.id), 'drop-target-active': dragOverClassId === cls.id }"
              @dragover.prevent="onDragOver(cls.id, $event)"
              @dragleave="onDragLeave(cls.id)"
              @drop="onDrop(cls.id, $event)"
            >
              <!-- cellStudents 回傳 0~1 筆，藉 v-for 取得模板內的區域變數 student，
                   避免同一格重複 studentsByClass.get(cls.id)![rowIdx-1] 七次 -->
              <template v-for="student in cellStudents(cls.id, rowIdx)" :key="student.id">
                <div
                  class="student-entry"
                  :data-student-id="student.id"
                  :draggable="editable"
                  :class="{ dragging: draggingStudent?.id === student.id }"
                  @dragstart="onDragStart(student, $event)"
                  @dragend="onDragEnd"
                >
                  <label class="student-line">
                    <el-checkbox
                      v-if="editable"
                      class="student-checkbox"
                      :model-value="props.selectedIds.has(student.id)"
                      @change="(val: string | number | boolean) => emit('set-selected', [student.id], Boolean(val))"
                    />
                    <span class="student-name">{{ student.name }}</span>
                    <span
                      v-if="dispositionTag(student)"
                      class="disposition-tag"
                      :class="`disposition-tag-${student.disposition}`"
                    >{{ dispositionTag(student) }}</span>
                  </label>
                  <div class="student-source">{{ student.source_classroom_name ?? '' }}</div>
                </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Edit } from '@element-plus/icons-vue'
import type { Schema } from '@/api/_generated/typed'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'

type PlanDetail = Schema<'PlanDetailOut'>
type PlanClass = Schema<'PlanClassOut'>
type PlanStudent = Schema<'PlanStudentOut'>

const props = defineProps<{
  plan: PlanDetail
  editable: boolean
  selectedIds: Set<number>
}>()

const emit = defineEmits<{
  'set-selected': [ids: number[], checked: boolean]
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

function dispositionTag(student: PlanStudent): string | null {
  switch (student.disposition) {
    case 'retain': return '留'
    case 'graduate': return '畢'
    case 'exclude': return '除'
    default: return null // promote 為預設分派，不需要 tag
  }
}

// ── 拖曳搬班（原生 HTML5 DnD）：拖曳學生到別班欄 → emit student-move（op=assign）──
// 僅 editable 時可拖；同班放回 no-op；派發經路（student-move → 父層 onStudentMove →
// bulkUpdateStudents）與後端契約沿用既有實作，本元件只補 UI 觸發。
const draggingStudent = ref<{ id: number; planClassId: number | null } | null>(null)
const dragOverClassId = ref<number | null>(null)

function onDragStart(student: PlanStudent, event: DragEvent): void {
  if (!props.editable) return
  draggingStudent.value = { id: student.id, planClassId: student.plan_class_id ?? null }
  // jsdom 程式化 dispatch 無 dataTransfer；設值僅為真實瀏覽器的游標/拖曳影像。
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(student.id))
  }
}

function onDragOver(classId: number, event: DragEvent): void {
  // 內部拖曳（draggingStudent）或外部拖入（dataTransfer 帶 text/plain，如側欄待分班）皆高亮
  if (draggingStudent.value || event.dataTransfer?.types.includes('text/plain')) {
    dragOverClassId.value = classId
  }
}

function onDragLeave(classId: number): void {
  if (dragOverClassId.value === classId) dragOverClassId.value = null
}

function onDrop(targetClassId: number, event: DragEvent): void {
  const internal = draggingStudent.value
  draggingStudent.value = null
  dragOverClassId.value = null
  if (!props.editable) return
  let dragged = internal
  if (!dragged) {
    // 外部拖入 fallback（側欄待分班列）：dataTransfer 攜帶 student.id；
    // 未分班學生 planClassId 視為 null → 任何班皆非同班、必派發
    const raw = event.dataTransfer?.getData('text/plain')
    const id = raw != null && raw !== '' ? Number(raw) : NaN
    if (!Number.isInteger(id)) return
    dragged = { id, planClassId: null }
  }
  if (dragged.planClassId === targetClassId) return // 同班放回 no-op，免無意義 version bump
  emit('student-move', { studentIds: [dragged.id], op: 'assign', planClassId: targetClassId })
}

function onDragEnd(): void {
  draggingStudent.value = null
  dragOverClassId.value = null
}

// ── locate（供 Task 5 側欄跳轉聚焦）：捲動至目標並閃爍高亮；找不到回 false ──
const rootEl = ref<HTMLElement | null>(null)
const flashTimers = new Map<Element, number>()

function _flash(el: Element): void {
  el.classList.remove('flash-highlight')
  void (el as HTMLElement).offsetWidth // 強制 reflow 讓 animation 可重複觸發
  el.classList.add('flash-highlight')
  const prev = flashTimers.get(el)
  if (prev != null) window.clearTimeout(prev)
  flashTimers.set(el, window.setTimeout(() => {
    el.classList.remove('flash-highlight')
    flashTimers.delete(el)
  }, 1600))
}

function locateStudent(studentId: number): boolean {
  const el = rootEl.value?.querySelector(`.student-entry[data-student-id="${studentId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  _flash(el)
  return true
}

function locateClass(planClassId: number): boolean {
  const el = rootEl.value?.querySelector(`.class-name-cell[data-plan-class-id="${planClassId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  _flash(el)
  return true
}

defineExpose({ locateStudent, locateClass })
</script>

<style scoped>
.plan-roster-wrapper {
  --yp-h-grade: 34px;
  --yp-h-name: 40px;
  font-size: 14px;
  color: var(--text-primary);
}

.plan-roster-scroll {
  overflow: auto;
  /* 垂直捲動收在表格容器內，sticky 表頭對此容器生效（el-main 為外層捲動根，
     對 window/el-main sticky 需算 header 高度，內部容器最穩） */
  max-height: calc(100vh - 230px);
}

.plan-roster-table {
  border-collapse: separate;
  border-spacing: 0;
  white-space: nowrap;
  color: var(--text-primary);
}

.plan-roster-table td {
  border-right: 1px solid var(--neutral-300);
  border-bottom: 1px solid var(--neutral-300);
  padding: 5px 8px;
  text-align: center;
  vertical-align: top;
  background: var(--surface-color);
}

/* separate 模式補上外框左/上緣 */
.plan-roster-table thead tr:first-child td {
  border-top: 1px solid var(--neutral-300);
}

.plan-roster-table td:first-child {
  border-left: 1px solid var(--neutral-300);
}

/* ── sticky 表頭：年級/班名/人數三列凍結；三師列隨捲動離場 ── */
.plan-roster-table thead tr:nth-child(1) td {
  position: sticky;
  top: 0;
  height: var(--yp-h-grade);
  z-index: 3;
}

.plan-roster-table thead tr:nth-child(2) td {
  position: sticky;
  top: var(--yp-h-grade);
  height: var(--yp-h-name);
  z-index: 3;
}

.plan-roster-table thead tr:nth-child(3) td {
  position: sticky;
  top: calc(var(--yp-h-grade) + var(--yp-h-name));
  z-index: 3;
}

/* 左上交會格（前三列的 row-label / corner）同時 sticky 左+上，須壓過單向 sticky 格 */
.plan-roster-table thead tr:nth-child(-n + 3) td.row-label,
.plan-roster-table thead td.corner-cell {
  z-index: 4;
}

.corner-cell {
  border-right: none !important;
  border-top: none !important;
  border-left: none !important;
  background: transparent;
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

.student-entry {
  cursor: grab;
}

.student-entry[draggable="false"] {
  cursor: default;
}

.student-entry.dragging {
  opacity: 0.4;
}

.student-cell.drop-target-active,
.class-name-cell.drop-target-active {
  background: var(--color-primary-soft);
  outline: 2px dashed var(--color-primary);
  outline-offset: -2px;
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

@keyframes flash-highlight {
  0% {
    background: var(--color-primary-soft);
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}

.flash-highlight {
  animation: flash-highlight 1.6s ease-out;
}
</style>
