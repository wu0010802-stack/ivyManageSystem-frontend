<script setup lang="ts">
/**
 * 教師端學生請假總覽（純檢視）。
 *
 * 家長端提交即自動成立（無審核流程），此頁供教師掌握班上請假狀況，
 * 不提供任何操作；資料走 GET /portal/student-leaves（後端已限縮任教班級、
 * 僅回 approved，預設視窗過去 7 天～未來 14 天）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { House } from '@element-plus/icons-vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'

import { getMyStudents } from '@/api/portal'
import { listPortalStudentLeaves } from '@/api/portalStudentLeaves'
import { apiError } from '@/utils/error'

interface LeaveItem {
  id: number
  student_id: number
  student_name: string | null
  classroom_id: number | null
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
  status: string
  created_at: string | null
}

interface ClassroomOption {
  classroom_id: number
  classroom_name: string
}

const LEAVE_TYPES = ['病假', '事假']

const items = ref<LeaveItem[]>([])
const loading = ref(false)
const errorMessage = ref('')
const classrooms = ref<ClassroomOption[]>([])

type RangeKey = 'default' | 'today' | 'custom'
const rangeKey = ref<RangeKey>('default')
const customStart = ref('')
const customEnd = ref('')
const classroomId = ref<number | null>(null)
const typeFilter = ref('')

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => fmtDate(new Date())

const buildParams = () => {
  const params: { classroom_id?: number; start_date?: string; end_date?: string } = {}
  if (classroomId.value != null) params.classroom_id = classroomId.value
  if (rangeKey.value === 'today') {
    params.start_date = todayStr()
    params.end_date = todayStr()
  } else if (rangeKey.value === 'custom' && customStart.value && customEnd.value) {
    params.start_date = customStart.value
    params.end_date = customEnd.value
  }
  return params
}

const load = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await listPortalStudentLeaves(buildParams())
    items.value = (res.data?.items ?? []) as unknown as LeaveItem[]
  } catch (error) {
    items.value = []
    errorMessage.value = apiError(error, '載入失敗')
  } finally {
    loading.value = false
  }
}

const loadClassrooms = async () => {
  // 班級名稱只是輔助顯示，失敗不影響請假清單本身
  try {
    const res = await getMyStudents()
    classrooms.value = (res.data?.classrooms ?? []).map((c) => ({
      classroom_id: c.classroom_id,
      classroom_name: c.classroom_name,
    }))
  } catch {
    classrooms.value = []
  }
}

const setRange = (key: Exclude<RangeKey, 'custom'>) => {
  rangeKey.value = key
  customStart.value = ''
  customEnd.value = ''
  load()
}

watch([customStart, customEnd], ([start, end]) => {
  if (start && end) {
    rangeKey.value = 'custom'
    load()
  }
})

const setClassroom = (id: number | null) => {
  classroomId.value = id
  load()
}

const classroomName = (id: number | null) =>
  classrooms.value.find((c) => c.classroom_id === id)?.classroom_name ?? ''

// 「今日區塊」只有在目前查詢範圍涵蓋今天時才有意義（自訂未來區間時隱藏，
// 避免以載入外的資料誤稱「今天沒人請假」）
const rangeCoversToday = computed(() => {
  if (rangeKey.value !== 'custom') return true
  return customStart.value <= todayStr() && todayStr() <= customEnd.value
})

const todayLeaves = computed(() =>
  items.value.filter((i) => i.start_date <= todayStr() && todayStr() <= i.end_date),
)

const filteredItems = computed(() =>
  typeFilter.value ? items.value.filter((i) => i.leave_type === typeFilter.value) : items.value,
)

const periodText = (item: LeaveItem) =>
  item.start_date === item.end_date
    ? item.start_date
    : `${item.start_date} ~ ${item.end_date}`

const daysCount = (item: LeaveItem) =>
  Math.round((Date.parse(item.end_date) - Date.parse(item.start_date)) / 86_400_000) + 1

const createdText = (value: string | null) =>
  value ? value.slice(0, 16).replace('T', ' ') : ''

onMounted(() => {
  load()
  loadClassrooms()
})
</script>

<template>
  <div class="student-leaves">
    <PortalPageHeader
      title="學生請假"
      subtitle="家長端登記即成立，無需審核；此頁供教師掌握班上請假狀況。"
    />

    <!-- error 與 empty 必須分辨：網路失敗被誤讀為「今天沒人請假」是安全隱患
         （同 ClassHubLeaveCard 的既有約束）。 -->
    <section
      v-if="rangeCoversToday && !errorMessage"
      data-test="today-section"
      class="today pt-card-elevated"
    >
      <header class="today__head">
        <el-icon class="today__icon" aria-hidden="true"><House /></el-icon>
        <h3>今日請假</h3>
        <span class="today__count"><b data-test="today-count">{{ todayLeaves.length }}</b> 人</span>
      </header>
      <p v-if="!todayLeaves.length" class="today__empty">今天沒有學生請假</p>
      <ul v-else class="today__list">
        <li v-for="item in todayLeaves" :key="item.id" data-test="today-item">
          <span class="name">{{ item.student_name }}</span>
          <span class="tag" :data-type="item.leave_type">{{ item.leave_type }}</span>
          <span v-if="classroomName(item.classroom_id)" class="classroom">{{ classroomName(item.classroom_id) }}</span>
          <span class="until">請假至 {{ item.end_date }}</span>
          <span v-if="item.reason" class="reason">{{ item.reason }}</span>
        </li>
      </ul>
    </section>

    <section class="filters pt-card-elevated">
      <div class="filters__row">
        <span class="filters__label">期間</span>
        <button
          type="button"
          data-test="range-default"
          class="chip"
          :class="{ active: rangeKey === 'default' }"
          @click="setRange('default')"
        >近 7 天～未來 14 天</button>
        <button
          type="button"
          data-test="range-today"
          class="chip"
          :class="{ active: rangeKey === 'today' }"
          @click="setRange('today')"
        >今天</button>
        <span class="filters__custom">
          <input v-model="customStart" data-test="custom-start" type="date" aria-label="起始日期" />
          <span class="tilde">~</span>
          <input v-model="customEnd" data-test="custom-end" type="date" aria-label="結束日期" />
        </span>
      </div>

      <div v-if="classrooms.length > 1" class="filters__row">
        <span class="filters__label">班級</span>
        <button
          type="button"
          data-test="classroom-chip"
          class="chip"
          :class="{ active: classroomId === null }"
          @click="setClassroom(null)"
        >全部</button>
        <button
          v-for="c in classrooms"
          :key="c.classroom_id"
          type="button"
          data-test="classroom-chip"
          class="chip"
          :class="{ active: classroomId === c.classroom_id }"
          @click="setClassroom(c.classroom_id)"
        >{{ c.classroom_name }}</button>
      </div>

      <div class="filters__row">
        <span class="filters__label">假別</span>
        <button
          type="button"
          data-test="type-chip"
          class="chip"
          :class="{ active: typeFilter === '' }"
          @click="typeFilter = ''"
        >全部</button>
        <button
          v-for="t in LEAVE_TYPES"
          :key="t"
          type="button"
          data-test="type-chip"
          class="chip"
          :class="{ active: typeFilter === t }"
          @click="typeFilter = t"
        >{{ t }}</button>
      </div>
    </section>

    <section class="list pt-card-elevated">
      <p v-if="loading && !items.length" class="list__hint">載入中…</p>
      <p v-else-if="errorMessage" class="list__error">
        {{ errorMessage }}
        <button type="button" data-test="retry" class="list__retry" @click="load">重試</button>
      </p>
      <p v-else-if="!filteredItems.length" class="list__hint">目前範圍內沒有學生請假</p>
      <ul v-else class="list__rows">
        <li v-for="item in filteredItems" :key="item.id" data-test="leave-row">
          <div class="row-main">
            <span class="name">{{ item.student_name }}</span>
            <span v-if="classroomName(item.classroom_id)" class="classroom">{{ classroomName(item.classroom_id) }}</span>
            <span class="tag" :data-type="item.leave_type">{{ item.leave_type }}</span>
          </div>
          <div class="row-sub">
            <span class="period">{{ periodText(item) }}（{{ daysCount(item) }} 天）</span>
            <span v-if="item.reason" class="reason">{{ item.reason }}</span>
            <span v-if="createdText(item.created_at)" class="created">家長登記於 {{ createdText(item.created_at) }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.student-leaves {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 860px;
}

.today,
.filters,
.list {
  padding: 16px;
}

.today__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.today__head h3 {
  margin: 0;
  font-size: 16px;
}
.today__icon {
  align-self: center;
  font-size: 18px;
  color: var(--color-tint-leave-fg);
}

.today__count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.today__count b {
  color: var(--el-color-primary);
  font-size: 18px;
}

.today__empty {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.today__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.today__list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.filters__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.filters__label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  min-width: 32px;
}

.chip {
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: none;
  padding: 4px 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.chip.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.filters__custom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.filters__custom input {
  min-height: 32px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 0 8px;
  font: inherit;
  font-size: var(--text-sm);
  color: var(--el-text-color-regular);
  background: var(--pt-surface-card);
}
.filters__custom input:focus-visible {
  outline: none;
  border-color: var(--el-color-primary);
}

.tilde {
  color: var(--el-text-color-secondary);
}

.list__hint,
.list__error {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.list__retry {
  margin-left: 8px;
  border: none;
  background: none;
  color: var(--el-color-primary);
  cursor: pointer;
}

.list__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list__rows li {
  padding: 10px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.list__rows li:first-child {
  border-top: none;
}

.row-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.row-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.name {
  font-weight: 600;
}

.classroom {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tag {
  font-size: 12px;
  border-radius: 4px;
  padding: 1px 6px;
  background: var(--el-color-info-light-9);
  color: var(--el-text-color-regular);
}

.tag[data-type='病假'] {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.tag[data-type='事假'] {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
</style>
