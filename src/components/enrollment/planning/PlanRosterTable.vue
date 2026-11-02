<template>
  <div ref="rootEl" class="plan-roster-wrapper">
    <!-- max-height 由 remeasure() 依表格實際位置算到視窗底（不再用寫死的留白） -->
    <div ref="scrollEl" class="plan-roster-scroll" :style="scrollMaxHeight ? { maxHeight: scrollMaxHeight } : undefined">
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
              <div class="class-name-line">
                <el-checkbox
                  v-if="editable && viewMode === 'students' && classStudents(cls.id).length"
                  class="class-select-all"
                  :aria-label="`勾選${cls.target_name}全班`"
                  :model-value="classAllSelected(cls.id)"
                  :indeterminate="classSomeSelected(cls.id) && !classAllSelected(cls.id)"
                  @change="(val: string | number | boolean) => emit('set-selected', classStudents(cls.id).map(st => st.id), Boolean(val))"
                />
                <span class="class-name-text">{{ cls.target_name }}</span>
              </div>
              <div class="class-meta-line">
                <span v-if="cls.class_code" class="class-code">{{ cls.class_code }}</span>
                <el-button
                  v-if="editable"
                  :icon="Edit"
                  link
                  class="class-edit-btn"
                  title="編輯班級"
                  :aria-label="`編輯${cls.target_name}`"
                  @click="emit('class-edit', cls.id)"
                />
              </div>
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
              <!-- 男女比：性別未知與已離園不計；整班都不知道就不顯示 -->
              <span v-if="genderSplit(cls.id)" class="gender-split">{{ genderSplit(cls.id) }}</span>
            </td>
          </tr>
          <!-- 三師：只在「老師指派」檢視出現。格內直接選老師（取代逐班開對話框）；
               未指派時直接顯示原班老師 -->
          <tr v-for="role in visibleTeacherRoles" :key="role">
            <td class="row-label teacher-label">{{ TEACHER_ROLE_LABELS[role] }}</td>
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="teacher-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <PlanTeacherCell
                :role="role"
                :class-name="cls.target_name"
                :teacher-id="cls[TEACHER_FIELD_BY_ROLE[role]] ?? null"
                :teacher-name="teacherNameOf(cls, role)"
                :source-teacher-name="sourceTeacherName(cls, role)"
                :editable="editable"
                :disabled="busy"
                :option-groups="teacherOptionsByCell.get(`${cls.id}:${role}`) ?? []"
                :error="cellErrors[`${cls.id}:${role}`] ?? null"
                @change="(id: number | null) => emit('teacher-change', cls.id, TEACHER_FIELD_BY_ROLE[role], id)"
                @open="emit('teacher-cell-open')"
              />
            </td>
          </tr>
        </thead>

        <tbody v-if="viewMode === 'students'">
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
                  :draggable="editable && !busy"
                  :title="studentTitle(student)"
                  :class="{
                    dragging: draggingStudent?.id === student.id,
                    'is-left': student.is_active_now === false,
                    'is-match': matchIds?.has(student.id) ?? false,
                    'is-current-match': currentMatchId === student.id,
                    'is-dimmed': matchIds != null && !matchIds.has(student.id),
                  }"
                  @dragstart="onDragStart(student, $event)"
                  @dragend="onDragEnd"
                >
                  <!-- 姓名放進 el-checkbox 自己的 label（點姓名也能勾），外層不再包 <label>：
                       巢狀 label 會讓點擊與讀屏行為不確定 -->
                  <div class="student-line">
                    <el-checkbox
                      v-if="editable"
                      class="student-checkbox"
                      :aria-label="student.name"
                      :model-value="props.selectedIds.has(student.id)"
                      @change="(val: string | number | boolean) => emit('set-selected', [student.id], Boolean(val))"
                    >{{ student.name }}</el-checkbox>
                    <span v-else class="student-name">{{ student.name }}</span>
                    <span
                      v-if="student.is_active_now === false"
                      class="disposition-tag disposition-tag-left"
                      title="已離園，不計入人數，重新產生建議時會移除"
                    >離</span>
                    <span
                      v-if="dispositionTag(student)"
                      class="disposition-tag"
                      :class="`disposition-tag-${student.disposition}`"
                    >{{ dispositionTag(student) }}</span>
                    <span
                      v-if="student.manually_adjusted"
                      class="manual-mark"
                      role="img"
                      title="手動調整過"
                      aria-label="手動調整過"
                    />
                  </div>
                  <!-- 同班升上來的不重複寫原班；只標出從別班搬進來的（「原」＝原班，箭頭會被讀成要搬去哪） -->
                  <div v-if="isMovedIn(student, cls)" class="student-moved">原 {{ student.source_classroom_name }}</div>
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
              已分班 {{ grandTotal }} 人・待分班 {{ unassignedCount }} 人
              <span class="grand-total-note">（另有畢業 {{ graduateCount }}、排除 {{ excludeCount }}，不在表內）</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { Edit } from '@element-plus/icons-vue'
