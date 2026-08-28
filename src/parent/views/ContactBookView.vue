<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { useAbortableFetch } from '../composables/useAbortableFetch'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import { getTodayContactBook, listContactBook } from '../api/contactBook'
import type { ContactBookEntry as CbEntry } from '../api/contactBook'
import { toast } from '../utils/toast'
import { useFriendlyError } from '@/composables/useFriendlyError'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { useIncrementalRender } from '../composables/useIncrementalRender'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import { flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import SectionHeader from '../components/SectionHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

import MonthDateStrip from '../components/contact-book/MonthDateStrip.vue'
import ContactBookDayCard from '../components/contact-book/ContactBookDayCard.vue'
import ContactBookListItem from '../components/contact-book/ContactBookListItem.vue'
import AnnouncementsPanel from '../components/announcements/AnnouncementsPanel.vue'
import { getUnreadCount as getAnnouncementUnreadCount } from '../api/announcements'

const router = useRouter()
const route = useRoute()
const childrenStore = useChildrenStore()
const { selectedId: selectedStudentId, ensureSelected } = useChildSelection()
const { getFriendly } = useFriendlyError()

// 切換小孩時舊 request 自動 abort，避免新舊小孩聯絡簿錯亂（P1-19）。
const { data: cbBundle, error: cbError, pending: loading, refresh: refreshCb } =
  useAbortableFetch(async (config) => {
    const sid = selectedStudentId.value
    if (!sid) return { today: null, entries: [] }
    const [todayRes, historyRes] = await Promise.all([
      getTodayContactBook(sid, config),
      listContactBook(sid, { limit: 60 }, config),
    ])
    return {
      today: (todayRes.data?.entry || null) as CbEntry | null,
      entries: (historyRes.data?.entries || []) as CbEntry[],
    }
  })
const today = computed(() => (cbBundle.value?.today as CbEntry | null) || null)
const history = computed(() => (cbBundle.value?.entries as CbEntry[]) || [])

const selectedChild = computed(() =>
  ((childrenStore.items || []) as { student_id: number; name?: string; classroom_name?: string }[]).find((x) => x.student_id === selectedStudentId.value) || null,
)
const studentName = computed(() => selectedChild.value?.name || '')
const classroomName = computed(() => selectedChild.value?.classroom_name || '')

const historyWithoutToday = computed(() => {
  const t = today.value
  if (!t) return history.value
  return history.value.filter((e) => e.id !== t.id)
})

const allEntries = computed(() => {
  const list: CbEntry[] = [...historyWithoutToday.value]
  if (today.value) list.unshift(today.value)
  return list
})

const groupedHistory = computed(() => {
  const groups: { thisWeek: CbEntry[]; lastWeek: CbEntry[]; earlier: CbEntry[] } = { thisWeek: [], lastWeek: [], earlier: [] }
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  const lastWeekStart = new Date(weekStart)
  lastWeekStart.setDate(weekStart.getDate() - 7)

  for (const e of historyWithoutToday.value) {
    if (!e?.log_date) continue
    const [y, m, d] = (e.log_date as string).split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    if (dt >= weekStart) groups.thisWeek.push(e)
    else if (dt >= lastWeekStart) groups.lastWeek.push(e)
    else groups.earlier.push(e)
  }
  return groups
})

const { visible: visibleEarlier, sentinelRef, hasMore } = useIncrementalRender(
  computed(() => groupedHistory.value.earlier) as unknown as import('vue').Ref<unknown[]>,
  { pageSize: 20 },
)
const visibleEarlierTyped = computed(() => visibleEarlier.value as CbEntry[])

async function fetchAll() {
  if (!selectedStudentId.value) return
  try {
    await refreshCb()
  } catch {
    /* error 由 watch 統一彈 toast */
  }
}

watch(cbError, (err) => {
  if (!err) return
  // 接 BusinessError envelope（STUDENT_NOT_LINKED_TO_PARENT / PORTAL_DATA_UNAVAILABLE /
  // CONTACT_BOOK_NOT_PUBLISHED 等）；組 message + nextStep 字串給 toast 顯示
  const friendly = getFriendly(err)
  const text = friendly.nextStep
    ? `${friendly.message}｜${friendly.nextStep}`
    : friendly.message
  if (friendly.level === 'info') toast.info(text)
  else if (friendly.level === 'warning') toast.warn(text)
  else toast.error(text)
})

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  // 列表頁進入時嘗試 flush 積壓的 ACK/REPLY ops（detail view 亦會 flush，此為額外保險）
  flushParentQueue(OP_KINDS.CONTACT_BOOK_ACK).catch(() => {})
  flushParentQueue(OP_KINDS.CONTACT_BOOK_REPLY).catch(() => {})
})

