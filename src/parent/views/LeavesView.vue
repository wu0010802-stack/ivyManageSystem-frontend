<script setup>
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildSelector from '../components/ChildSelector.vue'
import {
  listLeaves,
  createLeave,
  cancelLeave,
  uploadLeaveAttachment,
  deleteLeaveAttachment,
  getLeave,
} from '../api/leaves'
import { toast } from '../utils/toast'
import { todayISO, dateToLocalISO } from '@/utils/format'
import ParentBottomSheet from '../components/ParentBottomSheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LeaveListCard from '../components/leaves/LeaveListCard.vue'
import LeaveDetailSheet from '../components/leaves/LeaveDetailSheet.vue'
import LeaveForm from '../components/leaves/LeaveForm.vue'
import LeaveHero from '../components/leaves/LeaveHero.vue'
import { useIncrementalRender } from '../composables/useIncrementalRender'

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const items = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)

// 二階段確認 state（取代 window.confirm）
const removeAttTarget = ref(null) // 待刪除附件 attachment 或 null
const cancelTarget = ref(null) // 待取消的請假 item 或 null

const removeAttOpen = computed({
  get: () => removeAttTarget.value !== null,
  set: (v) => {
    if (!v) removeAttTarget.value = null
  },
})

const cancelOpen = computed({
  get: () => cancelTarget.value !== null,
  set: (v) => {
    if (!v) cancelTarget.value = null
  },
})

const cancelTitle = computed(() => {
  const item = cancelTarget.value
  if (!item) return ''
  const name = studentNameMap.value.get(item.student_id) || ''
  return `確定取消「${name} ${item.leave_type} ${item.start_date}」？`
})

const STATUS_LABEL = {
  approved: '已成立',
  cancelled: '已取消',
  // 相容歷史資料（migration 跑前的紀錄）
  pending: '已成立',
  rejected: '已成立',
}
const STATUS_COLOR = {
  approved: { bg: 'var(--brand-primary-soft)', color: 'var(--pt-success-text)' },
  cancelled: { bg: 'var(--pt-surface-mute)', color: 'var(--pt-text-soft)' },
  pending: { bg: 'var(--brand-primary-soft)', color: 'var(--pt-success-text)' },
  rejected: { bg: 'var(--brand-primary-soft)', color: 'var(--pt-success-text)' },
}

const todayStr = computed(() => todayISO())
const futureLimitStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return dateToLocalISO(d)
})()
const pastLimitStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return dateToLocalISO(d)
})()

const form = ref({
  student_id: null,
  leave_type: '病假',
  start_date: todayStr.value,
  end_date: todayStr.value,
  reason: '',
})

const studentNameMap = computed(() => {
  const m = new Map()
  for (const c of childrenStore.items || []) m.set(c.student_id, c.name)
  return m
})

// 多孩家庭：以選擇器篩選；單孩家庭 selectedId 仍會被預設成唯一 student
const filteredItems = computed(() => {
  if (!selectedId.value) return items.value
  return items.value.filter((x) => x.student_id === selectedId.value)
})

// 學期定義（簡化）：8/1–7/31 為一學年
function currentSemesterRange(today = new Date()) {
  const y = today.getMonth() + 1 >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return {
    start: new Date(y, 7, 1), // 8/1
    end: new Date(y + 1, 6, 31, 23, 59, 59), // 7/31
    label: `${y - 1911} 學年度`,
  }
}

const heroSummary = computed(() => {
  const { start, end, label } = currentSemesterRange()
  const inSemester = (filteredItems.value ?? []).filter((l) => {
    const d = new Date(l.start_date)
    return l.status !== 'rejected' && l.status !== 'cancelled' && d >= start && d <= end
  })
  const by_type = {}
  let total = 0
  for (const l of inSemester) {
    const t = l.leave_type
    const days = Number(l.duration_days) || 0
    by_type[t] = (by_type[t] || 0) + days
    total += days
  }
  return { total_used: total, by_type, semester_label: label }
})

// 漸進渲染：請假累積多筆時觸底加載
const {
  visible: visibleLeaves,
  sentinelRef: leavesSentinel,
  hasMore: hasMoreLeaves,
} = useIncrementalRender(filteredItems, { pageSize: 20 })

const detail = ref(null)
const detailUploading = ref(false)

const detailOpen = computed({
  get: () => detail.value !== null,
  set: (v) => {
    if (!v) detail.value = null
  },
})

async function openDetail(item) {
  try {
    const { data } = await getLeave(item.id)
    detail.value = data
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  }
}

function closeDetail() {
  detail.value = null
}

async function onAttUpload(file) {
  if (!file || !detail.value) return
  detailUploading.value = true
  try {
    await uploadLeaveAttachment(detail.value.id, file)
    toast.success('已上傳')
    const { data } = await getLeave(detail.value.id)
    detail.value = data
  } catch (err) {
    toast.error(err?.displayMessage || '上傳失敗')
  } finally {
    detailUploading.value = false
  }
}

function askRemoveAttachment(att) {
  if (!detail.value) return
  removeAttTarget.value = att
}

async function doRemoveAttachment() {
  const att = removeAttTarget.value
  removeAttTarget.value = null
  if (!att || !detail.value) return
  try {
    await deleteLeaveAttachment(detail.value.id, att.id)
    toast.success('已刪除')
    const { data } = await getLeave(detail.value.id)
    detail.value = data
  } catch (err) {
    toast.error(err?.displayMessage || '刪除失敗')
  }
}

