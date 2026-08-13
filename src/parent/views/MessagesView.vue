<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore } from '../stores/messages'
import { listAnnouncements, markRead } from '../api/announcements'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import { fmtTimeOrDate } from '../utils/datetime'
import MessagesSearchBar from '../components/messages/MessagesSearchBar.vue'
import AnnouncementDetailModal from '../components/announcements/AnnouncementDetailModal.vue'

interface Thread {
  id: number | string
  teacher_name?: string
  student_name?: string
  last_message_at?: string
  last_message_preview?: string
  unread_count: number
}

interface Announcement {
  id: number | string
  priority: string
  is_read: boolean
  created_at: string
  title: string
  content?: string
}

type InboxItem =
  | { kind: 'thread'; key: string; sortMs: number; data: Thread }
  | { kind: 'announce'; key: string; sortMs: number; data: Announcement }

const router = useRouter()
const messagesStore = useMessagesStore()

const announcements = ref<Announcement[]>([])
const announcementsLoaded = ref(false)
const loadError = ref(false)
const selectedAnnouncement = ref<Announcement | null>(null)
const detailOpen = computed({
  get: () => selectedAnnouncement.value !== null,
  set: (v) => { if (!v) selectedAnnouncement.value = null },
})

const threads = computed(() => (messagesStore.threads || []) as unknown as Thread[])

function parseMs(s: string | null | undefined): number {
  if (!s) return 0
  const v = Date.parse(s.replace(' ', 'T'))
  return Number.isFinite(v) ? v : 0
}

const inboxItems = computed<InboxItem[]>(() => {
  const out: InboxItem[] = []
  for (const t of threads.value) {
    out.push({
      kind: 'thread',
      key: `t-${t.id}`,
      sortMs: parseMs(t.last_message_at),
      data: t,
    })
  }
  for (const a of announcements.value) {
    out.push({
      kind: 'announce',
      key: `a-${a.id}`,
      sortMs: parseMs(a.created_at),
      data: a,
    })
  }
  return out.sort((x, y) => y.sortMs - x.sortMs)
})

const totalUnread = computed(() => {
  const t = threads.value.reduce((acc, x) => acc + (x.unread_count || 0), 0)
  const a = announcements.value.filter((x) => !x.is_read).length
  return t + a
})

const fullyLoaded = computed(() => messagesStore.threadsLoaded && announcementsLoaded.value)

async function fetchAnnouncements(): Promise<boolean> {
  try {
    const { data } = await listAnnouncements({ limit: 50 })
    announcements.value = ((data as { items?: Announcement[] })?.items || [])
    announcementsLoaded.value = true
    return true
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入公告失敗'))
    announcementsLoaded.value = true
    return false
  }
}

async function init() {
  loadError.value = false
  announcementsLoaded.value = false   // 重試時重設，確保 skeleton 重新顯示
  let threadsOk = true
  let announcementsOk = true

  await Promise.all([
    (async () => {
      try {
        await messagesStore.fetchThreads(true)
      } catch (err) {
        const e = err as Record<string, unknown>
        toast.error(String(e?.displayMessage || '載入訊息失敗'))
        threadsOk = false
      }
    })(),
    (async () => {
      announcementsOk = await fetchAnnouncements()
    })(),
  ])

  // 若兩者皆失敗且無任何已快取資料，顯示錯誤態
  if (!threadsOk && !announcementsOk && inboxItems.value.length === 0) {
    loadError.value = true
  }
}

function openThread(t: Thread) {
  router.push({ path: `/messages/${t.id}` })
}

async function openAnnounce(a: Announcement) {
  selectedAnnouncement.value = a
  if (!a.is_read) {
    try {
      await markRead(a.id as number)
      a.is_read = true
    } catch {
      /* ignore */
    }
  }
}

async function pullRefresh() {
  await init()
}