import type { Schema } from '@/api/_generated/typed'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import type { TeacherOptionLike } from '@/utils/teacherOption'
import PlanTeacherCell from './PlanTeacherCell.vue'
import {
  TEACHER_FIELD_BY_ROLE,
  TEACHER_ROLES,
  TEACHER_ROLE_LABELS,
  buildTeacherOptionGroups,
  currentTeacherOnlyGroups,
  groupClassesByGrade,
  isMovedIn,
  orderedRosterEntries,
  sourceTeacherName,
  type GradeGroup,
  type RosterViewMode,
  type TeacherOptionGroup,
  type TeacherField,
  type TeacherRole,
} from './planHelpers'

type PlanDetail = Schema<'PlanDetailOut'>
type PlanClass = Schema<'PlanClassOut'>
type PlanStudent = Schema<'PlanStudentOut'>

const props = withDefaults(defineProps<{
  plan: PlanDetail
  editable: boolean
  selectedIds: Set<number>
  /** 老師下拉的全部人選（GET /classrooms/teacher-options），唯讀時可不給 */
  teacherOptions?: TeacherOptionLike[]
  /** 父層 mutation in-flight：鎖住老師格觸發點 */
  busy?: boolean
  /** 學生名單（班名、人數＋學生列）／老師指派（班名、人數＋三列老師） */
  viewMode?: RosterViewMode
  /** 搜尋／篩選符合的學生：符合者高亮、其餘淡化；null＝沒有在搜尋 */
  matchIds?: ReadonlySet<number> | null
  /** 搜尋目前停在哪一位（Enter 換下一位） */
  currentMatchId?: number | null
  /** 老師格存檔失敗的原因，key＝`班級id:職務`（後端 detail.field 對到格子） */
  cellErrors?: Record<string, string>
}>(), {
  teacherOptions: () => [],
  busy: false,
  viewMode: 'students',
  matchIds: null,
  currentMatchId: null,
  cellErrors: () => ({}),
})

const emit = defineEmits<{
  'set-selected': [ids: number[], checked: boolean]
  'class-edit': [planClassId: number]
  // 對齊後端 BulkStudentsRequest 語意（批次 student_ids＋op＋plan_class_id）；拖曳搬班
  // 尚未接線（brief 明示 checkbox 批次優先，拖曳延後），單人移動＝ids 長度 1。
  'student-move': [payload: { studentIds: number[]; op: BulkOp; planClassId?: number | null; excludeReason?: string | null }]
  'teacher-change': [planClassId: number, field: TeacherField, teacherId: number | null]
  /** 老師格展開（父層在老師名單沒載到時重試） */
  'teacher-cell-open': []
}>()

// ── 年級分組（依 target_grade_id 首次出現順序分組，容忍後端非嚴格連續排序）──
const gradeGroups = computed<GradeGroup[]>(() => groupClassesByGrade(props.plan.classes))

const visibleTeacherRoles = computed(() => (props.viewMode === 'teachers' ? TEACHER_ROLES : []))

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

function teacherNameOf(cls: PlanClass, role: TeacherRole): string | null {
  if (role === 'head') return cls.head_teacher_name ?? null
  if (role === 'assistant') return cls.assistant_teacher_name ?? null
  return cls.art_teacher_name ?? null
}

// 每格下拉選項（分組＋「已是某班班導」停用註記）；只在可編輯時計算。老師名單沒載到
// （載入失敗）時只放目前指派的老師，下拉才不會把現值顯示成原始 id
const teacherOptionsByCell = computed(() => {
  const map = new Map<string, TeacherOptionGroup[]>()
  if (!props.editable) return map
  const loaded = props.teacherOptions.length > 0
  for (const cls of props.plan.classes) {
    for (const role of TEACHER_ROLES) {
      map.set(`${cls.id}:${role}`, loaded
        ? buildTeacherOptionGroups(props.teacherOptions, props.plan.classes, cls.id, role)
        : currentTeacherOnlyGroups(props.plan.classes, cls.id, role))
    }
  }
  return map
})

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

