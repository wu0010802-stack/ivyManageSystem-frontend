<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../api/notifications'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import M3Switch from '../components/m3/M3Switch.vue'

const EVENT_LABELS: Record<string, string> = {
  message_received: '老師訊息',
  announcement: '園所公告',
  event_ack_required: '事件待簽',
  fee_due: '學費到期',
  leave_result: '請假審核結果',
  attendance_alert: '出席異常',
  'bus.approaching': '娃娃車快到提醒',
}

const EVENT_META: Record<string, { icon: string; tone: string }> = {
  message_received:   { icon: 'chat_bubble',  tone: 'leaf' },
  announcement:       { icon: 'campaign',     tone: 'coral' },
  event_ack_required: { icon: 'event',        tone: 'grape' },
  fee_due:            { icon: 'payments',     tone: 'sun' },
  leave_result:       { icon: 'event_busy',   tone: 'sky' },
  attendance_alert:   { icon: 'notifications', tone: 'coral' },
  'bus.approaching':  { icon: 'directions_bus', tone: 'sky' },
}

const EVENT_HINTS: Record<string, string> = {
  message_received: '老師主動傳訊或回覆時通知',
  announcement: '園所發布新公告時通知',
  event_ack_required: '有事件需要您簽收時通知',
  fee_due: '學費到期前提醒',
  leave_result: '學生請假審核結果',
  attendance_alert: '孩子出席異常時提醒',
  'bus.approaching': '娃娃車即將抵達站牌時通知',
}

const prefs = ref<Record<string, boolean>>({})
const loading = ref(false)
// P2-FE-Parent-4：原本共用一個 `saving: ref(false)`，並發 toggle 任一鍵都
// 會 disable 全部 switch；改 Map 鎖到 key 級。Vue 3 對 Map 是 reactive
// collection（new Map 須直接 set/has，不是 prefs.value.{key}）。
const saving = ref<Map<string, boolean>>(new Map())
function isSaving(ev: string) { return saving.value.has(ev) }

async function load() {
  loading.value = true
  try {
    const { data } = await getNotificationPreferences()
    prefs.value = { ...(data as { prefs?: Record<string, boolean> }).prefs }
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function toggle(ev: string) {
  if (saving.value.has(ev)) return // 同 key 仍在處理 → ignore
  const newVal = !prefs.value[ev]
  prefs.value[ev] = newVal
  saving.value.set(ev, true)
  try {
    await updateNotificationPreferences({ [ev]: newVal })
  } catch (err) {
    prefs.value[ev] = !newVal
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '儲存失敗'))
  } finally {
    saving.value.delete(ev)
  }
}

onMounted(load)
</script>

<template>
  <div class="prefs-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">LINE 通知偏好</p>
      <h1 class="pt-page-hero-title">想收到哪些訊息？</h1>
      <p class="pt-page-hero-note">關閉項目後，園所雖仍會在 App 內保留通知，但不再透過 LINE 推播。</p>
    </header>

    <template v-if="loading">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="2" />
      </div>
    </template>
    <div v-else class="pt-list-group">
      <label
        v-for="(label, ev) in EVENT_LABELS"
        :key="ev"
        class="pt-list-row row"
      >
        <span class="cat-icon" :class="`tone-${EVENT_META[ev]?.tone || 'leaf'}`" aria-hidden="true">
          <span class="material-symbols-rounded">{{ EVENT_META[ev]?.icon || 'notifications' }}</span>
        </span>
        <div class="pt-list-row-body">
          <strong class="row-label">{{ label }}</strong>
          <p class="row-sub">{{ EVENT_HINTS[ev] }}</p>
        </div>
        <M3Switch
          :model-value="prefs[ev] !== false"
          :disabled="isSaving(ev)"
          :aria-label="label"
          @update:modelValue="toggle(ev)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.prefs-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }

.row { cursor: pointer; }
.cat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cat-icon .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.cat-icon.tone-leaf  { background: var(--leaf-100, #dcf4e6);  color: var(--brand-primary, #0d9053); }
.cat-icon.tone-coral { background: var(--coral-100, #ffe3e0); color: var(--coral-700, #b14545); }
.cat-icon.tone-grape { background: var(--grape-100, #ebe0f5); color: var(--grape-700, #6e3f94); }
.cat-icon.tone-sun   { background: var(--sun-100, #fff4c9);   color: var(--sun-700, #c99500); }
.cat-icon.tone-sky   { background: var(--sky-100, #dceef5);   color: var(--sky-700, #2d6f8e); }

.row-label {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--pt-text-strong);
  line-height: 1.3;
}
.row-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--pt-text-muted);
  line-height: 1.45;
}
</style>