function attUrl(att) {
  // 走家長端下載 endpoint，後端會做 IDOR 守衛
  const key = att.thumb_key || att.display_key || att.storage_key
  return `/api/parent/uploads/portfolio/${key}`
}

const TIMELINE_STEPS = [
  { key: 'created', label: '已送出', match: () => true },
  {
    key: 'approved',
    label: '已成立',
    // cancel 規則要求 status 必須先是 approved 才能取消，所以 cancelled
    // 紀錄歷史上一定經過 approved；pending/rejected 為相容歷史資料
    match: (item) => ['approved', 'cancelled', 'pending', 'rejected'].includes(item.status),
  },
  {
    key: 'cancelled',
    label: '已取消',
    match: (item) => item.status === 'cancelled',
  },
]

function timelineSteps(item) {
  if (!item) return []
  return TIMELINE_STEPS.map((step) => {
    const done = step.match(item)
    let timestamp = null
    if (step.key === 'created') timestamp = item.created_at
    else if (step.key === 'approved') timestamp = item.reviewed_at || item.updated_at
    else if (step.key === 'cancelled') timestamp = item.updated_at
    return { ...step, done, timestamp }
  })
}

async function fetchData() {
  loading.value = true
  try {
    const { data } = await listLeaves()
    items.value = data?.items || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

function openForm() {
  if ((childrenStore.items || []).length === 0) {
    toast.warn('尚未綁定子女')
    return
  }
  form.value = {
    student_id: selectedId.value || childrenStore.items[0].student_id,
    leave_type: '病假',
    start_date: todayStr.value,
    end_date: todayStr.value,
    reason: '',
  }
  showForm.value = true
}

async function submit() {
  if (!form.value.student_id) {
    toast.warn('請選擇學生')
    return
  }
  if (form.value.end_date < form.value.start_date) {
    toast.warn('結束日不可早於起始日')
    return
  }
  submitting.value = true
  try {
    await createLeave({
      student_id: Number(form.value.student_id),
      leave_type: form.value.leave_type,
      start_date: form.value.start_date,
      end_date: form.value.end_date,
      reason: form.value.reason.trim() || null,
    })
    toast.success('請假已成立')
    showForm.value = false
    fetchData()
  } catch (err) {
    toast.error(err?.displayMessage || '送出失敗')
  } finally {
    submitting.value = false
  }
}

function askCancel(item) {
  cancelTarget.value = item
}

async function doCancel() {
  const item = cancelTarget.value
  cancelTarget.value = null
  if (!item) return
  try {
    await cancelLeave(item.id)
    toast.success('已取消')
    fetchData()
  } catch (err) {
    toast.error(err?.displayMessage || '取消失敗')
  }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
  fetchData()
})
</script>

<template>
  <div class="leaves-view">
    <ChildSelector />

    <LeaveHero :summary="heroSummary">
      <template #action>
        <button class="hero-cta" type="button" @click="openForm">＋ 申請請假</button>
      </template>
    </LeaveHero>

    <div v-if="!loading && filteredItems.length === 0" class="empty">尚無請假紀錄</div>

    <LeaveListCard
      v-for="item in visibleLeaves"
      :key="item.id"
      :leave="item"
      :student-name="studentNameMap.get(item.student_id) || ''"
      :status-label="STATUS_LABEL[item.status] || item.status"
      :status-color="STATUS_COLOR[item.status] || null"
      :can-cancel="item.status === 'approved' && item.start_date > todayStr"
      @click="openDetail(item)"
      @cancel="askCancel(item)"
    />

    <div v-if="hasMoreLeaves" ref="leavesSentinel" class="render-sentinel" aria-hidden="true" />

    <!-- detail / timeline / 附件 sheet -->
    <LeaveDetailSheet
      v-model="detailOpen"
      :leave="detail"
      :student-name="detail ? (studentNameMap.get(detail.student_id) || '') : ''"
      :timeline-steps="detail ? timelineSteps(detail) : []"
      :att-uploading="detailUploading"
      :att-editable="!!detail && detail.status === 'approved' && detail.start_date > todayStr"
      :url-resolver="attUrl"
      @att-upload="onAttUpload"
      @att-remove="askRemoveAttachment"
    />

    <!-- 新申請 sheet -->
    <ParentBottomSheet
      v-model="showForm"
      title="申請請假"
      :snap-points="['mid', 'full']"
      default-snap="full"
    >
      <LeaveForm
        v-model="form"
        :children="childrenStore.items || []"
        :past-limit="pastLimitStr"
        :future-limit="futureLimitStr"
        :submitting="submitting"
        @submit="submit"
        @cancel="showForm = false"
      />
    </ParentBottomSheet>

    <!-- 二階段確認 dialog（取代 window.confirm） -->
    <ConfirmDialog
      v-model:open="removeAttOpen"
      title="確定刪除此附件？"
      message="刪除後無法還原。"
      confirm-label="刪除"
      destructive
      @confirm="doRemoveAttachment"
    />
    <ConfirmDialog
      v-model:open="cancelOpen"
      :title="cancelTitle"
      message="取消後此申請會標為已取消，並還原原本的出席狀態。"
      confirm-label="取消申請"
      cancel-label="不取消"
      destructive
      @confirm="doCancel"
    />
  </div>
</template>

<style scoped>
.leaves-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pt-text-placeholder);
}

.render-sentinel { height: 1px; }

.hero-cta {
  background: rgba(255, 255, 255, 0.95);
  color: var(--brand-primary, #3f7d48);
  border: none;
  padding: 8px 14px;
  border-radius: 99px;
  font-weight: 600;
  cursor: pointer;
}
.hero-cta:hover { background: #fff; }
</style>
