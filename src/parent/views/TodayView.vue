<script setup lang="ts">
/**
 * 家長首頁。
 *
 * 2026-10-08 改版（方向 A＋C，三方向預覽稿見 docs/mockups/2026-10-08-parent-uiux-directions.html）：
 * 每位孩子一張狀態卡（ChildTodayCard），多寶家庭直接並列，不必先切換才看得到
 * 另一個孩子今天的狀態。原本分三處的孩子資訊——HomeHeroHeader 的照片＋姓名、
 * ChildContextHeader 切換器、底部 ChildrenStrip（生日、在籍狀態、進孩子檔案）——
 * 與 QuickActionsBar 的聯絡簿大按鈕＋出席 pill，全部收進狀態卡。
 *
 * 版面由上而下：問候列（含公告鈴鐺）→ 孩子狀態卡 → 常用功能 → 校園公告卡 →
 * 待辦清單（HomeTodoList）→ 娃娃車列（HomeBusRow）→ 今日動態 → 行事曆。
 * 後四者沿用 2026-09-02／09-08 首頁改版的元件，本次未改動。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
import { useHomeSummary } from '../composables/useHomeSummary'
import { useTodayStatusCache } from '../composables/useTodayStatusCache'
import { useTodayTimeline } from '../composables/useTodayTimeline'
import { useChildSelection } from '../composables/useChildSelection'
import { childTodayStatus, type TodayChildLike } from '../utils/childTodayStatus'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import TodayTimeline from '../components/home-timeline/TodayTimeline.vue'
import SectionHeader from '../components/SectionHeader.vue'
import HomeHeroHeader from '../components/home/HomeHeroHeader.vue'
import ChildTodayCard from '../components/home/ChildTodayCard.vue'
import QuickActionsBar from '../components/home/QuickActionsBar.vue'
import AnnouncementsHomeCard from '../components/home/AnnouncementsHomeCard.vue'
import HomeTodoList from '../components/home/HomeTodoList.vue'
import HomeBusRow from '../components/home/HomeBusRow.vue'

interface HomeChild {
  student_id: number
  name?: string
  classroom_name?: string | null
  birthday?: string | null
  lifecycle_status?: string | null
}

type TodayChild = TodayChildLike & {
  student_id?: number
  medication?: { has_order?: boolean; order_count?: number } | null
}

const router = useRouter()
const { ensureSelected, setSelected } = useChildSelection()

const { status: todayStatus, refresh: refreshToday } = useTodayStatusCache()
const todayChildren = computed(
  () => ((todayStatus.value as { children?: Record<string, unknown>[] } | null)?.children || []),
)

const {
  data: summaryData,
  error: summaryError,
  pending: summaryPending,
  refresh: refreshSummary,
  summary,
  badges,
} = useHomeSummary()

const children = computed<HomeChild[]>(
  () => (summaryData.value as { children?: HomeChild[] } | null)?.children || [], // TODO(ts-strict): waiting on backend response_model
)

/**
 * 「尚未綁定子女」須依 home-summary 的權威子女清單判定，而非 today-status：
 * today-status 可能因放假或尚未載入而為空，若據此判空，有綁定子女的家長會
 * 被誤顯示「尚未綁定子女」。
 */
const isUnbound = computed<boolean>(() => !!summaryData.value && children.value.length === 0)

function todayOf(studentId: number): TodayChild | null {
  return (todayChildren.value.find((c) => (c as TodayChild).student_id === studentId) as TodayChild) || null
}

/**
 * 每位孩子的今日聯絡簿。多寶家庭各打一支（N 通常 ≤3），以 generation 比對只套用
 * 最新一輪的結果：下拉刷新與子女清單變動可能重疊觸發，較舊一輪的慢回應不得蓋掉
 * 新的（沿用改版前單一孩子 seq guard 的做法，見 composables/useAbortableFetch.ts）。
 */
const contactBooks = ref<Record<number, ContactBookEntry | null>>({})
let contactBookGeneration = 0

async function loadContactBooks(): Promise<void> {
  const ids = children.value.map((c) => c.student_id).filter((id) => !!id)
  const generation = ++contactBookGeneration
  if (ids.length === 0) {
    contactBooks.value = {}
    return
  }
  const results = await Promise.all(
    ids.map(async (sid) => {
      try {
        const res = await getTodayContactBook(sid)
        return [sid, res.data?.entry || null] as const
      } catch {
        return [sid, null] as const
      }
    }),
  )
  if (generation !== contactBookGeneration) return
  contactBooks.value = Object.fromEntries(results)
}

// immediate：useCachedAsync cache-hit 時 children 從一開始就有值（P1-16）
const childIdsKey = computed(() => children.value.map((c) => c.student_id).join(','))
watch(
  childIdsKey,
  () => {
    // 常用功能裡「孩子檔案／成長報告…」等模組仍依「目前選定的孩子」導覽
    ensureSelected(children.value)
    loadContactBooks()
  },
  { immediate: true },
)

function contactBookHref(sid: number): string {
  const entry = contactBooks.value[sid]
  return entry ? `/contact-book/${entry.id}` : '/contact-book'
}

/** 聯絡簿三態文案：有紀錄／請假或放假／老師還沒寫 */
function contactBookSub(sid: number): string {
  const entry = contactBooks.value[sid]
  if (entry) return entry.isRead ? '查看今天的完整紀錄' : '老師寫好了，點開看看'
  const reason = childTodayStatus(todayOf(sid)).noRecordReason
  if (reason === '請假') return '今天請假，暫無紀錄'
  if (reason === '放假') return '今天放假，暫無紀錄'
  return '老師還沒有寫今天的紀錄'
}

