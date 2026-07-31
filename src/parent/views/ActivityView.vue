<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import ActivityHero from '../components/activity/ActivityHero.vue'
import ActivityCardList from '../components/activity/ActivityCardList.vue'
import ActivityRegisterSheet from '../components/activity/ActivityRegisterSheet.vue'
import RegistrationStatusList from '../components/activity/RegistrationStatusList.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import {
  listCourses,
  myRegistrations,
  registerCourses,
  confirmPromotion,
  declinePromotion,
  getActivityBootstrap,
  getUpcomingSessions,
} from '../api/activity'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../utils/toast'
import { sumOutstanding } from '../utils/activityPayment'
import {
  collectBusySlots,
  buildConflictCourseIds,
  buildFormConflictCourseIds,
  countUpcomingWithinDays,
  OCCUPYING_STATUSES,
  type UpcomingSessionLike,
} from '../utils/activitySchedule'
import { todayISO } from '@/utils/format'
import { useRegistrationWindow } from '@/composables/useRegistrationWindow'
import { buildPublicEditUrl } from '@/utils/publicLinks'
import ParentIcon from '../components/ParentIcon.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import M3SegmentedButton from '../components/m3/M3SegmentedButton.vue'

interface RegCourse { course_id: number; course_name: string; status: string; price?: number; price_snapshot?: unknown; meeting_weekday?: number | null; meeting_start_time?: string | null; meeting_end_time?: string | null }
interface Registration { id: number; student_id: number; student_name?: string; school_year: number; semester: number; is_paid: boolean; total_amount?: number; outstanding_amount?: number; payment_status?: string; refunded_amount?: number; courses: RegCourse[] }
interface Course { id: number; name: string; price?: number; school_year: number; semester: number; capacity: number; enrolled_count: number; is_full: boolean; allow_waitlist: boolean; sessions?: number; description?: string; price_snapshot?: unknown; meeting_weekday?: number | null; meeting_start_time?: string | null; meeting_end_time?: string | null }

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const tab = ref('my') // my / new

const courses = ref<Course[]>([])
const myRegs = ref<Registration[]>([])
const upcomingSessions = ref<(UpcomingSessionLike & { course_name?: string })[]>([])
// 報名清單與課程清單各自獨立 loading：共用單一 ref 會讓兩支並行 fetch 互相覆蓋
// loading 狀態 → 空狀態誤閃。各判各的。
const regsLoading = ref(false)
const coursesLoading = ref(false)
const submitting = ref(false)
const showRegister = ref(false)
// Task 7（Bento P3）：首屏 fetch 失敗 → inline error 三態
const loadError = ref(false)
// FE-1（2026-06-23 audit）：確認轉正式防連點。記錄「正在確認的 reg:course」，
// 期間停用該按鈕，避免網路慢時連點重複送出（對齊公開查詢頁 promotionSubmitting）。
const confirmingKey = ref<string | null>(null)

// #2：報名成功後後端回傳一次性 query_token，組成公開「管理我的報名」連結供家長保存。
// 後端只存 hash、明文僅此一次，故必須在此即時呈現並提供複製；遺失需洽校方重發。
const manageUrl = ref('')

// ② 報名時段守衛（前端 UX；後端 _check_registration_open 仍為硬閘）。
// 預設 null＝尚未載入 → fail-open：載入前 / 讀取失敗時不擋報名入口，避免誤鎖
// （純時間窗語意下「雙空物件」會被判為未開放，故 fail-open 改以 null 表達）。
// 與公開報名頁共用 useRegistrationWindow，未設定/未到/截止/即將截止語意一致。
const regTimeInfo = ref<{ open_at?: string | null; close_at?: string | null } | null>(null)
const { isRegistrationOpen, noticeState } = useRegistrationWindow({
  timeInfo: regTimeInfo,
  submitting,
})

