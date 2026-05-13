<script setup>
import { onMounted, ref } from 'vue'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../api/notifications'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import M3Switch from '../components/m3/M3Switch.vue'

const EVENT_LABELS = {
  message_received: '老師訊息',
  announcement: '園所公告',
  event_ack_required: '事件待簽',
  fee_due: '學費到期',
  leave_result: '請假審核結果',
  attendance_alert: '出席異常',
}

// 通知類別 icon 圖示 → IvyKids tint 對應
// messages→tint-message / announcements→tint-announcement / events→tint-event
// medication（無本頁）/ fee→tint-money / leave→tint-leave / attendance→tint-pickup
const EVENT_TINT = {
  message_received:  'message',
  announcement:      'announcement',
  event_ack_required:'event',
  fee_due:           'money',
  leave_result:      'leave',
  attendance_alert:  'pickup',
}

const EVENT_ICON = {
  message_received:   '💬',
  announcement:       '📢',
  event_ack_required: '📅',
  fee_due:            '💰',
  leave_result:       '📋',
  attendance_alert:   '🔔',
}

const EVENT_HINTS = {
  message_received: '老師主動傳訊或回覆時通知',
  announcement: '園所發布新公告時通知',
  event_ack_required: '有事件需要您簽收時通知',
  fee_due: '學費到期前提醒',
  leave_result: '學生請假審核結果',
  attendance_alert: '孩子出席異常時提醒',
}

const prefs = ref({})
const loading = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await getNotificationPreferences()
    prefs.value = { ...data.prefs }
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function toggle(ev) {
  const newVal = !prefs.value[ev]
  prefs.value[ev] = newVal // 樂觀
  saving.value = true
  try {
    await updateNotificationPreferences({ [ev]: newVal })
  } catch (err) {
    prefs.value[ev] = !newVal
    toast.error(err?.displayMessage || '儲存失敗')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="prefs-view">
    <h2>LINE 通知偏好</h2>
    <p class="hint">關閉項目後，園所雖仍會在 App 內保留通知，但不再透過 LINE 推播。</p>

    <template v-if="loading">
      <SkeletonBlock variant="card" :count="2" />
    </template>
    <div v-else class="list">
      <label
        v-for="(label, ev) in EVENT_LABELS"
        :key="ev"
        class="row"
      >
        <span
          class="cat-icon"
          :data-tint="EVENT_TINT[ev]"
          :aria-hidden="true"
        >{{ EVENT_ICON[ev] }}</span>
        <div class="text">
          <strong>{{ label }}</strong>
          <span class="sub">{{ EVENT_HINTS[ev] }}</span>
        </div>
        <M3Switch
          :model-value="prefs[ev] !== false"
          :disabled="saving"
          :aria-label="label"
          @update:modelValue="toggle(ev)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.prefs-view { padding: 16px; }
h2 { margin: 0 0 6px; font-size: 18px; }
.hint { color: var(--pt-text-placeholder); font-size: 13px; margin-bottom: 16px; }
.list { background: var(--neutral-0); border-radius: 8px; overflow: hidden; }
.row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid var(--pt-surface-mute); cursor: pointer;
}
.row:last-child { border-bottom: none; }
.text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.text strong { font-size: 15px; color: var(--pt-text-strong); }
.sub { font-size: 12px; color: var(--pt-text-placeholder); }
/* 通知類別 icon dot — [data-tint] → IvyKids tint token */
.cat-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.cat-icon[data-tint='message']      { background: var(--pt-tint-message); }
.cat-icon[data-tint='announcement'] { background: var(--pt-tint-announcement); }
.cat-icon[data-tint='event']        { background: var(--pt-tint-event); }
.cat-icon[data-tint='money']        { background: var(--pt-tint-money); }
.cat-icon[data-tint='leave']        { background: var(--pt-tint-leave); }
.cat-icon[data-tint='pickup']       { background: var(--pt-tint-pickup); }
.cat-icon[data-tint='medication']   { background: var(--pt-tint-medication); }

/* toggle on bg → var(--brand-primary) */
input[type="checkbox"] {
  width: 44px; height: 24px; appearance: none; background: var(--pt-text-hint);
  border-radius: 12px; position: relative; cursor: pointer; transition: background .2s;
}
input[type="checkbox"]:checked { background: var(--brand-primary); }
input[type="checkbox"]::before {
  content: ''; width: 20px; height: 20px; background: var(--neutral-0);
  border-radius: 10px; position: absolute; top: 2px; left: 2px;
  transition: transform .2s;
}
input[type="checkbox"]:checked::before { transform: translateX(20px); }
</style>
