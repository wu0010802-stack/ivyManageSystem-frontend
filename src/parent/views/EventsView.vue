<script setup>
import { computed, onMounted, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { listEvents, acknowledgeEvent } from '../api/events'
import { toast } from '../utils/toast'

const childrenStore = useChildrenStore()
const items = ref([])
const loading = ref(false)
const ackTarget = ref(null) // { event, student_id, signature_name }

const TYPE_LABEL = {
  meeting: '會議',
  activity: '活動',
  holiday: '假日',
  general: '一般',
}

const studentNameMap = computed(() => {
  const m = new Map()
  for (const c of childrenStore.items || []) m.set(c.student_id, c.name)
  return m
})

async function fetchData() {
  loading.value = true
  try {
    const { data } = await listEvents()
    items.value = data?.items || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

function openAck(event) {
  if (!event.need_ack_student_ids?.length) return
  ackTarget.value = {
    event,
    student_id: event.need_ack_student_ids[0],
    signature_name: '',
  }
}

async function submitAck() {
  const t = ackTarget.value
  if (!t) return
  try {
    await acknowledgeEvent(t.event.id, {
      student_id: Number(t.student_id),
      signature_name: t.signature_name.trim() || null,
    })
    toast.success('已簽閱')
    ackTarget.value = null
    fetchData()
  } catch (err) {
    toast.error(err?.displayMessage || '簽閱失敗')
  }
}

onMounted(async () => {
  await childrenStore.load()
  fetchData()
})
</script>

<template>
  <div class="events-view">
    <div v-if="!loading && items.length === 0" class="empty">尚無事件</div>

    <div
      v-for="ev in items"
      :key="ev.id"
      class="event-card"
      :class="{ require: ev.requires_acknowledgment }"
    >
      <div class="event-row1">
        <span class="event-type">{{ TYPE_LABEL[ev.event_type] || ev.event_type }}</span>
        <span class="event-title">{{ ev.title }}</span>
      </div>
      <div class="event-row2">
        {{ ev.event_date }}<span v-if="ev.end_date && ev.end_date !== ev.event_date"> ~ {{ ev.end_date }}</span>
        <span v-if="!ev.is_all_day && (ev.start_time || ev.end_time)">
          ・ {{ ev.start_time || '' }}-{{ ev.end_time || '' }}
        </span>
      </div>
      <div v-if="ev.location" class="event-loc">📍 {{ ev.location }}</div>
      <div v-if="ev.description" class="event-desc">{{ ev.description }}</div>

      <template v-if="ev.requires_acknowledgment">
        <div class="ack-info">
          <span v-if="ev.ack_deadline">截止：{{ ev.ack_deadline }}</span>
          <span v-if="ev.acked_student_ids?.length">
            已簽：{{ ev.acked_student_ids.map(id => studentNameMap.get(id) || id).join('、') }}
          </span>
        </div>
        <div v-if="ev.need_ack_student_ids?.length" class="ack-actions">
          <button class="primary-btn" @click="openAck(ev)">
            簽閱（{{ ev.need_ack_student_ids.length }} 位待簽）
          </button>
        </div>
        <div v-else class="ack-done">所有子女皆已簽閱 ✓</div>
      </template>
    </div>

    <!-- 簽閱 modal -->
    <div v-if="ackTarget" class="modal-mask" @click.self="ackTarget = null">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">簽閱事件</span>
          <button class="close" @click="ackTarget = null">✕</button>
        </div>
        <div class="form">
          <div class="event-summary">
            <div class="event-summary-title">{{ ackTarget.event.title }}</div>
            <div class="event-summary-date">{{ ackTarget.event.event_date }}</div>
          </div>
          <div class="field">
            <label>代表哪位小孩簽？</label>
            <select v-model="ackTarget.student_id">
              <option
                v-for="sid in ackTarget.event.need_ack_student_ids"
                :key="sid"
                :value="sid"
              >{{ studentNameMap.get(sid) || `學生 #${sid}` }}</option>
            </select>
          </div>
          <div class="field">
            <label>簽章姓名（選填）</label>
            <input type="text" v-model="ackTarget.signature_name" maxlength="50" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="secondary-btn" @click="ackTarget = null">取消</button>
          <button class="primary-btn" @click="submitAck">確認簽閱</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.events-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: #888;
}

.event-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.event-card.require {
  border-left: 3px solid #d97706;
}

.event-row1 {
  display: flex;
  gap: 8px;
  align-items: center;
}

.event-type {
  background: #eaf2fb;
  color: #2057a8;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.event-title {
  flex: 1;
  font-weight: 600;
  color: #2c3e50;
  font-size: 15px;
}

.event-row2 {
  margin-top: 6px;
  color: #555;
  font-size: 13px;
}

.event-loc {
  margin-top: 4px;
  color: #777;
  font-size: 13px;
}

.event-desc {
  margin-top: 6px;
  color: #666;
  font-size: 13px;
  line-height: 1.5;
}

.ack-info {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #888;
  font-size: 12px;
}

.ack-actions {
  margin-top: 8px;
}

.ack-done {
  margin-top: 8px;
  color: #3f7d48;
  font-size: 12px;
}

.primary-btn {
  padding: 8px 16px;
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
}

.secondary-btn {
  padding: 8px 16px;
  background: #fff;
  color: #555;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  font-size: 14px;
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
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}

.form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-summary {
  background: #f7f9f8;
  padding: 10px 12px;
  border-radius: 8px;
}

.event-summary-title {
  font-weight: 600;
  font-size: 14px;
}

.event-summary-date {
  color: #888;
  font-size: 12px;
  margin-top: 2px;
}

.field label {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 4px;
}

.field input,
.field select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
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
