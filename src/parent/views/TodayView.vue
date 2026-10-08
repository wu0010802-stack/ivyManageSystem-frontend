<script setup lang="ts">
/**
 * 家長首頁（2026-10-08 改版，方向 A「今日儀表＋待辦收件匣」＋方向 C 的
 * 「多寶並列」與白話命名；三方向預覽稿見 docs/mockups/2026-10-08-parent-uiux-directions.html）。
 *
 * 首頁只回答兩件事：
 *  1. 孩子現在好不好 → 每位孩子一張狀態卡（ChildTodayCard），多寶直接並列
 *  2. 我有什麼要處理 → 「待你處理」單一清單（utils/pendingItems.ts）
 * 其餘依序是「進行中」（娃娃車、臨時接送授權）、常用功能、今日動態。
 *
 * 改版前待辦散在頂部 banner×2、Bento 小卡、今日動態「晚一些」桶與 tab 徽章
 * 四種容器，同一筆待簽最多出現三次；多寶切換也分在頂部 ChildContextHeader
 * 與底部 ChildrenStrip 兩處。這些容器已全部收斂掉。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
import { getBusToday } from '../api/bus'
import { useTodayStatusCache } from '../composables/useTodayStatusCache'
import { useTodayTimeline } from '../composables/useTodayTimeline'
import { useChildSelection } from '../composables/useChildSelection'
import { usePendingItems } from '../composables/usePendingItems'
import { childTodayStatus, type TodayChildLike } from '../utils/childTodayStatus'
import { PARENT_SERVICES } from '../utils/parentServices'
import type { PendingItem } from '../utils/pendingItems'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import SectionHeader from '../components/SectionHeader.vue'
import TodayTimeline from '../components/home-timeline/TodayTimeline.vue'
import PushCta from '../components/home/PushCta.vue'
import HomeHeroHeader from '../components/home/HomeHeroHeader.vue'
import ChildTodayCard from '../components/home/ChildTodayCard.vue'
import PendingInbox from '../components/home/PendingInbox.vue'
import QuickActionsBar from '../components/home/QuickActionsBar.vue'

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
  items: pendingItems,
  pickupActiveCount,
  refreshAll: refreshPending,
} = usePendingItems()

const homeData = computed(
  () => summaryData.value as { me?: { can_push?: boolean } | null; children?: HomeChild[] } | null, // TODO(ts-strict): waiting on backend response_model
)
const children = computed<HomeChild[]>(() => homeData.value?.children || [])
const showPushCta = computed(() => !!homeData.value?.me && !homeData.value.me.can_push)

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

// 娃娃車：只在班次進行中才出現在「進行中」。首頁刻意**不**用 useBusTracking——
// 那支 composable 會開 WebSocket，掛在首頁等於每位家長一進 App 就多一條長連線；
// 這裡只要一次性快照，即時位置留給 /bus 頁。
// 隱私：回應含 stop_lat / stop_lng（＝家庭住址），只取用得到的兩個欄位，座標不進
// 首頁任何狀態。
const busInfo = ref<{ stopStatus: string; stopsAhead: number } | null>(null)

// request-sequence guard：下拉刷新與重試可能重疊觸發 loadBusToday，較舊的回應
// 可能晚到覆蓋較新的回應，讓「還有 N 站」短暫顯示過期資訊。只套用最新一次呼叫
// 的結果，較舊的回應（含錯誤）一律丟棄。
let busSeq = 0

async function loadBusToday(): Promise<void> {
  const mySeq = ++busSeq
  try {
    const res = await getBusToday()
    if (mySeq !== busSeq) return
    const data = res.data as {
      trip?: { status?: string } | null
      children?: { stop_status?: string; stops_ahead?: number }[]
    } | null // TODO(ts-strict): 待 gen:api 產出 /parent/bus/today 型別後改用 AxiosResp
    const child = data?.trip?.status === 'in_progress' ? data.children?.[0] : null
    busInfo.value = child
      ? { stopStatus: child.stop_status ?? 'pending', stopsAhead: child.stops_ahead ?? 0 }
      : null
  } catch {
    if (mySeq !== busSeq) return
    // 娃娃車失敗不擋首頁其他區塊（真正需要誠實降級的是 /bus 頁）
    busInfo.value = null
  }
}

/** 「進行中」：不是待辦、但今天正在發生、家長會想點進去看的事 */
const liveItems = computed<PendingItem[]>(() => {
  const out: PendingItem[] = []
  if (busInfo.value) {
    out.push({
      key: 'bus',
      title: PARENT_SERVICES.bus.label,
      detail: busInfo.value.stopStatus === 'pending'
        ? `班次進行中，還有 ${busInfo.value.stopsAhead} 站`
        : '班次進行中',
      icon: PARENT_SERVICES.bus.icon,
      tone: 'info',
      path: PARENT_SERVICES.bus.route,
      count: 0,
    })
  }
  if (pickupActiveCount.value > 0) {
    out.push({
      key: 'pickupAuth',
      title: PARENT_SERVICES.proxy.label,
      detail: `${pickupActiveCount.value} 筆授權進行中`,
      icon: PARENT_SERVICES.proxy.icon,
      tone: 'info',
      path: PARENT_SERVICES.proxy.route,
      count: 0,
    })
  }
  return out
})

