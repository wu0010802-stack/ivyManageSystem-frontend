<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ackContactBook,
  deleteContactBookReply,
  getContactBookDetail,
  replyContactBook,
} from '../api/contactBook'
import type { ContactBookEntry as CbEntry } from '../api/contactBook'
import { useChildrenStore } from '../stores/children'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import MoodBadge from '../components/contact-book/MoodBadge.vue'
import TimelineRow from '../components/contact-book/TimelineRow.vue'
import PhotoGrid from '../components/contact-book/PhotoGrid.vue'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'

interface Reply {
  id: number | string
  body?: string
  created_at?: string
}

const route = useRoute()
// 子女資訊用於 hero 區的姓名/班級，缺 pinia 時 graceful（測試環境）。
let childrenStore: ReturnType<typeof useChildrenStore> | null = null
try {
  childrenStore = useChildrenStore()
} catch {
  childrenStore = null
}

const entryId = computed(() => Number(route.params.entryId))
const entry = ref<CbEntry | null>(null)
const replies = ref<Reply[]>([])
const newReply = ref('')
const removeReplyTarget = ref<number | string | null>(null)
const removeReplyOpen = computed({
  get: () => removeReplyTarget.value !== null,
  set: (v: boolean) => { if (!v) removeReplyTarget.value = null },
})
const loading = ref(false)
const submitting = ref(false)
const acking = ref(false)

const MOOD_LABEL: Record<string, string> = {
  happy: '開心', normal: '普通', tired: '想睡', sad: '難過', sick: '不舒服',
}
const BOWEL_LABEL: Record<string, string> = {
  none: '未排便', normal: '正常', loose: '稀', constipated: '硬',
}

const studentInfo = computed(() => {
  const items = ((childrenStore?.items || []) as { student_id: number; name?: string; classroom_name?: string }[])
  return items.find((c) => c.student_id === entry.value?.student_id) || null
})

