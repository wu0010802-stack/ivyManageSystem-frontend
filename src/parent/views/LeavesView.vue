<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import {
  listLeaves,
  createLeave,
  cancelLeave,
  uploadLeaveAttachment,
  deleteLeaveAttachment,
  getLeave,
} from '../api/leaves'
import { toast } from '../utils/toast'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import { useFriendlyError } from '@/composables/useFriendlyError'
import { todayISO, dateToLocalISO } from '@/utils/format'
import ParentBottomSheet from '../components/ParentBottomSheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LeaveListCard from '../components/leaves/LeaveListCard.vue'
import LeaveDetailSheet from '../components/leaves/LeaveDetailSheet.vue'
import LeaveForm from '../components/leaves/LeaveForm.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import LeaveHero from '../components/leaves/LeaveHero.vue'
import { useIncrementalRender } from '../composables/useIncrementalRender'
import EmptyState from '@/components/common/EmptyState.vue'

interface LeaveItem {
  id: number
  student_id: number
  leave_type?: string
  start_date?: string
  end_date?: string
  status: string
  duration_days?: number | string
  created_at?: string
  reviewed_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface Attachment {
  id: number
  thumb_key?: string
  display_key?: string
  storage_key?: string
}

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const { getFriendly } = useFriendlyError()

/**
 * 將 error 透過 useFriendlyError 對應至 toast，組 message + nextStep 為單行字串。
 * 對齊 ContactBookView 行為：level 決定 toast variant；無 nextStep 仍可用 fallback。
 */
function _toastFriendly(err: unknown, fallback: string) {
  const f = getFriendly(err)
  const msg = f.message || fallback
  const text = f.nextStep ? `${msg}｜${f.nextStep}` : msg
  if (f.level === 'info') toast.info(text)
  else if (f.level === 'warning') toast.warn(text)
  else toast.error(text)
}
const items = ref<LeaveItem[]>([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)

// 二階段確認 state（取代 window.confirm）
const removeAttTarget = ref<Attachment | null>(null)
const cancelTarget = ref<LeaveItem | null>(null)

const removeAttOpen = computed({
  get: () => removeAttTarget.value !== null,
  set: (v: boolean) => {
    if (!v) removeAttTarget.value = null
  },
})

const cancelOpen = computed({
  get: () => cancelTarget.value !== null,
  set: (v: boolean) => {
    if (!v) cancelTarget.value = null
  },
})

const cancelTitle = computed(() => {
  const item = cancelTarget.value
  if (!item) return ''
  const name = studentNameMap.value.get(item.student_id) || ''
  return `確定取消「${name} ${item.leave_type} ${item.start_date}」？`
})

const STATUS_LABEL: Record<string, string> = {
  approved: '已成立',
  cancelled: '已取消',
  // 相容歷史資料（migration 跑前的紀錄）
  pending: '已成立',
  rejected: '已成立',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
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

const form = ref<{
  student_id?: number
  leave_type: string
  start_date: string
  end_date: string
  reason: string
}>({
  student_id: undefined,
  leave_type: '病假',
  start_date: todayStr.value,
  end_date: todayStr.value,
  reason: '',
})

const childrenItemsTyped = computed(() => (childrenStore.items || []) as { student_id: number; name?: string }[])

const studentNameMap = computed(() => {
  const m = new Map<number, string>()
  for (const c of (childrenStore.items || []) as { student_id: number; name?: string }[]) m.set(c.student_id, c.name || '')
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
    const d = new Date(l.start_date || '')
    return l.status !== 'rejected' && l.status !== 'cancelled' && d >= start && d <= end
  })
  const by_type: Record<string, number> = {}
  let total = 0
  for (const l of inSemester) {
    const t = l.leave_type || ''
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
} = useIncrementalRender(filteredItems as unknown as import('vue').Ref<unknown[]>, { pageSize: 20 })
const visibleLeavesTyped = computed(() => visibleLeaves.value as LeaveItem[])

const detail = ref<LeaveItem | null>(null)
const detailUploading = ref(false)

const detailOpen = computed({
  get: () => detail.value !== null,
  set: (v: boolean) => {
    if (!v) detail.value = null
  },
})

async function openDetail(item: LeaveItem) {
  try {
    const { data } = await getLeave(item.id)
    detail.value = data as LeaveItem
  } catch (err) {
    _toastFriendly(err, '載入失敗')
  }
}

async function onAttUpload(file: File) {
  if (!file || !detail.value) return
  detailUploading.value = true
  try {
    await uploadLeaveAttachment(detail.value.id, file)
    toast.success('已上傳')
    const { data } = await getLeave(detail.value.id)
    detail.value = data as LeaveItem
  } catch (err) {
    _toastFriendly(err, '上傳失敗')
  } finally {
    detailUploading.value = false
  }
}

function askRemoveAttachment(att: Attachment) {
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
    detail.value = data as LeaveItem
  } catch (err) {
    _toastFriendly(err, '刪除失敗')
  }
}

function attUrl(att: Attachment) {
  // 走家長端下載 endpoint，後端會做 IDOR 守衛
  const key = att.thumb_key || att.display_key || att.storage_key
  return `/api/parent/uploads/portfolio/${key}`
}

const TIMELINE_STEPS: { key: string; label: string; match: (item: LeaveItem) => boolean }[] = [
  { key: 'created', label: '已送出', match: () => true },
  {
    key: 'approved',
    label: '已成立',
    // cancel 規則要求 status 必須先是 approved 才能取消，所以 cancelled
    // 紀錄歷史上一定經過 approved；pending/rejected 為相容歷史資料
    match: (item) => ['approved', 'cancelled', 'pending', 'rejected'].includes(item.status || ''),
  },
  {
    key: 'cancelled',
    label: '已取消',
    match: (item) => item.status === 'cancelled',
  },
]

function timelineSteps(item: LeaveItem | null) {
  if (!item) return []
  return TIMELINE_STEPS.map((step) => {
    const done = step.match(item)
    let timestamp: string | undefined
    if (step.key === 'created') timestamp = item.created_at as string | undefined
    else if (step.key === 'approved') timestamp = (item.reviewed_at || item.updated_at) as string | undefined
    else if (step.key === 'cancelled') timestamp = item.updated_at as string | undefined
    return { ...step, done, timestamp }
  })
}

async function fetchData() {
  loading.value = true
  try {
    const { data } = await listLeaves()
    items.value = (data as { items?: LeaveItem[] })?.items || []
  } catch (err) {
    _toastFriendly(err, '載入失敗')
  } finally {
    loading.value = false
  }
}

function openForm() {
  const childItems = (childrenStore.items || []) as { student_id: number }[]
  if (childItems.length === 0) {
    toast.warn('尚未綁定子女')
    return
  }
  form.value = {
    student_id: selectedId.value || childItems[0].student_id,
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
  if ((form.value.end_date || '') < (form.value.start_date || '')) {
    toast.warn('結束日不可早於起始日')
    return
  }
  submitting.value = true

  const leavePayload = {
    student_id: Number(form.value.student_id),
    leave_type: form.value.leave_type,
    start_date: form.value.start_date,
    end_date: form.value.end_date,
    reason: form.value.reason.trim() || null,
  }

  if (!navigator.onLine) {
    try {
      await enqueueParent({
        kind: OP_KINDS.PARENT_LEAVE_REQUEST,
        payload: leavePayload,
        meta: {
          student_id: leavePayload.student_id,
          leave_type: leavePayload.leave_type,
        },
      })
      toast.success('請假已暫存，連線後自動送出')
      showForm.value = false
      flushParentQueue(OP_KINDS.PARENT_LEAVE_REQUEST).catch(() => {})
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.error(String(e?.displayMessage || '暫存失敗'))
    } finally {
      submitting.value = false
    }
    return
  }

  try {
    await createLeave(leavePayload)
    toast.success('請假已成立')
    showForm.value = false
    fetchData()
  } catch (err) {
    _toastFriendly(err, '送出失敗')
  } finally {
    submitting.value = false
  }
}

function askCancel(item: LeaveItem) {
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
    _toastFriendly(err, '取消失敗')
  }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  fetchData()
  flushParentQueue(OP_KINDS.PARENT_LEAVE_REQUEST).catch(() => {})
})

async function pullRefresh() {
  await fetchData()
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="leaves-view">
    <ChildContextHeader variant="page" />

    <LeaveHero :summary="heroSummary">
      <template #action>
        <button class="pt-action-btn hero-cta" type="button" @click="openForm">
          <span class="material-symbols-rounded" aria-hidden="true">add</span>
          申請請假
        </button>
      </template>
    </LeaveHero>

    <EmptyState
      v-if="!loading && filteredItems.length === 0"
      variant="mobile"
      title="尚無請假紀錄"
    />

    <LeaveListCard
      v-for="item in visibleLeavesTyped"
      :key="item.id"
      :leave="item"
      :student-name="studentNameMap.get(item.student_id) || ''"
      :status-label="STATUS_LABEL[item.status] || item.status"
      :status-color="STATUS_COLOR[item.status] || null"
      :can-cancel="item.status === 'approved' && (item.start_date || '') > todayStr"
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
      :att-editable="!!detail && detail.status === 'approved' && (detail.start_date || '') > todayStr"
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
        :children="childrenItemsTyped"
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
  </PullToRefresh>
</template>

<style scoped>
.leaves-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.render-sentinel { height: 1px; }

.hero-cta {
  background: rgba(255, 255, 255, 0.95);
  color: var(--brand-primary, #0d9053);
  border: 1px solid rgba(13, 144, 83, 0.18);
}
.hero-cta:hover { background: #fff; }
.hero-cta:active { background: var(--cream, #fffcf2); }
</style>