// 報名表單（符合 ActivityRegisterSheet FormData interface）
const form = ref<{
  student_id?: number
  school_year?: number | null
  semester?: string | null
  course_ids?: number[]
  [key: string]: unknown
}>({
  student_id: undefined,
  school_year: null,
  semester: null,
  course_ids: [],
})

const childrenTyped = computed(() => (childrenStore.items || []) as { student_id: number; name: string }[])

const studentNameMap = computed(() => {
  const m = new Map<number, string>()
  for (const c of childrenStore.items || []) {
    const child = c as { student_id: number; name: string }
    m.set(child.student_id, child.name)
  }
  return m
})

const filteredRegs = computed(() => {
  if (!selectedId.value) return myRegs.value
  return myRegs.value.filter((r) => r.student_id === selectedId.value)
})

// 2026-07-31 稽核：hero 的「進行中」與「待繳」原本直接吃 filteredRegs（只依孩子篩），
// 把所有歷史學期的舊報名一起算進去——家長會看到早就結束的才藝仍顯示「進行中」，
// 待繳金額也把舊學期的欠費加總進來。以目錄課程的學期（list_courses 回的是後端開放中
// 的學期）收斂；目錄為空時無從判定，維持原本的全部（不誤顯示為 0）。
const currentTermRegs = computed(() => {
  const c0 = courses.value[0]
  if (!c0) return filteredRegs.value
  return filteredRegs.value.filter(
    (r) => r.school_year === c0.school_year && r.semester === c0.semester,
  )
})

const COURSE_STATUS = {
  enrolled: { label: '已報名', color: { bg: 'var(--brand-primary-soft)', color: 'var(--m3-primary, var(--pt-success-text))' } },
  waitlist: { label: '候補中', color: { bg: 'var(--color-warning-soft)', color: 'var(--pt-warning-text-soft)' } },
  promoted_pending: { label: '待您確認', color: { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' } },
  pending_review: { label: '待審核', color: { bg: 'var(--color-warning-soft)', color: 'var(--pt-warning-text-soft)' } },
  pending_review_waitlist: { label: '待審核候補', color: { bg: 'var(--color-info-soft)', color: 'var(--pt-info-text)' } },
}

// hero stats
const activeRegistrations = computed(() =>
  currentTermRegs.value.filter((r) =>
    (r.courses || []).some(
      (c) => OCCUPYING_STATUSES.includes(c.status),
    ),
  ).length,
)

// ④ 待繳：以後端 outstanding_amount（= max(total-paid, 0)）為準。
// 後端 total 只計 enrolled 課程 + 用品（候補不計），且已扣除已繳，免繳/溢繳/已繳清
// 皆為 0。原本前端自行加總所有課程（含候補、未扣已繳、漏算用品）會高估待繳。
const unpaidActivityFee = computed(() => sumOutstanding(currentTermRegs.value))

// 即將開課（7 天內）：以後端 upcoming-sessions（ActivitySession 逐場日期）為準，
// 依所選孩子過濾。未選孩子時計全部子女。
const upcomingCount = computed(() =>
  countUpcomingWithinDays(upcomingSessions.value, {
    studentId: selectedId.value ?? undefined,
    days: 7,
    todayISO: todayISO(),
  }),
)

// 目錄課程的學期（list_courses 預設回當前學期，課程同質）。供衝堂偵測只比對
// 同學期的已佔位時段，避免上學期課程誤報本學期衝堂（code review #6）。
const catalogTerm = computed(() => {
  const c = courses.value[0]
  return c ? { schoolYear: c.school_year, semester: c.semester } : {}
})

// 衝堂偵測（前台 advisory，不擋報名）：以所選孩子「已佔位」課程（enrolled /
// promoted_pending）的上課時段，比對目錄課程，標出時段衝突者。weekday/time 由
// 後端 list_courses / my-registrations 帶出（缺值則無法判定，不誤報）。
// code review #6：busy slots 依目錄學期過濾，跨學期報名不納入比對。
const conflictCourseIds = computed(() =>
  buildConflictCourseIds(
    courses.value,
    collectBusySlots(filteredRegs.value, catalogTerm.value),
  ),
)

// 報名表單衝堂：以「報名表單學期」的既有佔位 + 本次同時勾選的其他新課互比，
// 標出衝堂課程（code review #6 part 2：表單複選互比，advisory 不擋報名）。
const formBusySlots = computed(() =>
  collectBusySlots(
    form.value.student_id == null
      ? []
      : myRegs.value.filter((r) => r.student_id === Number(form.value.student_id)),
    {
    schoolYear: form.value.school_year ?? undefined,
    semester:
      form.value.semester != null && form.value.semester !== ''
        ? Number(form.value.semester)
        : undefined,
    },
  ),
)
const formConflictIds = computed(() =>
  buildFormConflictCourseIds(
    filteredCourses.value,
    form.value.course_ids ?? [],
    formBusySlots.value,
  ),
)

// Bootstrap 與 mutation 後的三支局部刷新共用同一個 epoch。只要較新的快照開始，
// 任何較早請求即使最後才回來，也只能結束自己的 Promise，不能再寫入畫面狀態。
let activitySnapshotEpoch = 0
function beginActivitySnapshot(): number {
  activitySnapshotEpoch += 1
  return activitySnapshotEpoch
}
function isCurrentActivitySnapshot(epoch: number): boolean {
  return epoch === activitySnapshotEpoch
}

async function refreshActivitySnapshot() {
  const epoch = beginActivitySnapshot()
  regsLoading.value = true
  coursesLoading.value = true
  try {
    // 三支先只取資料，不各自落地；任一失敗就保留整份舊快照，避免出現
    // 「新報名狀態 + 舊課程容量」的永久混合畫面。
    const [regsResponse, coursesResponse, upcomingResponse] = await Promise.all([
      myRegistrations(),
      listCourses(),
      getUpcomingSessions(),
    ])
    if (!isCurrentActivitySnapshot(epoch)) return
    myRegs.value = regsResponse.data?.items || []
    courses.value = coursesResponse.data?.items || []
    upcomingSessions.value = upcomingResponse.data?.items || []
  } catch (err: unknown) {
    if (!isCurrentActivitySnapshot(epoch)) return
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '重新整理才藝資料失敗'))
  } finally {
    if (isCurrentActivitySnapshot(epoch)) {
      regsLoading.value = false
      coursesLoading.value = false
    }
  }
}