watch(selectedStudentId, fetchAll, { immediate: true })

function entryHref(id: number | string) {
  return `/contact-book/${id}`
}

function onDateSelect(iso: string) {
  // P1-17：原本用 window.location.hash 強塞 URL 會觸發 vue-router 重新 resolve
  // 但不會走正常的路由 transition（也不會更新 navigation guards / scroll-restore），
  // 改用具名路由 + entryId param（router.js 註冊為 `:entryId`）。
  const e = allEntries.value.find((x) => x.log_date === iso)
  if (!e) return
  router.push({ name: 'parent-contact-book-detail', params: { entryId: e.id as string | number } })
}

const unreadCount = computed(() =>
  allEntries.value.filter((e) => !e.isRead).length,
)

const hasAnyHistory = computed(() => historyWithoutToday.value.length > 0)

// 當 fetch 失敗且完全沒有資料時，顯示 inline MobileErrorRetry（toast 仍保留）
const hasNoData = computed(() => !today.value && history.value.length === 0)

/* ── 上方分頁：聯絡簿 / 公告 ────────────────────────────────────────────
 * 訊息功能下架（2026-08-28）後，公告從原「訊息」tab 移進這裡當第二分頁。
 * 分頁狀態放 query 而非本地 ref：LINE 推播與返回鍵才能直接落在公告分頁。
 */
type CbTab = 'contact-book' | 'announcements'
const CB_TABS: { key: CbTab; label: string }[] = [
  { key: 'contact-book', label: '聯絡簿' },
  { key: 'announcements', label: '公告' },
]
const activeTab = computed<CbTab>(() =>
  route.query.tab === 'announcements' ? 'announcements' : 'contact-book',
)

function selectTab(tab: CbTab) {
  if (tab === activeTab.value) return
  const query = { ...route.query }
  if (tab === 'announcements') query.tab = 'announcements'
  else delete query.tab
  router.replace({ path: route.path, query })
}

// 公告未讀數。面板掛載時由它回報權威值；但使用者停在聯絡簿分頁時面板不掛載，
// 分頁標籤就永遠不會亮數字——所以這裡自己先取一次。
const announcementUnread = ref(0)
function onAnnouncementUnread(n: number) {
  announcementUnread.value = n
}
onMounted(async () => {
  if (activeTab.value === 'announcements') return
  try {
    const { data } = await getAnnouncementUnreadCount()
    announcementUnread.value = (data as Record<string, unknown>)?.unread_count as number || 0
  } catch { /* ignore：標籤數字是輔助資訊，抓不到就不顯示 */ }
})
</script>

