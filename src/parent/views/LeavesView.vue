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

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const items = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)

const STATUS_LABEL = {
  approved: '已成立',
  cancelled: '已取消',
  // 相容歷史資料（migration 跑前的紀錄）
  pending: '已成立',
  rejected: '已成立',
}
const STATUS_COLOR = {
  approved: { bg: '#e6f4ea', color: '#2d6a3a' },
  cancelled: { bg: '#f0f2f5', color: '#666' },
  pending: { bg: '#e6f4ea', color: '#2d6a3a' },
  rejected: { bg: '#e6f4ea', color: '#2d6a3a' },
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

const detail = ref(null)
const detailUploading = ref(false)

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

async function pickAndUpload(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
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

async function removeAttachment(att) {
  if (!detail.value) return
  if (!confirm('確定要刪除此附件？')) return
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

async function onCancel(item) {
  if (!confirm(`確定要取消「${studentNameMap.value.get(item.student_id) || ''} ${item.leave_type} ${item.start_date}」的申請？`)) return
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
      <button class="primary-btn" @click="openForm">＋ 申請請假</button>
    </div>

    <div v-if="!loading && filteredItems.length === 0" class="empty">尚無請假紀錄</div>

    <div
      v-for="item in filteredItems"
      :key="item.id"
      class="leave-card"
      @click="openDetail(item)"
    >
      <div class="leave-row1">
        <span class="student">{{ studentNameMap.get(item.student_id) || `學生 #${item.student_id}` }}</span>
        <span class="type">{{ item.leave_type }}</span>
        <span
          class="status"
          :style="{
            background: STATUS_COLOR[item.status]?.bg,
            color: STATUS_COLOR[item.status]?.color,
          }"
        >{{ STATUS_LABEL[item.status] || item.status }}</span>
      </div>
      <div class="leave-row2">
        {{ item.start_date }} ~ {{ item.end_date }}
      </div>
      <div v-if="item.reason" class="leave-reason">原因：{{ item.reason }}</div>
      <div v-if="item.review_note" class="leave-review">校方備註：{{ item.review_note }}</div>
      <div
        class="leave-actions"
        v-if="item.status === 'approved' && item.start_date > todayStr"
        @click.stop
      >
        <button class="cancel-btn" @click="onCancel(item)">取消申請</button>
      </div>
    </div>

    <!-- detail / timeline / 附件 modal -->
    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{ detail.leave_type }} 申請</span>
          <button class="close" @click="closeDetail">✕</button>
        </div>
        <div class="modal-body">
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
          <p
            v-if="!(detail.status === 'approved' && detail.start_date > todayStr)"
            class="detail-hint"
          >
            請假已成立或已開始，無法新增/刪除附件。
          </p>
          <div v-if="detail.attachments?.length" class="att-list">
            <div v-for="a in detail.attachments" :key="a.id" class="att-row">
              <a :href="attUrl(a)" target="_blank" rel="noopener" class="att-link">
                📎 {{ a.original_filename || `附件 #${a.id}` }}
              </a>
              <button
                v-if="detail.status === 'approved' && detail.start_date > todayStr"
                class="att-del"
                @click="removeAttachment(a)"
              >刪除</button>
            </div>
          </div>
          <div v-else class="att-empty">尚未上傳任何附件</div>
          <label
            v-if="detail.status === 'approved' && detail.start_date > todayStr"
            class="upload-btn"
          >
            <input
              type="file"
              accept="image/*,.pdf,.heic,.heif"
              @change="pickAndUpload"
              :disabled="detailUploading"
            />
            <span>{{ detailUploading ? '上傳中...' : '＋ 上傳附件' }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 新申請 modal -->
    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">申請請假</span>
          <button class="close" @click="showForm = false">✕</button>
        </div>
        <div class="form">
          <div class="field">
            <label>學生</label>
            <select v-model="form.student_id">
              <option
                v-for="c in childrenStore.items"
                :key="c.student_id"
                :value="c.student_id"
              >{{ c.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>假別</label>
            <div class="radio-row">
              <label class="radio">
                <input type="radio" v-model="form.leave_type" value="病假" />病假
              </label>
              <label class="radio">
                <input type="radio" v-model="form.leave_type" value="事假" />事假
              </label>
            </div>
          </div>
          <div class="field">
            <label>起始日</label>
            <input type="date" v-model="form.start_date" :min="pastLimitStr" :max="futureLimitStr" />
          </div>
          <div class="field">
            <label>結束日</label>
            <input type="date" v-model="form.end_date" :min="form.start_date" :max="futureLimitStr" />
          </div>
          <div class="field">
            <label>原因（選填）</label>
            <textarea v-model="form.reason" rows="3" maxlength="500" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="secondary-btn" @click="showForm = false">取消</button>
          <button class="primary-btn" :disabled="submitting" @click="submit">
            {{ submitting ? '送出中...' : '送出' }}
          </button>
        </div>
      </div>
    </div>
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
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
}

.primary-btn:disabled {
  opacity: 0.5;
}

.secondary-btn {
  padding: 8px 16px;
  background: #fff;
  color: #555;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  font-size: 14px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: #888;
}

.leave-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.leave-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.student {
  font-weight: 600;
  color: #2c3e50;
}

.type {
  background: #eaf2fb;
  color: #2057a8;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.status {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.leave-row2 {
  margin-top: 6px;
  color: #555;
  font-size: 14px;
}

.leave-reason,
.leave-review {
  margin-top: 4px;
  color: #777;
  font-size: 13px;
}

.leave-actions {
  margin-top: 8px;
}

.cancel-btn {
  padding: 4px 12px;
  background: #fff;
  color: #c0392b;
  border: 1px solid #e0c4c0;
  border-radius: 6px;
  font-size: 12px;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #eee;
}

.modal-title {
  flex: 1;
  font-weight: 600;
  font-size: 16px;
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #888;
  cursor: pointer;
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
  color: #555;
  margin-bottom: 4px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d0d0d0;
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

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid #eee;
}

.modal-body {
  padding: 16px;
  max-height: 70vh;
  overflow-y: auto;
}

.detail-line {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 14px;
  color: #2c3e50;
}
.detail-label {
  width: 56px;
  color: #888;
  flex-shrink: 0;
}

.section-h {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.detail-hint {
  font-size: 12px;
  color: #888;
  margin: 0 0 6px;
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
  color: #999;
}
.step.done {
  color: #2c3e50;
}
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e5e7eb;
  border: 2px solid #d0d0d0;
}
.step.done .step-dot {
  background: #3f7d48;
  border-color: #3f7d48;
}
.step-label {
  flex: 1;
}
.step-time {
  font-size: 11px;
  color: #888;
}

/* 附件清單 */
.att-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.att-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f6f8fa;
  border-radius: 6px;
}
.att-link {
  flex: 1;
  font-size: 13px;
  color: #2057a8;
  text-decoration: none;
  word-break: break-all;
}
.att-del {
  background: transparent;
  border: 1px solid #e0c4c0;
  color: #c0392b;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.att-empty {
  font-size: 13px;
  color: #888;
  padding: 8px 0;
}
.upload-btn {
  display: block;
  margin-top: 10px;
  padding: 10px;
  text-align: center;
  background: #fff;
  border: 1px dashed #aaa;
  border-radius: 8px;
  color: #555;
  font-size: 14px;
  cursor: pointer;
}
.upload-btn input {
  display: none;
}
</style>