function contactBookUnread(sid: number): boolean {
  const entry = contactBooks.value[sid]
  return !!entry && !entry.isRead
}

function openChild(sid: number): void {
  setSelected(sid)
  router.push(`/children/${sid}`)
}

const { buckets } = useTodayTimeline({ summary, todayChildren })

// 娃娃車兩格在 HomeBusRow（2026-09-02），它自己 onMounted 抓資料；
// 下拉刷新與錯誤重試要一併帶到它，故透過 defineExpose 的 reload 呼叫。
const busRow = ref<{ reload: () => Promise<void> } | null>(null)

onMounted(() => {
  refreshToday()
})

async function pullRefresh(): Promise<void> {
  await Promise.all([
    refreshSummary(true),
    refreshToday(),
    loadContactBooks(),
    busRow.value?.reload() ?? Promise.resolve(),
  ])
}

function refresh(): void {
  void pullRefresh()
}

function go(path: string): void {
  router.push(path)
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="today-view">
    <HomeHeroHeader
      :unread-announcements="badges.unreadAnnouncements"
      @open-announcements="go('/announcements')"
    />

    <div v-if="summaryPending && !summaryData" class="today-section skeleton-wrap">
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="card" />
    </div>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="refresh"
    />

    <!--
      刻意不用共用的 @/components/common/EmptyState：那支沒被 pin 進 vite.config
      的 shared-common，落在 admin-core chunk。首頁是家長端 entry 的首屏，靜態
      import 它會把整包 admin-core 拖進首屏（check-entry-chunks gate 會擋 build）。
    -->
    <section v-else-if="isUnbound" class="today-section">
      <div class="unbound">
        <p class="unbound-title">尚未綁定子女</p>
        <p class="unbound-desc">綁定孩子後即可查看在園紀錄，也可請園所協助。</p>
        <router-link to="/bind-additional" class="pt-action-btn">綁定孩子</router-link>
      </div>
    </section>

    <section v-else class="today-section today-children" aria-label="孩子今天的狀態">
      <ChildTodayCard
        v-for="c in children"
        :key="c.student_id"
        :student-id="c.student_id"
        :name="c.name || ''"
        :classroom-name="c.classroom_name"
        :birthday="c.birthday"
        :lifecycle-status="c.lifecycle_status"
        :today="todayOf(c.student_id)"
        :contact-book-href="contactBookHref(c.student_id)"
        :contact-book-sub="contactBookSub(c.student_id)"
        :contact-book-unread="contactBookUnread(c.student_id)"
        @open="openChild"
        @select="setSelected"
      />
    </section>

    <QuickActionsBar v-if="children.length > 0" />

    <!--
      校園公告預覽卡（2026-09-08）：公告的首頁入口統一收斂到這裡（待辦清單不再
      重複列未讀公告）。
    -->
    <AnnouncementsHomeCard />

    <!-- 待辦清單（2026-09-02）：同一筆待辦在首頁只出現一次，資料來源為 useParentTodos。 -->
    <HomeTodoList />

    <HomeBusRow ref="busRow" />

    <section v-if="summaryData" class="today-section today-stream">
      <SectionHeader title="今日動態">
        <!--
          今日動態只講「今天」，更長的歷史在孩子檔案頁。單一孩子才給直達出口；
          多寶家庭由各自狀態卡進孩子檔案（避免連到「目前選定」的錯孩子）。
        -->
        <template v-if="children.length === 1" #action>
          <router-link :to="`/children/${children[0].student_id}`" class="cb-open">
            更多動態
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </router-link>
        </template>
      </SectionHeader>
      <TodayTimeline :buckets="buckets" @navigate="go" />
    </section>

    <footer class="today-footer">
      <router-link to="/calendar" class="today-footer-link">
        <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
        <span>行事曆</span>
        <span class="material-symbols-rounded today-footer-chevron" aria-hidden="true">chevron_right</span>
      </router-link>
    </footer>
  </PullToRefresh>
</template>

<style scoped>
.today-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.today-section { padding: 0 var(--space-4, 16px); }

.today-children {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

/* 尚未綁定子女（首屏不引入共用 EmptyState，見 template 註解） */
.unbound {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-8, 32px) var(--space-5, 20px);
  text-align: center;
  background: var(--cream, #fffcf2);
  border: 1px solid rgba(13, 144, 83, 0.12);
  border-radius: 20px;
}
.unbound-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.unbound-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--pt-text-muted);
}

.cb-open {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: var(--brand-primary, #0d9053);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-1, 4px) 0;
  text-decoration: none;
}
.cb-open .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}

.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.today-stream {
  padding-bottom: var(--space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.today-footer {
  padding: 0 var(--space-4, 16px) var(--space-12, 48px);
}
.today-footer-link {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px) var(--space-5, 20px);
  border-radius: 14px;
  background: var(--m3-surface-container, #ebefe8);
  color: var(--pt-text-strong, #2a2520);
  text-decoration: none;
  font-size: var(--text-base, 15px);
  font-weight: 600;
  transition: background-color 120ms ease;
}
.today-footer-link:hover {
  background: var(--m3-surface-container-high, #e1e8df);
}
.today-footer-link .material-symbols-rounded {
  font-size: 22px;
  color: var(--brand-primary, #0d9053);
  font-variation-settings: 'wght' 500;
}
.today-footer-chevron {
  margin-left: auto;
  font-size: 20px !important;
  color: var(--pt-text-muted, #6b5e54) !important;
}
</style>
