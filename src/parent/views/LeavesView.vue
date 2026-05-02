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
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LeaveListCard from '../components/leaves/LeaveListCard.vue'
import LeaveAttachments from '../components/leaves/LeaveAttachments.vue'
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
    <div class="toolbar">
      <button class="primary-btn icon-btn" @click="openForm">
        <ParentIcon name="plus" size="sm" />
        申請請假
      </button>
    </div>

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

    <!-- detail / timeline / 附件 modal -->
    <AppModal
      v-model:open="detailOpen"
      labelled-by="leave-detail-title"
    >
      <template v-if="detail">
        <div class="detail-header">
          <span id="leave-detail-title" class="detail-title">{{ detail.leave_type }} 申請</span>
          <button class="close" type="button" aria-label="關閉" @click="closeDetail">
            <ParentIcon name="close" size="sm" />
          </button>
        </div>
        <div class="detail-body">
          <div class="detail-line">
            <span class="detail-label">學生</span>
            <span>{{ studentNameMap.get(detail.student_id) || '—' }}</span>
          </div>
          <div class="detail-line">
            <span class="detail-label">期間</span>
            <span>{{ detail.start_date }} ~ {{ detail.end_date }}</span>
          </div>
          <div v-if="detail.reason" class="detail-line">
            <span class="detail-label">原因</span>
            <span>{{ detail.reason }}</span>
          </div>
          <div v-if="detail.review_note" class="detail-line">
            <span class="detail-label">校方備註</span>
            <span>{{ detail.review_note }}</span>
          </div>

          <h4 class="section-h">審核進度</h4>
          <div class="timeline">
            <div
              v-for="step in timelineSteps(detail)"
              :key="step.key"
              class="step"
              :class="{ done: step.done }"
            >
              <span class="step-dot" />
              <span class="step-label">{{ step.label }}</span>
              <span v-if="step.timestamp" class="step-time">
                {{ step.timestamp.replace('T', ' ').slice(0, 16) }}
              </span>
            </div>
          </div>

          <h4 class="section-h">佐證附件</h4>
          <LeaveAttachments
            :attachments="detail.attachments || []"
            :editable="detail.status === 'approved' && detail.start_date > todayStr"
            :uploading="detailUploading"
            :url-resolver="attUrl"
            @upload="onAttUpload"
            @remove="askRemoveAttachment"
          />
        </div>
      </template>
    </AppModal>

    <!-- 新申請 modal -->
    <AppModal
      v-model:open="showForm"
      labelled-by="leave-form-title"
    >
      <div class="form-header">
        <span id="leave-form-title" class="form-title">申請請假</span>
        <button class="close" type="button" aria-label="關閉" @click="showForm = false">
          <ParentIcon name="close" size="sm" />
        </button>
      </div>
      <div class="form">
        <div class="field">
          <label for="leave-student">學生</label>
          <select id="leave-student" v-model="form.student_id">
            <option
              v-for="c in childrenStore.items"
              :key="c.student_id"
              :value="c.student_id"
            >{{ c.name }}</option>
          </select>
        </div>
        <fieldset class="field radio-fieldset">
          <legend>假別</legend>
          <div class="radio-row">
            <label class="radio">
              <input type="radio" v-model="form.leave_type" value="病假" />病假
            </label>
            <label class="radio">
              <input type="radio" v-model="form.leave_type" value="事假" />事假
            </label>
          </div>
        </fieldset>
        <div class="field">
          <label for="leave-start">起始日</label>
          <input
            id="leave-start"
            type="date"
            v-model="form.start_date"
            :min="pastLimitStr"
            :max="futureLimitStr"
          />
        </div>
        <div class="field">
          <label for="leave-end">結束日</label>
          <input
            id="leave-end"
            type="date"
            v-model="form.end_date"
            :min="form.start_date"
            :max="futureLimitStr"
          />
        </div>
        <div class="field">
          <label for="leave-reason">原因（選填）</label>
          <textarea
            id="leave-reason"
            v-model="form.reason"
            rows="3"
            maxlength="500"
            autocomplete="off"
          />
        </div>
      </div>
      <div class="form-footer">
        <button type="button" class="secondary-btn" @click="showForm = false">取消</button>
        <button type="button" class="primary-btn" :disabled="submitting" @click="submit">
          {{ submitting ? '送出中...' : '送出' }}
        </button>
      </div>
    </AppModal>

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

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
}

.primary-btn:disabled {
  opacity: 0.5;
}

.secondary-btn {
  padding: 8px 16px;
  background: var(--neutral-0);
  color: var(--pt-text-muted);
  border: 1px solid var(--pt-border-strong);
  border-radius: 8px;
  font-size: 14px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pt-text-placeholder);
}

.detail-header,
.form-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pt-border-light);
}

.detail-title,
.form-title {
  flex: 1;
  font-weight: 600;
  font-size: 16px;
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--pt-text-placeholder);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field label {
  display: block;
  font-size: 13px;
  color: var(--pt-text-muted);
  margin-bottom: 4px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.radio-row {
  display: flex;
  gap: 16px;
}

.radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.form-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--pt-border-light);
}

.detail-body {
  padding: 16px;
}

.detail-line {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--pt-text-strong);
}
.detail-label {
  width: 56px;
  color: var(--pt-text-placeholder);
  flex-shrink: 0;
}

.section-h {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--pt-text-muted);
}

/* 時間軸 */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 4px;
}
.step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--pt-text-faint);
}
.step.done {
  color: var(--pt-text-strong);
}
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pt-border);
  border: 2px solid var(--pt-border-strong);
}
.step.done .step-dot {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
}
.step-label {
  flex: 1;
}
.step-time {
  font-size: 11px;
  color: var(--pt-text-placeholder);
}

.render-sentinel { height: 1px; }
</style>
