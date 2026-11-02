<template>
  <aside ref="rootEl" class="plan-side-panel">
    <section class="panel-section">
      <!-- 已套用：沒有問題要處理了，改看套用結果（沒照計畫走的人） -->
      <PlanAppliedResult
        v-if="plan.status === 'applied' && plan.applied_summary"
        :summary="plan.applied_summary"
        :applied-at="plan.applied_at ?? null"
      />
      <PlanIssuesSummary
        v-else
        :issues="plan.issues"
        :context="plan.status === 'published' ? 'published' : 'draft'"
        @locate-issue="issue => emit('locate-issue', issue)"
      />
    </section>

    <!-- 待分班（promote/retain 但無 plan_class_id）：正常流程不應出現，防呆顯示並
         提供勾選/拖曳讓使用者能直接處理（舊版只有唯讀名單，未分班學生無法批次分派） -->
    <section v-if="unassignedStudents.length" class="panel-section unassigned-section">
      <div class="section-header">
        <el-checkbox
          v-if="editable"
          class="select-all-checkbox"
          :model-value="allVisibleSelected"
          :indeterminate="someVisibleSelected && !allVisibleSelected"
          @change="(val: string | number | boolean) => onSelectAllVisible(Boolean(val))"
        />
        <span class="section-title">待分班</span>
        <span class="section-count">{{ unassignedStudents.length }}</span>
      </div>
      <el-input
        v-model="searchQuery"
        class="unassigned-search"
        placeholder="搜尋姓名"
        size="small"
        clearable
      />
      <ul class="unassigned-list">
        <li
          v-for="s in visibleUnassigned"
          :key="s.id"
          class="unassigned-row"
          :data-student-id="s.id"
          :draggable="editable"
          @dragstart="onDragStart(s, $event)"
        >
          <el-checkbox
            v-if="editable"
            :aria-label="s.name"
            :model-value="selectedIds.has(s.id)"
            @change="(val: string | number | boolean) => emit('set-selected', [s.id], Boolean(val))"
          />
          <span class="student-name">{{ s.name }}</span>
          <!-- 「原」＝原班；只寫班名會被讀成建議要分去的班 -->
          <span v-if="s.source_classroom_name" class="student-source">原 {{ s.source_classroom_name }}</span>
          <!-- 就地分班：不必勾選後再回表格上方的批次列（窄幕抽屜裡看不到批次列） -->
          <el-select
            v-if="editable"
            class="row-assign"
            size="small"
            :model-value="null"
            :placeholder="assignGroupsById.get(s.id)?.length ? '分到…' : '沒有可分的班'"
            :aria-label="`把${s.name}分到班級`"
            :disabled="busy || !assignGroupsById.get(s.id)?.length"
            @change="(id: number) => onAssignRow(s, id)"
          >
            <el-option-group
              v-for="group in assignGroupsById.get(s.id) ?? []"
              :key="group.gradeName"
              :label="group.gradeName"
            >
              <el-option v-for="opt in group.options" :key="opt.id" :label="opt.label" :value="opt.id" />
            </el-option-group>
          </el-select>
        </li>
      </ul>
    </section>

    <!-- 畢業／排除名單可勾選：大班留級（勾畢業生→標記留級）與取消排除（勾排除生→
         還原建議／移至班級）唯一的入口；預設收合避免長名單撐高側欄 -->
    <el-collapse v-model="openSections" class="buckets-collapse">
      <el-collapse-item
        v-for="bucket in buckets"
        :key="bucket.key"
        :name="bucket.key"
        :class="`${bucket.key}-bucket`"
      >
        <template #title>
          <span class="bucket-title">
            <!-- 收合時不給全選：一勾就選滿幾十個看不到的人 -->
            <el-checkbox
              v-if="editable && bucket.students.length && openSections.includes(bucket.key)"
              class="bucket-select-all"
              :aria-label="`全選${bucket.label}`"
              :model-value="bucketAllSelected(bucket.students)"
              :indeterminate="bucketSomeSelected(bucket.students) && !bucketAllSelected(bucket.students)"
              @click.stop
              @change="(val: string | number | boolean) => emit('set-selected', bucket.students.map(s => s.id), Boolean(val))"
            />
            <span>{{ bucket.label }}（{{ bucket.students.length }}）</span>
          </span>
        </template>
        <ul class="bucket-list">
          <li v-for="s in bucket.students" :key="s.id" class="bucket-row" :data-student-id="s.id">
            <el-checkbox
              v-if="editable"
              :aria-label="s.name"
              :model-value="selectedIds.has(s.id)"
              @change="(val: string | number | boolean) => emit('set-selected', [s.id], Boolean(val))"
            />
            <span class="student-name">{{ s.name }}</span>
            <span v-if="s.source_classroom_name" class="student-source">原 {{ s.source_classroom_name }}</span>
            <span v-if="s.exclude_reason" class="exclude-reason">（{{ s.exclude_reason }}）</span>
          </li>
        </ul>
        <p v-if="editable && bucket.students.length" class="bucket-hint">{{ bucket.hint }}</p>
      </el-collapse-item>
    </el-collapse>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Schema } from '@/api/_generated/typed'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'