const { buckets } = useTodayTimeline({ todayChildren })

onMounted(() => {
  refreshToday()
  loadBusToday()
})

async function pullRefresh(): Promise<void> {
  await Promise.all([refreshPending(true), refreshToday(), loadContactBooks(), loadBusToday()])
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
    <HomeHeroHeader />

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
    <template v-else-if="isUnbound">
      <section class="today-section">
        <div class="unbound">
          <p class="unbound-title">尚未綁定子女</p>
          <p class="unbound-desc">可到「我的」頁加綁子女，或請園所協助。</p>
          <router-link to="/bind-additional" class="unbound-cta">加綁子女</router-link>
        </div>
      </section>
      <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />
    </template>

    <template v-else>
      <section class="today-section today-children" aria-label="孩子今天的狀態">
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

      <PendingInbox v-if="liveItems.length" class="today-section" title="進行中" :items="liveItems" />

      <PendingInbox
        class="today-section"
        title="待你處理"
        :items="pendingItems"
        :limit="3"
        more-to="/admin"
        empty-text="目前沒有要處理的事"
      />

      <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

      <QuickActionsBar />

      <section class="today-section today-stream">
        <SectionHeader title="今日動態">
          <!-- 單一孩子才給直達出口；多寶家庭由各自狀態卡進孩子檔案（避免連到「目前選定」的錯孩子） -->
          <template v-if="children.length === 1" #action>
            <router-link :to="`/children/${children[0].student_id}`" class="cb-open">
              成長時間軸
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </router-link>
          </template>
        </SectionHeader>
        <TodayTimeline :buckets="buckets" @navigate="go" />
      </section>
    </template>
  </PullToRefresh>
</template>

<style scoped>
.today-view :deep(.ptr-content) {
  --today-accent: var(--m3-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
  padding-bottom: var(--space-8, 32px);
}

.today-section { padding: 0 var(--space-4, 16px); }

.today-children {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

/* 尚未綁定子女（首屏不引入共用 EmptyState，見 template 註解） */
.unbound {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-8, 32px) var(--space-5, 20px);
  text-align: center;
  border-radius: 20px;
  background: var(--pt-surface-card);
}
.unbound-title { margin: 0; font-size: 17px; font-weight: 700; }
.unbound-desc { margin: 0; font-size: 14px; line-height: 1.65; opacity: 0.78; }
.unbound-cta {
  margin-top: var(--space-2, 8px);
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-5, 20px);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  background: var(--today-accent);
  color: var(--pt-on-accent);
}

.today-stream {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.cb-open {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: var(--touch-target-min, 44px);
  color: var(--today-accent);
  font-size: var(--text-sm, 13px);
  font-weight: 700;
  text-decoration: none;
}
.cb-open .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}
</style>