onMounted(init)
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="messages-view">
    <MessagesSearchBar />

    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">家校通訊</p>
      <h1 class="pt-page-hero-title">訊息與公告</h1>
      <p v-if="totalUnread > 0" class="pt-page-hero-note">
        有 <strong>{{ totalUnread }}</strong> 則尚未閱讀
      </p>
      <p v-else-if="inboxItems.length > 0" class="pt-page-hero-note">
        都看完了
      </p>
    </header>

    <template v-if="!fullyLoaded">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="row" :count="4" />
      </div>
    </template>

    <MobileErrorRetry
      v-else-if="loadError"
      fallback-message="載入訊息失敗，請稍後再試"
      @retry="init"
    />

    <EmptyState
      v-else-if="inboxItems.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      title="目前沒有訊息"
      description="老師或園所有新訊息時會出現在這裡"
    />

    <div v-else class="thread-list pt-list-group">
      <template v-for="item in inboxItems" :key="item.key">
        <!-- 老師私訊 -->
        <button
          v-if="item.kind === 'thread'"
          type="button"
          class="thread-row pt-list-row"
          :class="{ unread: item.data.unread_count > 0 }"
          @click="openThread(item.data)"
        >
          <div class="avatar avatar-teacher" aria-hidden="true">
            {{ (item.data.teacher_name || '老師').slice(0, 1) }}
          </div>
          <div class="pt-list-row-body">
            <div class="row1">
              <strong>{{ item.data.teacher_name || '老師' }}</strong>
              <span class="time">{{ fmtTimeOrDate(item.data.last_message_at) }}</span>
            </div>
            <div class="row2">
              <span class="student">{{ item.data.student_name }}</span>
              <span class="preview">{{ item.data.last_message_preview || '尚無訊息' }}</span>
            </div>
          </div>
          <span
            v-if="item.data.unread_count > 0"
            class="badge"
            :aria-label="`${item.data.unread_count} 則未讀`"
          >
            {{ item.data.unread_count }}
          </span>
        </button>

        <!-- 公告 -->
        <button
          v-else
          type="button"
          class="thread-row pt-list-row announce-row"
          :class="{ unread: !item.data.is_read }"
          @click="openAnnounce(item.data)"
        >
          <div class="avatar avatar-announce" aria-hidden="true">
            <span class="material-symbols-rounded">campaign</span>
          </div>
          <div class="pt-list-row-body">
            <div class="row1">
              <strong>{{ item.data.title }}</strong>
              <span class="time">{{ fmtTimeOrDate(item.data.created_at) }}</span>
            </div>
            <div class="row2">
              <span class="tag-broadcast">全班</span>
              <span class="preview">{{ item.data.content || '園所公告' }}</span>
            </div>
          </div>
          <span v-if="!item.data.is_read" class="unread-dot" aria-label="未讀" />
        </button>
      </template>
    </div>

    <AnnouncementDetailModal v-model="detailOpen" :announcement="selectedAnnouncement" />
  </PullToRefresh>
</template>

<style scoped>
.messages-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 8px; }

.thread-list {
  display: flex;
  flex-direction: column;
}
.thread-row {
  background: transparent;
  border: none;
  width: 100%;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
}
.thread-row.unread {
  background: linear-gradient(90deg, var(--cream, #fffcf2) 0%, var(--pt-surface-card, #fff) 70%);
}

.avatar {
  width: 44px; height: 44px;
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 17px;
  flex-shrink: 0;
}
.avatar-teacher {
  background: var(--leaf-100, #dcf4e6);
  color: var(--brand-primary, #0d9053);
}
.avatar-announce {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.avatar-announce .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: 'wght' 500;
}

.row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.row1 strong {
  color: var(--pt-text-strong);
  font-size: 15px;
  font-weight: 700;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.thread-row.unread .row1 strong { font-weight: 800; }
.time {
  color: var(--pt-text-faint);
  font-size: 12px;
  flex-shrink: 0;
}
.row2 {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 2px;
  font-size: 13px;
}
.student {
  display: inline-flex;
  padding: 1px 7px;
  background: var(--sun-100, #fff4c9);
  color: var(--sun-700, #c99500);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.tag-broadcast {
  display: inline-flex;
  padding: 1px 7px;
  background: var(--m3-tertiary-container, #cfe5ec);
  color: var(--m3-on-tertiary-container, #001f26);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.preview {
  color: var(--pt-text-muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thread-row.unread .preview { color: var(--pt-text-strong); font-weight: 500; }

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  background: var(--m3-error, #ba1a1a); /* coral-500 配白字僅 2.25:1 */
  color: var(--m3-on-error, #fff);
  font-size: 11px;
  font-weight: 700;
  border-radius: 11px;
  flex-shrink: 0;
}
.unread-dot {
  width: 9px;
  height: 9px;
  background: var(--coral-500, #ff8b8b);
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
