<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ackContactBook,
  getContactBookDetail,
} from '../api/contactBook'
import type { ContactBookEntry as CbEntry } from '../api/contactBook'
import { useChildrenStore } from '../stores/children'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MoodBadge from '../components/contact-book/MoodBadge.vue'
import TimelineRow from '../components/contact-book/TimelineRow.vue'
import PhotoGrid from '../components/contact-book/PhotoGrid.vue'
import ReadStampButton from '../components/contact-book/ReadStampButton.vue'
import ContactBookHeroSparkle from '../components/illustrations/ContactBookHeroSparkle.vue'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import { isNetworkError } from '@/composables/useOnlineStatus'

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
const loading = ref(false)
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
  } catch (err) {
    if (entryId.value !== reqId) return
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    if (entryId.value === reqId) loading.value = false
  }
}

/**
 * 把「標記已讀」寫進離線佇列（含樂觀 UI）。
 * `!navigator.onLine` 的離線分流與「假線上」網路失敗的 fallback 共用這一條，
 * 兩條路徑的行為不得再分歧。
 */
async function queueAck() {
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
}

/**
 * 蓋章互動：一律由家長主動點擊觸發（2026-09-08 起不再進頁自動標記已讀）。
 * 「印章落下」動畫由 ReadStampButton 在點擊當下自行播放，與這裡的 ack request
 * 平行進行；動畫播放與已讀是否成功已解耦——徽章文字變紅是由 `entry.isRead`
 * 驅動，不是寫死的動畫時間點，所以無論 API 多快/多慢回應，蓋章落下後只要
 * ack 成功就會轉紅；若失敗則維持灰色並跳錯誤提示，可重新點擊。
 * entry.isRead 若進頁時已為 true（先前已讀過）不會播動畫，只顯示蓋完章的終態。
 */
async function markAsRead() {
  if (acking.value || entry.value?.isRead) return
  acking.value = true

  if (!navigator.onLine) {
    try {
      await queueAck()
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
    // 已讀軌：成功不跳 toast（被動行為，與「已讀」語意一致；視覺回饋交給蓋章動畫）
  } catch (err) {
    // navigator.onLine 會說謊（弱訊號、行動網路連著但打不到 server）：網路層失敗
    // 一律 fallback 進佇列，否則家長的操作直接遺失。非網路錯誤（4xx/5xx）維持原提示。
    if (isNetworkError(err)) {
      try {
        await queueAck()
        return
      } catch { /* 佇列也寫不進去 → 落回下方錯誤提示 */ }
    }
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '標記失敗，請重試'))
  } finally {
    acking.value = false
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
  await fetchData()
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
})

watch(entryId, async (newId, oldId) => {
  if (!newId || newId === oldId) return
  entry.value = null
  await fetchData()
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
        <ContactBookHeroSparkle class="hero-art" />
        <p class="hero-date">{{ dateLine }}</p>
        <div class="hero-row">
          <div class="mood-lg">
            <MoodBadge :mood="entry.mood" size="lg" />
          </div>
          <div class="hero-meta">
            <h1 class="hero-name">{{ studentInfo?.name || '聯絡簿' }}</h1>
            <p v-if="studentInfo?.classroom_name" class="hero-class">{{ studentInfo.classroom_name }}</p>
            <span v-if="entry.mood && MOOD_LABEL[entry.mood]" class="mood-tag">
              <span class="material-symbols-rounded" aria-hidden="true">sunny</span>
              今天心情：{{ MOOD_LABEL[entry.mood] }}
            </span>
          </div>
        </div>
      </header>

      <!-- 已讀狀態：印章蓋章互動，獨立呈現在 hero 下方（不再與家長留言共用卡片） -->
      <section class="read-stamp">
        <ReadStampButton
          :is-read="entry.isRead"
          :disabled="acking"
          @click="markAsRead"
        />
        <span v-if="entry.isRead" class="stamp-time">{{ formatTime(entry.readAt) }} 已讀</span>
        <span v-else class="stamp-hint">點一下蓋章確認已讀</span>
      </section>

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
    </template>

    <p v-else class="hint">找不到聯絡簿。</p>
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
  position: relative;
  padding: 16px 20px 18px;
  background: var(--pt-gradient-hero);
  border-radius: var(--pt-hero-radius, 30px);
  overflow: hidden;
}
.hero-art {
  position: absolute;
  right: 14px;
  top: 12px;
  opacity: 0.95;
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
.mood-lg {
  width: 76px;
  height: 76px;
  border-radius: 28px;
  flex-shrink: 0;
  background: var(--pt-surface-card, #fff);
  box-shadow: var(--pt-shadow-card);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mood-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  background: var(--pt-accent-sun-container);
  color: var(--pt-accent-sun-on);
  border-radius: 999px;
  padding: 4px 12px 4px 8px;
  font-size: 12.5px;
  font-weight: 800;
}
.mood-tag .material-symbols-rounded {
  font-size: 15px;
}
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

/* 已讀狀態：印章蓋章按鈕本體（含動畫）在 ReadStampButton.vue；這裡只負責
 * 版面。印章落下時會突出到上方 hero 之上，故拉高 stacking 讓它不被 hero 蓋住。 */
.read-stamp {
  position: relative;
  z-index: 1;
  margin: -4px 16px 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.stamp-time,
.stamp-hint {
  font-size: 12px;
  color: var(--pt-text-faint);
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
</style>