<template>
  <div class="cb">
    <div class="cb-segments" role="tablist" aria-label="聯絡簿與公告">
      <button
        v-for="t in CB_TABS"
        :key="t.key"
        data-testid="cb-segment-tab"
        class="cb-segment"
        :class="{ active: activeTab === t.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === t.key"
        @click="selectTab(t.key)"
      >
        {{ t.label }}
        <span
          v-if="t.key === 'announcements' && announcementUnread > 0"
          class="cb-segment-badge"
        >{{ announcementUnread }}</span>
      </button>
    </div>

    <AnnouncementsPanel
      v-if="activeTab === 'announcements'"
      @unread-change="onAnnouncementUnread"
    />

    <template v-else>
      <ChildContextHeader variant="page" />

      <MonthDateStrip
        :entries="allEntries"
        :selected-date="today?.log_date"
        @select="onDateSelect"
      />

      <template v-if="loading && !today">
        <div class="skeleton-wrap">
          <SkeletonBlock variant="card" :count="2" />
        </div>
      </template>

      <MobileErrorRetry
        v-else-if="cbError && hasNoData"
        :error="cbError as Error"
        @retry="fetchAll"
      />

      <template v-else>
        <section class="today-section">
          <SectionHeader title="今日聯絡簿">
            <template v-if="unreadCount > 0" #action>
              <StatusPill :label="`${unreadCount} 則未讀`" tone="info" />
            </template>
          </SectionHeader>
          <router-link
            v-if="today"
            :to="entryHref(today.id)"
            class="today-card"
          >
            <ContactBookDayCard
              :entry="today"
              :student-name="studentName"
              :classroom-name="classroomName"
            />
          </router-link>
          <EmptyState
            v-else
            variant="mobile"
            :icon="KawaiiStar"
            :title="studentName ? `${studentName} 今天還沒有聯絡簿` : '尚未選擇子女'"
            description="老師完成今日紀錄後會出現在這裡"
          />
        </section>

        <section v-if="hasAnyHistory" class="history-section">
          <SectionHeader title="之前的紀錄" />

          <div v-if="groupedHistory.thisWeek.length" class="group">
            <p class="group-title">本週</p>
            <div class="group-list">
              <router-link
                v-for="e in groupedHistory.thisWeek"
                :key="e.id"
                :to="entryHref(e.id)"
                class="history-card"
              >
                <ContactBookListItem :entry="e" />
              </router-link>
            </div>
          </div>

          <div v-if="groupedHistory.lastWeek.length" class="group">
            <p class="group-title">上週</p>
            <div class="group-list">
              <router-link
                v-for="e in groupedHistory.lastWeek"
                :key="e.id"
                :to="entryHref(e.id)"
                class="history-card"
              >
                <ContactBookListItem :entry="e" />
              </router-link>
            </div>
          </div>

          <div v-if="groupedHistory.earlier.length" class="group">
            <p class="group-title">更早</p>
            <div class="group-list">
              <router-link
                v-for="e in visibleEarlierTyped"
                :key="e.id"
                :to="entryHref(e.id)"
                class="history-card"
              >
                <ContactBookListItem :entry="e" />
              </router-link>
            </div>
            <div v-if="hasMore" ref="sentinelRef" class="render-sentinel" aria-hidden="true" />
          </div>
        </section>

        <EmptyState
          v-else-if="today"
          variant="mobile"
          :icon="KawaiiStar"
          title="還沒有歷史紀錄"
          description="連續紀錄會慢慢累積出孩子的成長故事"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.cb {
  padding: 0 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.skeleton-wrap { padding: var(--space-2) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2, 8px); }

/* 上方分頁（聯絡簿 / 公告） */
.cb-segments {
  display: flex;
  gap: var(--space-1, 4px);
  padding: var(--space-2) var(--space-4) 0;
}
.cb-segment {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: var(--radius-full, 999px);
  background: var(--pt-surface-card, #fff);
  color: var(--pt-text-body, #4b5563);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.cb-segment.active {
  background: var(--brand-primary, #0d9053);
  border-color: var(--brand-primary, #0d9053);
  color: #fff;
}
.cb-segment:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}
.cb-segment-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--coral-500, #ff8b8b);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  font-weight: var(--font-weight-bold, 700);
}
.cb-segment.active .cb-segment-badge {
  background: #fff;
  color: var(--brand-primary, #0d9053);
}

@media (prefers-reduced-motion: reduce) {
  .cb-segment { transition: none; }
}
.render-sentinel { height: 1px; }

.today-section { padding: 0 var(--space-4); }
.today-card {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.today-card:active { transform: scale(0.99); }
.today-card:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 3px;
  border-radius: var(--radius-2xl);
}

.history-section { margin-top: var(--space-2); }
.group { margin-top: var(--space-2); }
.group-title {
  margin: 0 var(--space-4) var(--space-1);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--pt-text-faint);
}
.group-list {
  background: var(--pt-surface-card, #fff);
  border-radius: var(--radius-xl);
  margin: 0 var(--space-4);
  overflow: hidden;
  border: 1px solid var(--pt-border-light, #ecf5f9);
}
.group-list .history-card:last-child :deep(.item) {
  border-bottom: none;
}

.history-card {
  display: block;
  text-decoration: none;
  color: inherit;
}
.history-card:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .today-card { transition: none; }
}
</style>
