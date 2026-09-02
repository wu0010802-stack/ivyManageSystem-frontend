<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { useTodayStatusCache } from '../composables/useTodayStatusCache'
import { useTodayTimeline } from '../composables/useTodayTimeline'
import { useChildSelection } from '../composables/useChildSelection'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import TodayTimeline from '../components/home-timeline/TodayTimeline.vue'
import PushCta from '../components/home/PushCta.vue'
import ChildrenStrip from '../components/home/ChildrenStrip.vue'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import SectionHeader from '../components/SectionHeader.vue'
import HomeHeroHeader from '../components/home/HomeHeroHeader.vue'
import QuickActionsBar from '../components/home/QuickActionsBar.vue'
import HomeTodoList from '../components/home/HomeTodoList.vue'
import HomeBusRow from '../components/home/HomeBusRow.vue'

const router = useRouter()
const { selectedId: selectedStudentId, ensureSelected, setSelected } = useChildSelection()

const { status: todayStatus, refresh: refreshToday } = useTodayStatusCache()
const todayStatusData = computed(() => todayStatus.value as { children?: Record<string, unknown>[] } | null)
const todayChildren = computed(() => todayStatusData.value?.children || [])

const {
  data: summaryData,
  error: summaryError,
  pending: summaryPending,
  refresh: refreshSummary,
} = useCachedAsync(
  'parent/today/summary',
  async () => {
    const res = await getHomeSummary()
    return res.data
  },
  { ttl: 60_000 },
)

const me = computed(() => summaryData.value?.me || null)
const children = computed(() => summaryData.value?.children || [])
const summary = computed(() => summaryData.value?.summary || null)
const showPushCta = computed(() => me.value && !me.value.can_push)
const selectedChild = computed(() => {
  const list: { student_id: number; name?: string; classroom_name?: string }[] = children.value || []
  return list.find((c) => c.student_id === selectedStudentId.value) || list[0] || null
})

const contactBookEntry = ref<ContactBookEntry | null>(null)
// request-sequence guard：切子女時，較舊 sid 的慢回應不得覆寫最新選中子女的
// 聯絡簿。原本的 `if (contactBookLoading.value) return` 方向錯誤——A 的請求還在
// 飛行中時切到 B，B 會被 loading-guard 丟棄且不重試，畫面卡在前一個孩子；A 慢
// 回來又把 A 蓋上。改以 seq 比對只套用「最新」請求的回應（見
// composables/useLatestSearch.ts、useAbortableFetch.ts 樣板），並以 in-flight sid
// 去重，保留 mount 時 onMounted 直呼 + ensureSelected 觸發 watch 會以「同 sid」
// 呼叫兩次卻只發一次請求的行為。
let contactBookSeq = 0
let contactBookInflightSid: number | null = null

async function loadContactBook(force = false) {
  const sid = selectedChild.value?.student_id
  if (!sid) {
    contactBookSeq++ // 使任何 in-flight 回應失效
    contactBookInflightSid = null
    contactBookEntry.value = null
    return
  }
  // 同一 sid 已在請求中 → 去重（mount 雙呼）；切到「不同」子女時不去重，
  // force（下拉刷新）一律重抓。
  if (!force && contactBookInflightSid === sid) return
  const mySeq = ++contactBookSeq
  contactBookInflightSid = sid
  try {
    const res = await getTodayContactBook(sid)
    if (mySeq !== contactBookSeq) return // 已有更新請求，丟棄此舊回應
    contactBookEntry.value = res.data?.entry || null
  } catch {
    if (mySeq !== contactBookSeq) return // 較舊請求的錯誤靜默忽略
    contactBookEntry.value = null
  } finally {
    if (mySeq === contactBookSeq) contactBookInflightSid = null
  }
}

onMounted(() => {
  refreshToday()
  // useCachedAsync cache-hit 時 children 從一開始就有值，下方 watch（無
  // immediate）不會 fire → 聯絡簿 hero card 永遠不會顯示。mount 時直接
  // ensureSelected + loadContactBook 涵蓋此 case（P1-16）。
  ensureSelected(children.value || [])
  loadContactBook()
})

watch(
  () => children.value?.length,
  () => {
    ensureSelected(children.value || [])
    loadContactBook()
  },
)
watch(selectedStudentId, () => loadContactBook())

const { buckets } = useTodayTimeline({ summary, todayChildren })