function classStudents(classId: number): PlanStudent[] {
  return studentsByClass.value.get(classId) ?? []
}

/** 「男 x・女 y」：只算在籍且性別已知的學生；都不知道回 null（不顯示）。 */
function genderSplit(classId: number): string | null {
  let male = 0
  let female = 0
  for (const st of classStudents(classId)) {
    if (st.is_active_now === false) continue
    if (st.gender === '男') male += 1
    else if (st.gender === '女') female += 1
  }
  return male + female > 0 ? `男 ${male}・女 ${female}` : null
}

function classAllSelected(classId: number): boolean {
  const list = classStudents(classId)
  return list.length > 0 && list.every(st => props.selectedIds.has(st.id))
}

function classSomeSelected(classId: number): boolean {
  return classStudents(classId).some(st => props.selectedIds.has(st.id))
}

const unassignedCount = computed(() =>
  props.plan.students.filter(
    st => (st.disposition === 'promote' || st.disposition === 'retain') && st.plan_class_id == null,
  ).length,
)
const graduateCount = computed(() => props.plan.students.filter(st => st.disposition === 'graduate').length)
const excludeCount = computed(() => props.plan.students.filter(st => st.disposition === 'exclude').length)

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

/** hover 提示：學號＋原班（同名學生靠這個分辨） */
function studentTitle(student: PlanStudent): string {
  const parts: string[] = []
  if (student.student_id) parts.push(student.student_id)
  if (student.source_classroom_name) parts.push(`原 ${student.source_classroom_name}`)
  return parts.join('・')
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
  if (!props.editable || props.busy) return
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
  emit('student-move', { studentIds: [dragged.id], op: moveOpFor(dragged.id), planClassId: targetClassId })
}