import PlanIssuesSummary from './PlanIssuesSummary.vue'
import PlanAppliedResult from './PlanAppliedResult.vue'
import { buildAssignGroups } from './planHelpers'

// 工作台右側欄：問題聚合摘要 + 待分班操作區 + 畢業/排除唯讀名單。
// selection 受控（selectedIds 由父層持有），勾選僅 emit set-selected，父層合併後
// 供 PlanBatchToolbar 批次派發——與 PlanRosterTable 的勾選共用同一集合。

type PlanDetail = Schema<'PlanDetailOut'>
type PlanStudent = Schema<'PlanStudentOut'>
type IssueOut = Schema<'IssueOut'>

const props = withDefaults(defineProps<{
  plan: PlanDetail
  editable: boolean
  selectedIds: Set<number>
  /** 父層 mutation in-flight：鎖住就地分班下拉 */
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  'locate-issue': [issue: IssueOut]
  'set-selected': [ids: number[], checked: boolean]
  // 待分班列就地分班；留級生送 retain（assign 會把留級改回一般升班）
  'assign-student': [payload: { studentId: number; op: BulkOp; planClassId: number }]
}>()

const unassignedStudents = computed(() =>
  props.plan.students.filter(
    s => (s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id == null,
  ),
)
const assignGroupsById = computed(
  () => new Map(unassignedStudents.value.map(s => [s.id, buildAssignGroups(s, props.plan.classes)])),
)

function onAssignRow(student: PlanStudent, planClassId: number): void {
  if (planClassId == null) return
  emit('assign-student', {
    studentId: student.id,
    op: student.disposition === 'retain' ? 'retain' : 'assign',
    planClassId,
  })
}

const graduateStudents = computed(() => props.plan.students.filter(s => s.disposition === 'graduate'))
const excludeStudents = computed(() => props.plan.students.filter(s => s.disposition === 'exclude'))

const buckets = computed(() => [
  {
    key: 'graduate',
    label: '畢業名單',
    students: graduateStudents.value,
    hint: '要續讀的大班生：勾選後用「標記留級」放進大班。',
  },
  {
    key: 'exclude',
    label: '排除名單',
    students: excludeStudents.value,
    hint: '勾選後用「還原建議」或「移至班級」放回編班。',
  },
])

// 畢業/排除預設收合（雜亂主因之一是預設全開的長名單）
const openSections = ref<string[]>([])

function bucketAllSelected(students: PlanStudent[]): boolean {
  return students.length > 0 && students.every(s => props.selectedIds.has(s.id))
}

function bucketSomeSelected(students: PlanStudent[]): boolean {
  return students.some(s => props.selectedIds.has(s.id))
}

// ── 搜尋 + 全選（全選只作用於 filter 後可見集合，避免誤選看不到的人）──
const searchQuery = ref('')

const visibleUnassigned = computed(() => {
  const q = searchQuery.value.trim()
  if (!q) return unassignedStudents.value
  return unassignedStudents.value.filter(s => s.name.includes(q))
})

const allVisibleSelected = computed(
  () =>
    visibleUnassigned.value.length > 0 &&
    visibleUnassigned.value.every(s => props.selectedIds.has(s.id)),
)
const someVisibleSelected = computed(() =>
  visibleUnassigned.value.some(s => props.selectedIds.has(s.id)),
)

function onSelectAllVisible(checked: boolean): void {
  emit('set-selected', visibleUnassigned.value.map(s => s.id), checked)
}

// ── 拖曳來源：dataTransfer 攜帶 student.id，表格 onDrop 的外部 fallback 讀取。
// 側欄自身不是拖放目標（維持 drag-move spec 決策 2）。
function onDragStart(student: PlanStudent, event: DragEvent): void {
  if (!props.editable) return
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(student.id))
  }
}