// 首屏聚合：courses + my-registrations + upcoming-sessions + registration-time
// 一次取回（取代原本 4 支並行 GET，削報名尖峰對單 worker 後端的請求放大）。
// 報名/轉正後的局部刷新走 refreshActivitySnapshot（不重抓 registration_time）。
async function fetchBootstrap() {
  const epoch = beginActivitySnapshot()
  regsLoading.value = true
  coursesLoading.value = true
  loadError.value = false
  try {
    const { data } = await getActivityBootstrap()
    if (!isCurrentActivitySnapshot(epoch)) return
    myRegs.value = data?.registrations?.items || []
    courses.value = data?.courses?.items || []
    upcomingSessions.value = data?.upcoming_sessions?.items || []
    if (data?.registration_time) regTimeInfo.value = data.registration_time
    loadError.value = false
  } catch (err: unknown) {
    if (!isCurrentActivitySnapshot(epoch)) return
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
    loadError.value = true
  } finally {
    if (isCurrentActivitySnapshot(epoch)) {
      regsLoading.value = false
      coursesLoading.value = false
    }
  }
}

function openRegister() {
  if (!isRegistrationOpen.value) {
    toast.warn(noticeState.value?.message || '目前未開放報名')
    return
  }
  if ((childrenStore.items || []).length === 0) {
    toast.warn('尚未綁定子女')
    return
  }
  if (courses.value.length === 0) {
    toast.warn('目前沒有可報名的課程')
    return
  }
  // 預設帶入第一門課的學期
  const c0 = courses.value[0]
  form.value = {
    student_id: selectedId.value ?? (childrenStore.items[0] as { student_id: number }).student_id,
    school_year: c0.school_year,
    semester: String(c0.semester),
    course_ids: [],
  }
  showRegister.value = true
}

