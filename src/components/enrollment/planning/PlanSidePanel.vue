<template>
  <aside ref="rootEl" class="plan-side-panel">
    <section class="panel-section">
      <PlanIssuesSummary :issues="plan.issues" @locate-issue="issue => emit('locate-issue', issue)" />
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
            :model-value="selectedIds.has(s.id)"
            @change="(val: string | number | boolean) => emit('set-selected', [s.id], Boolean(val))"
          />
          <span class="student-name">{{ s.name }}</span>
          <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
        </li>
      </ul>
    </section>

    <el-collapse v-model="openSections" class="buckets-collapse">
      <el-collapse-item name="graduate" class="graduate-bucket" :title="`畢業名單（${graduateStudents.length}）`">
        <ul class="bucket-list">
          <li v-for="s in graduateStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
          </li>
        </ul>
      </el-collapse-item>
      <el-collapse-item name="exclude" class="exclude-bucket" :title="`排除名單（${excludeStudents.length}）`">
        <ul class="bucket-list">
          <li v-for="s in excludeStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
            <span v-if="s.exclude_reason" class="exclude-reason">（{{ s.exclude_reason }}）</span>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Schema } from '@/api/_generated/typed'
import PlanIssuesSummary from './PlanIssuesSummary.vue'

// 工作台右側欄：問題聚合摘要 + 待分班操作區 + 畢業/排除唯讀名單。
// selection 受控（selectedIds 由父層持有），勾選僅 emit set-selected，父層合併後
// 供 PlanBatchToolbar 批次派發——與 PlanRosterTable 的勾選共用同一集合。

type PlanDetail = Schema<'PlanDetailOut'>
type PlanStudent = Schema<'PlanStudentOut'>
type IssueOut = Schema<'IssueOut'>

const props = defineProps<{
  plan: PlanDetail
  editable: boolean
  selectedIds: Set<number>
}>()

const emit = defineEmits<{
  'locate-issue': [issue: IssueOut]
  'set-selected': [ids: number[], checked: boolean]
}>()

const unassignedStudents = computed(() =>
  props.plan.students.filter(
    s => (s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id == null,
  ),
)
const graduateStudents = computed(() => props.plan.students.filter(s => s.disposition === 'graduate'))
const excludeStudents = computed(() => props.plan.students.filter(s => s.disposition === 'exclude'))

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

// ── locate：issue 點擊定位未分班學生。目標可能被搜尋 filter 隱藏，先清空搜尋。
const rootEl = ref<HTMLElement | null>(null)
let flashTimer: number | null = null

async function locateStudent(studentId: number): Promise<boolean> {
  if (!unassignedStudents.value.some(s => s.id === studentId)) return false
  searchQuery.value = ''
  await nextTick()
  // 以 rootEl 範圍查詢（勿用 document.querySelector——test-utils mount 預設不掛
  // document，且 root 範圍天然避免與其他實例互撞）
  const el = rootEl.value?.querySelector(`.unassigned-row[data-student-id="${studentId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('flash-highlight')
  void (el as HTMLElement).offsetWidth // 強制 reflow 讓 animation 可重複觸發
  el.classList.add('flash-highlight')
  if (flashTimer != null) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => el.classList.remove('flash-highlight'), 1600)
  return true
}

defineExpose({ locateStudent })

// 畢業/排除預設收合（雜亂主因之一是預設全開的長名單）
const openSections = ref<string[]>([])
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
  gap: 6px;
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

.bucket-list li {
  display: flex;
  align-items: center;
  gap: 6px;
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