// ── locate：issue 點擊定位學生。待分班可能被搜尋 filter 隱藏 → 先清空搜尋；
// 畢業／排除名單預設收合 → 先展開該名單再定位。不在草稿的學生回 false（父層提示）。
const rootEl = ref<HTMLElement | null>(null)
let flashTimer: number | null = null
// el-collapse 展開動畫約 300ms：動畫期間容器高度還沒撐開，等它結束再對準一次
const COLLAPSE_SETTLE_MS = 320

function scrollAndFlash(el: Element | null | undefined, afterExpand: boolean): boolean {
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  if (afterExpand) {
    window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), COLLAPSE_SETTLE_MS)
  }
  el.classList.remove('flash-highlight')
  void (el as HTMLElement).offsetWidth // 強制 reflow 讓 animation 可重複觸發
  el.classList.add('flash-highlight')
  if (flashTimer != null) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => el.classList.remove('flash-highlight'), 1600)
  return true
}

async function locateStudent(studentId: number): Promise<boolean> {
  // 以 rootEl 範圍查詢（勿用 document.querySelector——test-utils mount 預設不掛
  // document，且 root 範圍天然避免與其他實例互撞）
  if (unassignedStudents.value.some(s => s.id === studentId)) {
    searchQuery.value = ''
    await nextTick()
    return scrollAndFlash(rootEl.value?.querySelector(`.unassigned-row[data-student-id="${studentId}"]`), false)
  }
  const bucket = buckets.value.find(b => b.students.some(s => s.id === studentId))
  if (!bucket) return false
  const wasOpen = openSections.value.includes(bucket.key)
  if (!wasOpen) openSections.value = [...openSections.value, bucket.key]
  await nextTick()
  return scrollAndFlash(rootEl.value?.querySelector(`.bucket-row[data-student-id="${studentId}"]`), !wasOpen)
}

defineExpose({ locateStudent })

</script>

<style scoped>
.plan-side-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  font-size: var(--text-sm);
}

.panel-section {
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--surface-color);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.unassigned-search {
  margin-bottom: var(--space-2);
}

.unassigned-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 40vh;
  overflow-y: auto;
}

.unassigned-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  cursor: grab;
}

.unassigned-row[draggable='false'] {
  cursor: default;
}

.unassigned-row:hover {
  background: var(--neutral-100);
}

.student-name {
  font-weight: 500;
}

.row-assign {
  flex: none;
  width: 7.5rem;
  margin-left: auto;
}

.student-source,
.exclude-reason {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.bucket-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 40vh;
  overflow-y: auto;
}

/* 畢業／排除名單與上方兩段同樣是有框的區塊（原本貼邊無框，看起來像另一種元件） */
.buckets-collapse {
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  padding: 0 var(--space-3);
  background: var(--surface-color);
}

.buckets-collapse :deep(.el-collapse-item:last-child .el-collapse-item__header),
.buckets-collapse :deep(.el-collapse-item:last-child .el-collapse-item__wrap) {
  border-bottom: none;
}

.bucket-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.bucket-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: var(--font-weight-semibold);
}

.bucket-hint {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

@keyframes flash-highlight {
  0% {
    background: var(--color-primary-soft);
  }
  100% {
    background: transparent;
  }
}

:deep(.flash-highlight),
.flash-highlight {
  animation: flash-highlight 1.6s ease-out;
}
</style>