const filteredCourses = computed(() =>
  courses.value.filter(
    (c) =>
      c.school_year === form.value.school_year &&
      String(c.semester) === form.value.semester,
  ),
)

async function submitRegister() {
  if (!form.value.student_id) {
    toast.warn('請選擇學生')
    return
  }
  if (!(form.value.course_ids?.length)) {
    toast.warn('請至少選一門課')
    return
  }
  submitting.value = true
  try {
    const res = await registerCourses({
      student_id: Number(form.value.student_id),
      // registerCourses payload 以 codegen 契約把關後抓出：school_year 可能 null、
      // semester 在表單為字串，但後端 register body 要 number → 比照 student_id 強制轉。
      school_year: Number(form.value.school_year),
      semester: Number(form.value.semester),
      course_ids: (form.value.course_ids ?? []).map(Number),
      supply_ids: [],
    })
    const token = (res as { data?: { query_token?: string } })?.data?.query_token
    manageUrl.value = token ? buildPublicEditUrl(window.location.origin, token) : ''
    toast.success('報名成功')
    showRegister.value = false
    tab.value = 'my'
    // 報名會改變課程容量/額滿狀態 + hero 即將開課；await 同一 epoch 的完整
    // 快照後才解除 submitting，避免舊 bootstrap 回寫或按鈕提早恢復。
    await refreshActivitySnapshot()
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '報名失敗'))
  } finally {
    submitting.value = false
  }
}

async function copyManageLink() {
  if (!manageUrl.value) return
  try {
    await navigator.clipboard.writeText(manageUrl.value)
    toast.success('管理連結已複製')
  } catch {
    toast.error('複製失敗，請長按連結手動複製')
  }
}

function dismissManageLink() {
  manageUrl.value = ''
}

async function onConfirmPromotion(reg: Registration, rc: RegCourse) {
  const key = `${reg.id}:${rc.course_id}`
  if (confirmingKey.value) return // 已有確認進行中，避免連點併發
  confirmingKey.value = key
  try {
    await confirmPromotion(reg.id, rc.course_id)
    toast.success('已確認轉正式')
    // 轉正會佔用容量 + 影響 hero 即將開課 → 並行重抓課程清單與 upcoming sessions。
    // 稽核 finding 4：await 刷新後才在 finally 解鎖，避免慢網路下舊「確認」按鈕在
    // 列表尚未更新前提早恢復、二次點擊命中已轉正課程得到 409。
    await refreshActivitySnapshot()
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '確認失敗'))
    // C4（2026-07-31 盲區稽核）：失敗路徑也要刷新。逾期確認會拿到 410，而伺服器
    // 端該列此時已被 release_expired_pending_promotion 刪除；不重抓的話那列與按鈕
    // 仍留在畫面上，家長再按一次變成 404。刷新失敗不覆蓋原本的錯誤提示。
    await refreshActivitySnapshot().catch(() => {})
  } finally {
    confirmingKey.value = null
  }
}

// 放棄候補升位（設計審查 2026-07-28）：破壞性且不可逆（刪列、名額讓給下一位），
// 先開 ConfirmDialog 二次確認，確認後才打 API；busy key 與確認流程共用防互踩。
// open 與 target 分開持有：ConfirmDialog 的 confirm 會先 emit update:open(false)
// 再 emit confirm，若以 target 派生 open、關閉時清 target，confirm 時就讀不到了。
const declineDialogOpen = ref(false)
const declineTarget = ref<{ reg: Registration; rc: RegCourse } | null>(null)

function onDeclinePromotion(reg: Registration, rc: RegCourse) {
  if (confirmingKey.value) return
  declineTarget.value = { reg, rc }
  declineDialogOpen.value = true
}

