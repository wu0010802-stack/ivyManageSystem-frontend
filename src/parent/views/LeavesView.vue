<script setup>
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { listLeaves, createLeave, cancelLeave } from '../api/leaves'
import { toast } from '../utils/toast'

const childrenStore = useChildrenStore()
const items = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)

const STATUS_LABEL = {
  pending: '審核中',
  approved: '已核准',
  rejected: '已駁回',
  cancelled: '已取消',
}
const STATUS_COLOR = {
  pending: { bg: '#fff4e6', color: '#a25e0a' },
  approved: { bg: '#e6f4ea', color: '#2d6a3a' },
  rejected: { bg: '#fde8e8', color: '#a51c1c' },
  cancelled: { bg: '#f0f2f5', color: '#666' },
}

const todayStr = new Date().toISOString().slice(0, 10)
const futureLimitStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return d.toISOString().slice(0, 10)
})()
const pastLimitStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
})()

const form = ref({
  student_id: null,
  leave_type: '病假',
  start_date: todayStr,
  end_date: todayStr,
  reason: '',
})

const studentNameMap = computed(() => {
  const m = new Map()
  for (const c of childrenStore.items || []) m.set(c.student_id, c.name)
  return m
})

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
    student_id: childrenStore.items[0].student_id,
    leave_type: '病假',
    start_date: todayStr,
    end_date: todayStr,
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
    toast.success('已送出申請')
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
  fetchData()
})
</script>

<template>
  <div class="leaves-view">
    <div class="toolbar">
      <button class="primary-btn" @click="openForm">＋ 申請請假</button>
    </div>

    <div v-if="!loading && items.length === 0" class="empty">尚無請假紀錄</div>

    <div
      v-for="item in items"
      :key="item.id"
      class="leave-card"
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
      <div class="leave-actions" v-if="item.status === 'pending'">
        <button class="cancel-btn" @click="onCancel(item)">取消申請</button>
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
</style>