const dateLine = computed(() => {
  const raw = entry.value?.log_date
  if (!raw) return ''
  const [y, m, d] = raw.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${y} 年 ${m} 月 ${d} 日　星期${wd}`
})

const timelineItems = computed(() => {
  const e = entry.value
  if (!e) return []
  const out: { type: string; icon: string; tone: string; label: string; value?: string; detail?: string }[] = []
  if (e.mood) {
    out.push({
      type: 'mood',
      icon: 'sentiment_satisfied',
      tone: 'sun',
      label: '今日心情',
      value: MOOD_LABEL[e.mood] || e.mood,
    })
  }
  if (e.meal_lunch != null || e.meal_snack != null) {
    const parts: string[] = []
    if (e.meal_lunch != null) parts.push(`午餐 ${e.meal_lunch} / 3 份`)
    if (e.meal_snack != null) parts.push(`點心 ${e.meal_snack} / 3 份`)
    out.push({
      type: 'meal',
      icon: 'restaurant',
      tone: 'coral',
      label: '飲食',
      value: parts.join('・'),
    })
  }
  if (e.nap_minutes != null) {
    out.push({
      type: 'nap',
      icon: 'bedtime',
      tone: 'grape',
      label: '午睡',
      value: `${e.nap_minutes} 分鐘`,
    })
  }
  if (e.temperature_c != null) {
    const t = Number(e.temperature_c)
    const note = t >= 37.5 ? '（偏高，老師會持續觀察）' : ''
    out.push({
      type: 'temp',
      icon: 'thermostat',
      tone: t >= 37.5 ? 'coral' : 'green',
      label: '體溫',
      value: `${t}°C ${note}`,
    })
  }
  if (e.bowel) {
    out.push({
      type: 'bowel',
      icon: 'water_drop',
      tone: 'sky',
      label: '排便',
      value: BOWEL_LABEL[e.bowel] || e.bowel,
    })
  }
  if (e.learning_highlight) {
    out.push({
      type: 'learning',
      icon: 'school',
      tone: 'green',
      label: '今天學到了',
      detail: e.learning_highlight,
    })
  }
  return out
})

async function fetchData() {
  // F6：reqId guard——目前 App.vue 的 `:key="route.fullPath"` 會讓 entryId
  // 改變時整棵元件樹強制 destroy+recreate，理論上 entryId 不會在同一元件實例
  // 內變兩次；但下方 watch(entryId) 仍在，補這個 guard 讓「若日後那道 app 級
  // 防線被移除」不會變成活的 race（較舊 entry 的慢回應蓋掉新 entry 畫面），
  // 樣板同 FeesView.vue 的 reqId pattern。
  const reqId = entryId.value
  loading.value = true
  try {
    const { data } = await getContactBookDetail(reqId)
    if (entryId.value !== reqId) return
    entry.value = data as CbEntry
    replies.value = ((data as CbEntry)?.replies as Reply[] | undefined) || []
  } catch (err) {
    if (entryId.value !== reqId) return
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    if (entryId.value === reqId) loading.value = false
  }
}

async function markAsRead() {
  if (acking.value) return
  acking.value = true

  if (!navigator.onLine) {
    try {
      await enqueueParent({
        kind: OP_KINDS.CONTACT_BOOK_ACK,
        payload: { entry_id: entryId.value },
        meta: { entry_id: entryId.value },
      })
      // 樂觀 UI
      if (entry.value) {
        entry.value.isRead = true
        entry.value.readAt = new Date().toISOString()
      }
      toast.success('已暫存，連線後自動送出')
      flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.error(String(e?.displayMessage || '暫存失敗，請稍後再試'))
    } finally {
      acking.value = false
    }
    return
  }

  try {
    const { data } = await ackContactBook(entryId.value)
    if (entry.value) {
      entry.value.readAt = data.readAt
      entry.value.isRead = true
    }
    // 已讀軌：成功不跳 toast（被動行為，與「已讀」語意一致）
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '標記失敗，請重試'))
  } finally {
    acking.value = false
  }
}

async function submitReply() {
  const body = newReply.value.trim()
  if (!body) return
  if (body.length > 500) {
    toast.warn('回覆不可超過 500 字')
    return
  }
  submitting.value = true

  if (!navigator.onLine) {
    try {
      await enqueueParent({
        kind: OP_KINDS.CONTACT_BOOK_REPLY,
        payload: { entry_id: entryId.value, body },
        meta: { entry_id: entryId.value, content_preview: body.slice(0, 20) },
      })
      // 樂觀 UI
      replies.value.push({ id: `pending-${Date.now()}`, body, created_at: new Date().toISOString() })
      newReply.value = ''
      toast.success('已暫存，連線後自動送出')
      flushParentQueue(OP_KINDS.CONTACT_BOOK_REPLY).catch(() => {})
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.error(String(e?.displayMessage || '暫存失敗'))
    } finally {
      submitting.value = false
    }
    return
  }

  try {
    const { data } = await replyContactBook(entryId.value, { body })
    replies.value.push(data as Reply)
    newReply.value = ''
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '送出失敗'))
  } finally {
    submitting.value = false
  }
}

function askRemoveReply(replyId: number | string) {
  removeReplyTarget.value = replyId
}

async function doRemoveReply() {
  const replyId = removeReplyTarget.value
  removeReplyTarget.value = null
  if (!replyId) return
  try {
    await deleteContactBookReply(entryId.value, Number(replyId))
    replies.value = replies.value.filter((r) => r.id !== replyId)
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '刪除失敗'))
  }
}

async function loadAndMark() {
  await fetchData()
  if (entry.value && !entry.value.isRead) {
    await markAsRead()
  }
}

onMounted(async () => {
  if (childrenStore?.load) {
    try {
      const p = childrenStore.load()
      if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => {})
    } catch {
      /* graceful — 缺 pinia 時不阻擋 detail 載入 */
    }
  }
  await loadAndMark()
  flushParentQueue(OP_KINDS.CONTACT_BOOK_REPLY).catch(() => {})
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
})

watch(entryId, async (newId, oldId) => {
  if (!newId || newId === oldId) return
  entry.value = null
  replies.value = []
  newReply.value = ''
  await loadAndMark()
})

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

function formatReplyTime(iso: string) {
  try {
    const d = new Date(iso)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round(diff / 86400000)
    const time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
    if (days === 0) return `今天 ${time}`
    if (days === 1) return `昨天 ${time}`
    if (days < 7) return `${days} 天前 ${time}`
    return d.toLocaleDateString('zh-TW') + ' ' + time
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="detail">
    <template v-if="loading && !entry">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="3" />
      </div>
    </template>

    <template v-else-if="entry">
      <!-- Hero：日期 + 名字 + 大心情徽章 -->
      <header class="hero">
        <p class="hero-date">{{ dateLine }}</p>
        <div class="hero-row">
          <MoodBadge :mood="entry.mood" size="lg" show-label />
          <div class="hero-meta">
            <h1 class="hero-name">{{ studentInfo?.name || '聯絡簿' }}</h1>
            <p v-if="studentInfo?.classroom_name" class="hero-class">{{ studentInfo.classroom_name }}</p>
          </div>
        </div>
      </header>

      <!-- 時間軸：一天的故事 -->
      <section v-if="timelineItems.length" class="card timeline-card">
        <h2 class="card-title">
          <span class="material-symbols-rounded" aria-hidden="true">timeline</span>
          今天的故事
        </h2>
        <div class="timeline">
          <TimelineRow
            v-for="(item, i) in timelineItems"
            :key="item.type"
            :icon="item.icon"
            :icon-tone="item.tone"
            :label="item.label"
            :value="item.value"
            :detail="item.detail"
            :hide-connector="i === timelineItems.length - 1 && !entry.teacher_note"
          />
        </div>
      </section>

      <!-- 老師留言：cream highlight 卡 -->
      <section v-if="entry.teacher_note" class="card note-card">
        <h2 class="card-title">
          <span class="material-symbols-rounded" aria-hidden="true">format_quote</span>
          老師留言
        </h2>
        <p class="note-body">{{ entry.teacher_note }}</p>
      </section>

      <!-- 照片牆 -->
      <section v-if="(entry.photos || []).length" class="card photos-card">
        <h2 class="card-title">
          <span class="material-symbols-rounded" aria-hidden="true">photo_library</span>
          今天的照片
          <span class="title-count">{{ (entry.photos || []).length }} 張</span>
        </h2>
        <PhotoGrid :photos="(entry.photos || []) as never[]" />
      </section>

      <!-- 已讀狀態 / 回覆 -->
      <section class="card replies-card">
        <header class="ack-bar">
          <div class="ack-status">
            <span v-if="entry.isRead" class="read-badge is-read">
              <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
              已讀 · {{ formatTime(entry.readAt) }}
            </span>
            <span v-else class="read-badge is-pending">
              <span class="material-symbols-rounded" aria-hidden="true">circle</span>
              尚未閱讀
            </span>
          </div>
          <button
            v-if="!entry.isRead"
            type="button"
            class="read-btn"
            :disabled="acking"
            @click="markAsRead"
          >
            標為已讀
          </button>
        </header>

        <h2 class="card-title with-divider">
          <span class="material-symbols-rounded" aria-hidden="true">forum</span>
          家長留言
          <span v-if="replies.length" class="title-count">{{ replies.length }} 則</span>
        </h2>

        <ul v-if="replies.length" class="replies">
          <li v-for="r in replies" :key="r.id" class="reply">
            <div class="reply-body">{{ r.body }}</div>
            <div class="reply-meta">
              <span>{{ formatReplyTime(r.created_at || '') }}</span>
              <button type="button" class="reply-delete link-btn" @click="askRemoveReply(r.id)">刪除</button>
            </div>
          </li>
        </ul>
        <p v-else class="reply-empty">
          給老師留個訊息，孩子的成長故事更完整
        </p>

        <div class="composer">
          <label for="reply-textarea" class="sr-only">回覆內容</label>
          <textarea
            id="reply-textarea"
            v-model="newReply"
            rows="2"
            placeholder="想跟老師說的話…（最多 500 字）"
            maxlength="500"
            autocomplete="off"
          />
          <div class="composer-bar">
            <span class="counter" :class="{ near: newReply.length > 450 }">{{ newReply.length }} / 500</span>
            <button
              type="button"
              class="send-btn"
              :disabled="submitting || !newReply.trim()"
              @click="submitReply"
            >
              <span class="material-symbols-rounded" aria-hidden="true">send</span>
              送出
            </button>
          </div>
        </div>
      </section>
    </template>

    <p v-else class="hint">找不到聯絡簿。</p>

    <ConfirmDialog
      v-model:open="removeReplyOpen"
      title="確定刪除這則留言？"
      message="刪除後無法還原。"
      confirm-label="刪除"
      destructive
      @confirm="doRemoveReply"
    />
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 0 32px;
}
.skeleton-wrap { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--pt-text-faint); text-align: center; padding: 32px 0; }

/* Hero */
.hero {
  padding: 16px 20px 18px;
  background:
    linear-gradient(135deg, var(--cream, #fffcf2) 0%, var(--leaf-100, #dcf4e6) 100%);
}
.hero-date {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--pt-text-muted);
  letter-spacing: 0.02em;
}
.hero-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.hero-meta { flex: 1; min-width: 0; }
.hero-name {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--pt-text-strong);
  line-height: 1.1;
}
.hero-class {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--pt-text-muted);
}

/* Card 通用 */
.card {
  margin: 0 16px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 18px;
  padding: 16px 18px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--pt-text-strong);
  letter-spacing: 0.01em;
}
.card-title .material-symbols-rounded {
  font-size: 20px;
  color: var(--brand-primary, #0d9053);
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.title-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--pt-text-faint);
  letter-spacing: 0.04em;
}
.card-title.with-divider {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}

/* Timeline */
.timeline {
  display: flex;
  flex-direction: column;
  margin-left: 4px;
}

/* 老師留言 */
.note-card {
  background:
    linear-gradient(180deg, var(--cream, #fffcf2) 0%, var(--pt-surface-card, #ffffff) 100%);
  border-color: var(--sun-300, #ffe285);
}
.note-card .card-title .material-symbols-rounded { color: var(--sun-700, #c99500); }
.note-body {
  margin: 0;
  font-size: 15px;
  line-height: 1.75;
  color: var(--pt-text-body);
  white-space: pre-wrap;
}

/* Replies / Ack */
.ack-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -4px 0 12px;
}
.read-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background-color 200ms ease, color 200ms ease;
}
.read-badge .material-symbols-rounded {
  font-size: 16px;
  font-variation-settings: 'FILL' 1, 'wght' 600;
}
.read-badge.is-read {
  background-color: var(--pt-color-success-bg, var(--leaf-100, #e8f5e9));
  color: var(--pt-color-success, var(--brand-primary, #2e7d32));
}
.read-badge.is-pending {
  background: var(--coral-100, #ffe3e0);
  color: var(--coral-700, #b14545);
}
.read-btn {
  background: var(--m3-primary, var(--brand-primary, #0d9053));
  color: var(--m3-on-primary, #fff);
  border: none;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, transform 120ms ease;
}
.read-btn:active { transform: scale(0.97); background: var(--brand-primary-hover, #0caf76); }
.read-btn:disabled { background: var(--brand-primary-soft); color: var(--pt-text-disabled); cursor: not-allowed; }

.replies {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reply {
  background: var(--cream, #fffcf2);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 14px;
  padding: 10px 14px;
}
.reply-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--pt-text-body);
  white-space: pre-wrap;
}
.reply-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: var(--pt-text-faint);
}
.reply-delete {
  background: none;
  border: none;
  color: var(--coral-700, #b14545);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}
.reply-empty {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--pt-text-faint);
  text-align: center;
  padding: 16px 0;
  font-style: italic;
}

.composer {
  margin-top: 12px;
  background: var(--pt-surface-mute-soft, #fefcf3);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 14px;
  padding: 10px 12px;
}
.composer textarea {
  width: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.55;
  color: var(--pt-text-body);
  resize: vertical;
  outline: none;
  min-height: 48px;
}
.composer textarea::placeholder { color: var(--pt-text-placeholder); }

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}
.counter {
  font-size: 12px;
  color: var(--pt-text-faint);
  letter-spacing: 0.02em;
}
.counter.near { color: var(--coral-700, #b14545); font-weight: 600; }
.send-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--m3-primary, var(--brand-primary, #0d9053));
  color: var(--m3-on-primary, #fff);
  border: none;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, transform 120ms ease;
}
.send-btn .material-symbols-rounded {
  font-size: 16px;
  font-variation-settings: 'FILL' 1, 'wght' 600;
}
.send-btn:active { transform: scale(0.97); background: var(--brand-primary-hover, #0caf76); }
.send-btn:disabled {
  background: var(--brand-primary-soft, #f5fbe6);
  color: var(--pt-text-disabled, #c4d2d9);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .read-badge, .read-btn, .send-btn { transition: none; }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
</style>