async function onDeclineConfirmed() {
  const target = declineTarget.value
  declineTarget.value = null
  if (!target || confirmingKey.value) return
  confirmingKey.value = `${target.reg.id}:${target.rc.course_id}`
  try {
    await declinePromotion(target.reg.id, target.rc.course_id)
    toast.success('已放棄，名額將由下一位候補遞補')
    // 放棄釋出名額（is_full / 候補順位 / hero 皆受影響），與確認同套刷新。
    await refreshActivitySnapshot()
  } catch (err: unknown) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '放棄失敗'))
    // C4：同 onConfirmPromotion——失敗多半代表伺服器端狀態已與畫面分叉，重抓收斂。
    await refreshActivitySnapshot().catch(() => {})
  } finally {
    confirmingKey.value = null
  }
}

function onScrollSection(key: string) {
  if (key === 'active') {
    tab.value = 'my'
    requestAnimationFrame(() =>
      document.querySelector('#act-active')?.scrollIntoView({ behavior: 'smooth' }),
    )
  } else if (key === 'upcoming') {
    tab.value = 'new'
    requestAnimationFrame(() =>
      document.querySelector('#act-upcoming')?.scrollIntoView({ behavior: 'smooth' }),
    )
  } else if (key === 'unpaid') {
    tab.value = 'my'
    requestAnimationFrame(() => {
      // data-unpaid 屬性由 RegistrationStatusList 標記在第一筆未繳/部分繳費的 reg-card 上
      const el = document.querySelector<HTMLElement>('.reg-card[data-unpaid]')
      if (el) el.scrollIntoView({ behavior: 'smooth' })
      else
        document
          .querySelector('#act-active')
          ?.scrollIntoView({ behavior: 'smooth' })
    })
  }
}

// 2026-07-31 稽核：childrenStore.load() 在「已有另一個載入在途」時會直接 return
// （store 內的 `if (loading.value) return`），await 因此不會等它完成——此刻 items 仍是
// 空陣列，ensureSelected([]) 會把 selectedId 清成 null，而 filteredRegs 在沒有選擇時
// 回傳「全部孩子」的報名 → 多寶家庭的畫面混列了另一個孩子的才藝與待繳金額。
// 改為追蹤 items，名單真的到齊時才選定；空陣列不再清掉既有選擇。
watch(
  () => childrenStore.items,
  (items) => {
    if (items && items.length > 0) {
      ensureSelected(items as { student_id: number }[])
    }
  },
  { immediate: true },
)

onMounted(async () => {
  await childrenStore.load()
  fetchBootstrap()
})

