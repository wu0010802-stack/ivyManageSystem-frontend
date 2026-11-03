<script setup lang="ts">
/**
 * 「每日點名」主體：上方是全園各班點名進度（點班級即切換），下方直接是可編修的
 * 點名表（AttendanceBatchPanel）。
 *
 * 2026-11-03 起由側欄獨立頁 StudentRollcallView（/students/rollcall）承載，不再放在學生儀表板；
 * 班級篩選經 ACADEMIC_AFFAIRS_FILTERS_KEY 由頁面 provide。頁面自己有標題時傳 hide-header。
 *
 * 2026-11-02 改版：原本是唯讀表格＋「批次點名」抽屜，改一位學生要開抽屜、而且抽屜會被
 * 卡片的 hover 位移困在卡片框裡（見 main.css 容器卡註解）。改成就地編修後，抽屜與本元件
 * 自己那份 GET 一起拿掉，資料只由 AttendanceBatchPanel 載一次。
 *
 * 各班進度走 GET /student-attendance/overview（需全園 STUDENTS_READ）；只看得到自己班的
 * 帳號會 403，此時整條進度列不顯示，不影響下方點名表。
 */
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { getAttendanceOverview, type AttendanceOverviewClassroom } from '@/api/studentAttendance'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { normalizeSchoolYear } from '@/utils/academic'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { ATTENDANCE_EVENTS, domainBus } from '@/utils/domainBus'
import AttendanceBatchPanel from './AttendanceBatchPanel.vue'
import SectionCard from './SectionCard.vue'

const props = defineProps<{ attendanceDate?: string | null; hideHeader?: boolean }>()
const emit = defineEmits<{ 'update:attendanceDate': [v: string] }>()

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('AttendanceSection 須在 provide ACADEMIC_AFFAIRS_FILTERS_KEY 的頁面內使用（StudentRollcallView）')

const termStore = useAcademicTermStore()

const refDate = computed(() => props.attendanceDate === undefined ? ctx.endDate.value : props.attendanceDate)
const classroomId = computed(() => ctx.filters.classroomId as number | null)
const studentId = computed(() => (ctx.filters.studentId as number | null) ?? null)

const overview = ref<AttendanceOverviewClassroom[]>([])
let overviewSeq = 0

const fetchOverview = async () => {
  const seq = ++overviewSeq
  const date = refDate.value
  if (!date) {
    overview.value = []
    return
  }
  try {
    const res = await getAttendanceOverview({
      date,
      school_year: normalizeSchoolYear(termStore.school_year),
      semester: termStore.semester,
    })
    if (seq !== overviewSeq) return
    overview.value = res.data.classrooms ?? []
  } catch {
    // 進度列是輔助資訊：403（只能看自己班）或暫時失敗都只是不顯示，不擋下方點名表。
    if (seq === overviewSeq) overview.value = []
  }
}

const showProgress = computed(() => overview.value.length > 1)
const completeCount = computed(() => overview.value.filter(c => c.rollcall_status === 'complete').length)

const chipState = (c: AttendanceOverviewClassroom) => {
  if (c.rollcall_status === 'complete') return '完成'
  if (c.rollcall_status === 'unstarted') return '未點名'
  return `差 ${c.unmarked_count}`
}

const onAttendanceChanged = (payload: { date: unknown; classroom_id: unknown }) => {
  if (payload?.date === refDate.value) void fetchOverview()
}

/** 點名表「返回儲存」把班級切回原班：直接寫回班級，不走 setClassroom（它會順手清掉學生篩選）。 */
const onPanelClassroomUpdate = (id: number | string | null) => {
  ctx.filters.classroomId = id == null ? null : Number(id)
}

const onPanelDateUpdate = (date: string) => {
  emit('update:attendanceDate', date)
}

watch(refDate, () => { void fetchOverview() })

onMounted(() => {
  domainBus.on(ATTENDANCE_EVENTS.CHANGED, onAttendanceChanged)
  void fetchOverview()
})

onUnmounted(() => {
  overviewSeq += 1
  domainBus.off(ATTENDANCE_EVENTS.CHANGED, onAttendanceChanged)
})
</script>

<template>
  <SectionCard title="每日點名" :hide-header="props.hideHeader">
    <template #titleExtra v-if="refDate && !$slots['date-control']">{{ refDate }}</template>
    <template #actions>
      <slot name="date-control" />
    </template>
    <template #summary>
      <div v-if="showProgress" class="class-progress" role="group" aria-label="各班點名進度">
        <span class="class-progress__label">
          各班進度 <strong>{{ completeCount }}／{{ overview.length }}</strong> 班完成
        </span>
        <div class="class-progress__chips">
          <button
            v-for="c in overview"
            :key="c.classroom_id"
            type="button"
            class="class-chip"
            :class="[`is-${c.rollcall_status}`, { 'is-current': c.classroom_id === classroomId }]"
            :aria-pressed="c.classroom_id === classroomId"
            :aria-label="`${c.classroom_name}：${chipState(c)}`"
            @click="ctx.setClassroom(c.classroom_id)"
          >
            <span class="class-chip__name">{{ c.classroom_name }}</span>
            <span class="class-chip__state">{{ chipState(c) }}</span>
          </button>
        </div>
      </div>
    </template>

    <AttendanceBatchPanel
      v-if="refDate"
      :classroom-id="classroomId"
      :date="refDate"
      :student-id="studentId"
      hide-classroom-select
      hide-date-picker
      @update:classroom-id="onPanelClassroomUpdate"
      @update:date="onPanelDateUpdate"
    />
    <p v-else class="attendance-no-date">請先選擇點名日期</p>
  </SectionCard>
</template>

<style scoped>
.class-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-color);
}

.class-progress__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.class-progress__label strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.class-progress__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.class-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-color);
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.class-chip:hover {
  border-color: var(--color-primary);
}

.class-chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.class-chip__state {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.class-chip.is-complete .class-chip__state { color: var(--color-success-darker); }
.class-chip.is-partial .class-chip__state { color: var(--color-warning-darker); }
.class-chip.is-unstarted .class-chip__state { color: var(--text-secondary); }

.class-chip.is-current {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
  font-weight: var(--font-weight-semibold);
}

.attendance-no-date {
  margin: 0;
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-tertiary);
}

.section-card :deep(.section-head),
.section-card :deep(.section-actions) {
  flex-wrap: wrap;
}
.section-card :deep(.section-actions) {
  justify-content: flex-end;
  row-gap: var(--space-2);
}

@media (pointer: coarse) {
  .class-chip {
    min-height: var(--touch-target-min);
  }
}

@media (--to-sm) {
  .section-card :deep(.section-actions) {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