function isOffDay() {
  const d = new Date().getDay()
  return d === 0 || d === 6
}

function childStatusLabel(c: Record<string, unknown> | null | undefined) {
  if (!c) return isOffDay() ? '今天放假' : '尚未到校'
  const dismissal = c.dismissal as { status?: string } | null | undefined
  if (dismissal?.status === 'completed') return '已離園'
  const attendance = c.attendance as { status?: string } | null | undefined
  if (c.attendance) return attendance?.status || '在園中'
  if (c.leave) return '請假'
  return isOffDay() ? '今天放假' : '尚未到校'
}

function childStatusTone(label: string): 'ok' | 'warn' | 'danger' | 'neutral' | 'info' {
  if (label === '已入園' || label === '在園中' || label === '已離園') return 'ok'
  if (label === '請假') return 'info'
  if (label === '今天放假') return 'neutral'
  return 'neutral'
}

const selectedTodayChild = computed(() => {
  const tc = todayChildren.value || []
  return tc.find((c) => (c as { student_id?: number }).student_id === selectedStudentId.value) || null
})

/**
 * 「尚未綁定子女」須依 home-summary 的權威子女清單判定，而非 today-status：
 * today-status 可能因放假或尚未載入而為空，若據此判空，有綁定子女的家長會
 * 被誤顯示「尚未綁定子女」。
 */
const isUnbound = computed<boolean>(
  () => !!summaryData.value && (children.value || []).length === 0,
)

/** QuickActionsBar 聯絡簿大按鈕要顯示的出席狀態（單孩取唯一那位，多寶取選中那位）。 */
const heroStatus = computed<{ label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' }>(() => {
  const tc = todayChildren.value || []
  const target = tc.length === 1 ? tc[0] : selectedTodayChild.value
  const label = childStatusLabel(target)
  return { label, tone: childStatusTone(label) }
})

/**
 * 聯絡簿三態，決定 contactBookSub 的文案該講什麼。原本另外驅動一張獨立
 * 的「今日聯絡簿」hero 卡（cb-hero），2026-08-16 業主裁定該卡與 QuickActionsBar
 * 的聯絡簿大按鈕（含出席狀態 pill）重複，整塊移除；三態判斷邏輯本身還在用
 * （見下方 contactBookSub），故保留。
 */
const todayVariant = computed<'full' | 'awaiting' | 'offday'>(() => {
  if (contactBookEntry.value) return 'full'
  const label = heroStatus.value.label
  if (label === '今天放假' || label === '請假') return 'offday'
  return 'awaiting'
})

/**
 * 常用功能列（quickact01，2026-08-16 改版）的聯絡簿大按鈕連結／副標。
 * 有今天的紀錄就直連該筆；沒有的話連去列表，副標依三態給對應文案，
 * 呼應 ContactBookDayCard 原本的 awaiting/offday 語意，不重造一套判斷。
 */
const contactBookHref = computed<string>(() =>
  contactBookEntry.value ? `/contact-book/${contactBookEntry.value.id}` : '/contact-book',
)
const contactBookSub = computed<string>(() => {
  if (contactBookEntry.value) return '查看今天的完整紀錄'
  if (todayVariant.value === 'offday') {
    return heroStatus.value.label === '請假' ? '今天請假，暫無紀錄' : '今天放假，暫無紀錄'
  }
  return '老師還沒有寫今天的紀錄'
})

// 娃娃車兩格已搬進 HomeBusRow（2026-09-02），它自己 onMounted 抓資料；
// 下拉刷新與錯誤重試要一併帶到它，故透過 defineExpose 的 reload 呼叫。
const busRow = ref<{ reload: () => Promise<void> } | null>(null)

async function pullRefresh() {
  await Promise.all([
    refreshSummary(true),
    refreshToday(),
    loadContactBook(true),
    busRow.value?.reload() ?? Promise.resolve(),
  ])
}