async function pullRefresh() {
  await fetchBootstrap()
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="activity-view">
    <ActivityHero
      :active-registrations="activeRegistrations"
      :unpaid-activity-fee="unpaidActivityFee"
      :upcoming-count="upcomingCount"
      @scroll-section="onScrollSection"
    />

    <ChildContextHeader v-if="tab === 'my'" variant="page" />
    <M3SegmentedButton
      :model-value="tab"
      :items="[
        { value: 'my', label: '我的報名', icon: 'assignment' },
        { value: 'new', label: '可報名課程', icon: 'school' },
      ]"
      class="tab-segmented"
      @update:model-value="tab = ($event as string)"
    />

    <template v-if="tab === 'my'">
      <!-- #2：報名成功後一次性管理連結（公開查詢頁，憑 token 修改/取消） -->
      <div v-if="manageUrl" class="manage-link-card" role="status">
        <button class="manage-link-close" aria-label="關閉" @click="dismissManageLink">×</button>
        <div class="manage-link-title">報名成功！請保存您的管理連結</div>
        <div class="manage-link-desc">
          日後修改課程／用品或取消報名，請使用此連結（僅顯示這一次，建議立即複製保存）。
        </div>
        <div class="manage-link-url">{{ manageUrl }}</div>
        <button class="pt-action-btn manage-link-copy" @click="copyManageLink">
          <ParentIcon name="copy" size="sm" />
          複製連結
        </button>
      </div>
      <MobileErrorRetry v-if="loadError" @retry="fetchBootstrap" />
      <div v-else-if="!regsLoading && filteredRegs.length === 0" class="pt-empty">
        <div class="pt-empty-title">尚無報名</div>
      </div>
      <RegistrationStatusList
        v-else
        :registrations="filteredRegs"
        :student-name-map="studentNameMap"
        :course-status-map="COURSE_STATUS"
        :confirming-key="confirmingKey"
        @confirm-promotion="onConfirmPromotion"
        @decline-promotion="onDeclinePromotion"
      />
      <ConfirmDialog
        v-model:open="declineDialogOpen"
        title="放棄候補升位？"
        :message="`放棄「${declineTarget?.rc.course_name ?? ''}」後，名額將讓給下一位候補，且無法復原。`"
        confirm-label="確定放棄"
        destructive
        @cancel="declineTarget = null"
        @confirm="onDeclineConfirmed"
      />
    </template>

    <template v-else>
      <!-- ② 報名時段提示（尚未開放 / 尚未開始 / 已截止 / 即將截止） -->
      <div
        v-if="noticeState"
        class="reg-notice"
        :class="noticeState.variant"
        role="status"
      >
        <div class="reg-notice-title">{{ noticeState.title }}</div>
        <div class="reg-notice-msg">{{ noticeState.message }}</div>
      </div>
      <div class="toolbar">
        <button
          class="pt-action-btn"
          :disabled="!isRegistrationOpen"
          @click="openRegister"
        >
          <ParentIcon name="plus" size="sm" />
          開始報名
        </button>
      </div>
      <SkeletonBlock
        v-if="coursesLoading && !courses.length"
        variant="card"
        :count="3"
        aria-label="課程載入中"
      />
      <MobileErrorRetry
        v-else-if="loadError"
        @retry="fetchBootstrap"
      />
      <template v-else>
        <div v-if="!coursesLoading && courses.length === 0" class="pt-empty">
          <div class="pt-empty-title">目前沒有開放的課程</div>
        </div>
        <ActivityCardList v-else :courses="courses" :conflict-ids="conflictCourseIds" />
      </template>
    </template>

    <ActivityRegisterSheet
      v-model="showRegister"
      v-model:form-data="form"
      :children="childrenTyped"
      :available-courses="filteredCourses"
      :conflict-ids="formConflictIds"
      :submitting="submitting"
      @submit="submitRegister"
    />
  </PullToRefresh>
</template>

<style scoped>
.activity-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--pt-page-gap, 18px);
}

.tab-segmented {
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.toolbar .pt-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ② 報名時段提示卡 */
.reg-notice {
  border-radius: 14px;
  padding: 12px 14px;
  border: 1px solid var(--pt-border-light, #ecf5f9);
  background: var(--pt-surface-raised, var(--neutral-0));
}
.reg-notice-title {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 2px;
}
.reg-notice-msg {
  font-size: 13px;
  color: var(--pt-text-soft);
}
.reg-notice.is-warning {
  background: var(--color-warning-soft);
  border-color: var(--color-warning-soft);
}
.reg-notice.is-warning .reg-notice-title {
  color: var(--pt-warning-text-soft);
}
.reg-notice.is-danger {
  background: var(--color-danger-soft);
  border-color: var(--color-danger-soft);
}
.reg-notice.is-danger .reg-notice-title {
  color: var(--color-danger);
}

/* #2：報名成功後一次性「管理我的報名」連結卡片 */
.manage-link-card {
  position: relative;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
  border: 1px solid var(--brand-primary-soft, #d7eef7);
  background: var(--brand-primary-soft, #eef8fc);
}
.manage-link-title {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
  color: var(--brand-primary);
}
.manage-link-desc {
  font-size: 13px;
  color: var(--pt-text-soft);
  margin-bottom: 8px;
}
.manage-link-url {
  font-size: 12px;
  word-break: break-all;
  background: var(--pt-surface-raised, var(--neutral-0));
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.manage-link-copy {
  width: 100%;
}
.manage-link-close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--pt-text-soft);
}
</style>