// 留級生換班要維持 retain（assign 會把 disposition 改回 promote、丟掉留級標記；
// 大班留級生還會因此被 7/31 自動畢業）。年級不符時後端回 422，由父層 toast。
function moveOpFor(studentId: number): BulkOp {
  return props.plan.students.find(st => st.id === studentId)?.disposition === 'retain' ? 'retain' : 'assign'
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

/** 只捲動不閃爍（搜尋「下一位」用；目前這位的樣式由 currentMatchId 負責）。 */
function scrollToStudent(studentId: number): boolean {
  const el = rootEl.value?.querySelector(`.student-entry[data-student-id="${studentId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  return true
}

/**
 * 搬班／復原成功後：被動到的學生都閃一下，並捲到表格順序（欄序）的第一位。
 * DOM 是逐列排的，不能直接取 querySelectorAll 的第一個。
 */
function flashStudents(studentIds: number[]): boolean {
  const wanted = new Set(studentIds)
  const els = new Map<number, Element>()
  for (const el of rootEl.value?.querySelectorAll('.student-entry') ?? []) {
    const id = Number((el as HTMLElement).dataset.studentId)
    if (wanted.has(id)) els.set(id, el)
  }
  if (els.size === 0) return false
  const first = orderedRosterEntries(props.plan.students, props.plan.classes)
    .map(entry => els.get(entry.student.id))
    .find((el): el is Element => el != null)
  first?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  for (const el of els.values()) _flash(el)
  return true
}

function locateClass(planClassId: number): boolean {
  const el = rootEl.value?.querySelector(`.class-name-cell[data-plan-class-id="${planClassId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  _flash(el)
  return true
}

// ── 捲動區高度：表格頂端到捲動容器（後台為 el-main）底部，扣掉 --yp-bottom-gap
// （＝內容區底部留白 token）。表格上方的進度列、橫幅、批次列高度會變，父層在
// 這些變動後呼叫 remeasure()；本元件自己處理掛載、視窗縮放與檢視切換。
const scrollEl = ref<HTMLElement | null>(null)
const scrollMaxHeight = ref<string | null>(null)
// 視窗很矮時至少保留幾列可捲，不讓表格被壓扁
const MIN_SCROLL_HEIGHT_PX = 320

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

function remeasure(): void {
  const el = scrollEl.value
  if (!el) return
  const parent = findScrollParent(el)
  // 換算成「頁面捲到最上面時」的位置，頁面已往下捲也算得對
  const staticTop = el.getBoundingClientRect().top + (parent ? parent.scrollTop : window.scrollY)
  const bottom = parent ? parent.getBoundingClientRect().bottom : window.innerHeight
  const gap = parseFloat(getComputedStyle(el).getPropertyValue('--yp-bottom-gap')) || 0
  scrollMaxHeight.value = `${Math.max(MIN_SCROLL_HEIGHT_PX, Math.round(bottom - staticTop - gap))}px`
}

function onWindowResize(): void {
  remeasure()
}

onMounted(() => {
  remeasure()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
})

watch(() => props.viewMode, () => {
  void nextTick(remeasure)
})

defineExpose({ locateStudent, locateClass, flashStudents, scrollToStudent, remeasure })
</script>

<style scoped>
.plan-roster-wrapper {
  --yp-h-grade: 34px;
  --yp-h-name: 50px;
  /* 表格底到視窗底的留白＝後台內容區底部 padding（.content-container 用 --space-8） */
  --yp-bottom-gap: var(--space-8);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.plan-roster-scroll {
  overflow: auto;
  /* 垂直捲動收在表格容器內，sticky 表頭對此容器生效（el-main 為外層捲動根，
     對 window/el-main sticky 需算 header 高度，內部容器最穩）。max-height 由
     remeasure() 寫在 inline style；--yp-bottom-gap 由外層繼承 */
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
  padding: var(--space-1) 6px;
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

/* .plan-roster-table 前綴：提高 specificity 至 (0,2,0)，勝過通用
   `.plan-roster-table td`（0,1,1），避免其 background 蓋掉這裡的底色 */
.plan-roster-table .corner-cell {
  position: sticky;
  left: 0;
  border-right: none !important;
  border-top: none !important;
  border-left: none !important;
  background: var(--color-neutral-100);
}

.plan-roster-table .grade-group-cell {
  font-weight: 700;
  background: var(--color-neutral-100);
  border-right: 2px solid var(--neutral-600) !important;
}

.plan-roster-table .row-label {
  position: sticky;
  left: 0;
  z-index: 2;
  font-weight: 600;
  background: var(--color-neutral-100);
  border-right: 2px solid var(--neutral-600) !important;
  white-space: nowrap;
}

.class-name-cell {
  font-weight: var(--font-weight-semibold);
}

.class-name-line,
.class-meta-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
}

.class-meta-line {
  min-height: 18px;
}

.class-edit-btn {
  height: auto;
  padding: 0;
}

.capacity-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-full, 9999px);
  font-weight: 600;
  background: var(--color-neutral-100);
}

.capacity-badge.over-capacity {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.plan-roster-table .teacher-cell {
  font-size: var(--text-sm);
  padding: 2px;
}

.plan-roster-table .seq-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--color-neutral-100);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  border-right: 2px solid var(--neutral-600) !important;
}

/* 欄寬收斂：1440 寬桌機在側欄 320px 旁仍能一次看到 8 個班 */
.student-cell {
  min-width: 84px;
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

/* 搜尋／篩選：符合者底色標出、目前這位加外框；不符合的淡化但仍可操作 */
.student-entry.is-match {
  border-radius: var(--radius-sm);
  background: var(--color-warning-soft);
}

.student-entry.is-current-match {
  border-radius: var(--radius-sm);
  outline: 2px solid var(--color-warning);
  outline-offset: -1px;
}

.student-entry.is-dimmed {
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
  gap: var(--space-1);
}

/* 姓名是 el-checkbox 的 label：縮小預設 8px 間距、沿用表格字級 */
.student-checkbox :deep(.el-checkbox__label) {
  padding-left: var(--space-1);
  font-size: inherit;
}

.student-moved {
  font-size: var(--text-xs);
  color: var(--color-info-hover);
}

.manual-mark {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-info);
}

.class-select-all {
  height: auto;
}

/* 觸控（平板）：整班勾選與班級編輯鈕的點擊區至少 32px */
@media (pointer: coarse) {
  .class-select-all,
  .class-edit-btn {
    min-width: 32px;
    min-height: 32px;
  }
}

.class-code {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-regular);
  color: var(--text-secondary);
}

.grand-total-note {
  font-weight: var(--font-weight-regular);
  color: var(--text-secondary);
}

.disposition-tag {
  font-size: var(--text-xs);
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

.disposition-tag-left {
  color: var(--text-secondary);
  background: var(--color-neutral-200);
}

.student-entry.is-left {
  opacity: 0.55;
}

.gender-split {
  display: block;
  margin-top: 2px;
  font-size: var(--text-xs);
  font-weight: var(--font-weight-regular);
  color: var(--text-secondary);
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

.plan-roster-table .grade-total-cell {
  background: var(--color-neutral-100);
  font-weight: 700;
  font-size: var(--text-sm);
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