function refresh() {
  refreshSummary(true)
  refreshToday()
  loadContactBook(true)
  void busRow.value?.reload()
}

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="today-view">
    <!--
      首頁頂部 hero（2026-08-16 改版）：問候語 chip（早中晚＋插畫）+ 孩子近期
      照片輪播 + 姓名 + 日期/班級，取代原本的純問候語列。多寶切換沿用既有
      ChildContextHeader，接在後面。
    -->
    <HomeHeroHeader
      v-if="selectedChild"
      :student-id="selectedChild.student_id"
      :name="selectedChild.name || ''"
      :classroom-name="selectedChild.classroom_name"
    />
    <ChildContextHeader v-if="children.length > 1" variant="hero" class="today-cch" />

    <!--
      常用功能列（quickact01，2026-08-16 改版）：聯絡簿大按鈕 + 三個模組
      按鈕，家長各自在自己手機上編輯、存 DB（QuickActionsBar 內部自己
      fetch /parent/quick-actions，不經 home-summary）。位在今日卡之上，
      但聯絡簿大按鈕本身帶出席狀態 pill，「3 秒內看到孩子當日狀態」的
      既有承諾不受影響。
    -->
    <QuickActionsBar
      v-if="selectedChild"
      :contact-book-href="contactBookHref"
      :contact-book-sub="contactBookSub"
      :status-label="heroStatus.label"
      :status-tone="heroStatus.tone"
    />

    <!--
      刻意不用共用的 @/components/common/EmptyState：那支沒被 pin 進 vite.config
      的 shared-common，落在 admin-core chunk。首頁是家長端 entry 的首屏，靜態
      import 它會把整包 admin-core 拖進首屏（實測 gz 227.9KB → 492.0KB，
      check-entry-chunks gate 直接擋下 build）。lazy route（如 ContactBookView）
      用它沒問題，首屏元件不行。
    -->
    <section v-if="isUnbound" class="cb-hero">
      <div class="unbound">
        <p class="unbound-title">尚未綁定子女</p>
        <p class="unbound-desc">可從右上角個人選單加綁，或請園所協助。</p>
      </div>
    </section>

    <!--
      2026-08-16 業主裁定移除：原本這裡有一張獨立的「今日聯絡簿」hero 卡
      （ContactBookDayCard）＋下方「我要接小孩」CTA（pnotice01），與上面
      QuickActionsBar 的聯絡簿大按鈕（本身已帶出席狀態 pill、連去聯絡簿）
      及「接送」快捷模組重複，故整塊拿掉。contactBookEntry / todayVariant
      等底層狀態邏輯仍保留，餵給 QuickActionsBar 的 contactBookHref /
      contactBookSub props（見上方 script）。
    -->

    <!--
      待辦清單（2026-09-02）：取代原本的兩張 sticky 橫幅與 bento 四格。
      同一筆待辦在首頁只出現一次，資料來源為 useParentTodos。
    -->
    <HomeTodoList />

    <HomeBusRow ref="busRow" />

    <!-- LINE 好友提示：系統性提醒，位階刻意排在待辦清單之後，
         不能比逾期繳費／待簽文件更早搶走注意力 -->
    <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

    <template v-if="summaryPending && !summaryData">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" />
        <SkeletonBlock variant="card" />
        <SkeletonBlock variant="card" />
      </div>
    </template>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="refresh"
    />

    <section v-else class="today-stream">
      <SectionHeader title="今日動態">
        <!--
          今日動態只講「今天」。更長的歷史（跨 9 種來源的成長時間軸）在孩子檔案頁，
          原本要從「事務 → 孩子檔案 → 往下滑」三層才找得到，這裡補一個直達出口。
        -->
        <template v-if="selectedChild" #action>
          <router-link :to="`/children/${selectedChild.student_id}`" class="cb-open">
            更多動態
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </router-link>
        </template>
      </SectionHeader>
      <TodayTimeline :buckets="buckets" @navigate="go" />
    </section>

    <!--
      多寶家庭的孩子總覽。切換子女的主要入口是上方 ChildContextHeader，
      這條保留是因為它另外承載生日提示、在籍狀態與「進孩子檔案」入口，
      移掉會少功能；但位置下移，不與 hero 搶同一個視覺區。
    -->
    <ChildrenStrip
      v-if="children.length > 1"
      :children="children"
      :selected-id="selectedStudentId"
      @select="setSelected"
      @navigate="go"
    />

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

.today-cch {
  margin-top: var(--space-1, 4px);
  padding: 0 var(--space-4, 16px);
}

/* 今日聯絡簿 hero 區 */
.cb-hero { padding: 0 var(--space-4, 16px); }

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
  padding: 0 var(--space-4, 16px);
}

.today-stream {
  padding: 0 var(--space-4, 16px) var(--space-3, 12px);
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
