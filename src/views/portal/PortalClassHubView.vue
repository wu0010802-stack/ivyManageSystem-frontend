<template>
  <div class="class-hub" v-loading="loading && !data">
    <!-- 頁首移到最上方（原本夾在請假卡與時段卡之間，標題出現在頁面中段） -->
    <PortalPageHeader
      :title="(data?.classroom_name as string | undefined) || '今日工作台'"
      :subtitle="data?.fetched_at ? `最後更新 ${formatTime(data.fetched_at as string | null | undefined)}` : ''"
    >
      <template #actions>
        <el-button :loading="loading" @click="manualRefresh">
          重新整理
        </el-button>
        <!-- Phase 1 殼層改版：學生 tab 退出底部導覽，這裡補班級學生入口 -->
        <el-button @click="goStudents">
          班級學生
        </el-button>
      </template>
    </PortalPageHeader>

    <ClassHubStickyNext :next="stickyNext" :counts="hubCounts" @jump="(dl) => jumpDeep(dl || '')" />

    <ClassHubBatchMeasurementCard
      :last-measured-on="lastBatchMeasuredOn"
      @open="openBatchSheet"
    />

    <ClassHubLeaveCard />

    <!-- 載入失敗（error）與「今日沒有任務」（empty）必須分辨：
         原本一律顯示空狀態，會讓網路失敗被誤讀為「今天沒有用藥/任務」（安全隱患）。 -->
    <PortalErrorState
      v-if="error && !data"
      message="工作台載入失敗，請確認網路後重試"
      @retry="manualRefresh"
    />

    <div
      v-else-if="!data || data.classroom_id === 0"
      class="class-hub__empty"
    >
      <el-empty description="目前沒有班級任務" />
    </div>

    <template v-else>
      <ClassHubTimeSlotCard
        v-for="slot in slots"
        :key="slot.slot_id"
        :slot="slot"
        :is-current="slot.slot_id === currentSlotId"
        @open-sheet="onOpenSheet"
        @jump-page="onJumpPage"
      />
    </template>

    <ClassHubAttendanceSheet
      v-model:show="sheets.attendance"
      @done="onSheetDone('attendance_pending')"
    />
    <ClassHubMedicationSheet
      v-model:show="sheets.medication"
      @done="onSheetDone('medications_pending')"
    />
    <ClassHubIncidentQuickSheet
      v-model:show="sheets.incident"
      @done="manualRefresh"
    />

    <PortalBatchMeasurementSheet
      v-model="batchSheetOpen"
      @done="onBatchDone"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePortalClassHub } from '@/composables/usePortalClassHub'
import ClassHubStickyNext from '@/components/portal/class-hub/ClassHubStickyNext.vue'
import ClassHubTimeSlotCard from '@/components/portal/class-hub/ClassHubTimeSlotCard.vue'
import ClassHubAttendanceSheet from '@/components/portal/class-hub/ClassHubAttendanceSheet.vue'
import ClassHubMedicationSheet from '@/components/portal/class-hub/ClassHubMedicationSheet.vue'
import ClassHubIncidentQuickSheet from '@/components/portal/class-hub/ClassHubIncidentQuickSheet.vue'
import ClassHubBatchMeasurementCard from '@/components/portal/class-hub/ClassHubBatchMeasurementCard.vue'
import ClassHubLeaveCard from '@/components/portal/class-hub/ClassHubLeaveCard.vue'
import PortalBatchMeasurementSheet from '@/components/portal/sheets/PortalBatchMeasurementSheet.vue'
import PortalErrorState from '@/components/portal/PortalErrorState.vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import { getMeasurementsLatest } from '@/api/portalMeasurements'
import type { PortalHubCounts } from '@/utils/portalHubCounts'

const { data, loading, error, refresh, decrementCount } = usePortalClassHub() as {
  data: import('vue').Ref<Record<string, unknown> | null>
  loading: import('vue').Ref<boolean>
  error: import('vue').Ref<unknown>
  refresh: () => Promise<void>
  decrementCount: (key: string) => void
}
const router = useRouter()

// Typed accessors for data fields
interface NextTask { kind?: string; student_name?: string; detail?: string; due_at?: string | null; deep_link?: string }
interface SlotTask { kind?: string; count?: number; action_mode?: string; due_at?: string | null }
interface TimeSlot { slot_id?: string; tasks: SlotTask[] }

const stickyNext = computed(() => (data.value?.sticky_next ?? null) as NextTask | null)
// 置頂條的「都完成」必須同時看 counts，否則沒有用藥委託的日子會誤報（P1-01）
const hubCounts = computed(() => (data.value?.counts ?? null) as PortalHubCounts | null)
const slots = computed(() => ((data.value?.slots ?? []) as unknown) as TimeSlot[])

const batchSheetOpen = ref(false)
const lastBatchMeasuredOn = ref<string | null>(null)

async function refreshLastBatchDate() {
  try {
    const { data: latestData } = await getMeasurementsLatest()
    const dates = (latestData as { last_measurement?: { measured_on?: string } }[])
      .map((r) => r.last_measurement?.measured_on)
      .filter((d): d is string => Boolean(d))
      .sort()
    lastBatchMeasuredOn.value = dates.length > 0 ? dates[dates.length - 1] : null
  } catch (_) {
    lastBatchMeasuredOn.value = null
  }
}

function openBatchSheet() {
  batchSheetOpen.value = true
}
function onBatchDone() {
  refreshLastBatchDate()
}

const sheets = reactive({
  attendance: false,
  medication: false,
  incident: false,
})

// 後端 sticky_next 的 deep_link 是 /portal/class-hub?sheet=medication&id=<log_id>，
// 但使用者通常已經在本頁，push 只會改動 query 而不會重新掛載元件。沒有這個 watch，
// 置頂「下一件：… 處理 →」按下去就只有網址變、抽屜不開（時段卡那列另有 handler
// 所以還開得起來，症狀因此更難察覺）。immediate 讓直接貼網址進來也有效。
const route = useRoute()
watch(
  () => route.query.sheet,
  (name) => {
    const key = Array.isArray(name) ? name[0] : name
    if (key && key in sheets) sheets[key as keyof typeof sheets] = true
  },
  { immediate: true },
)

// Re-evaluate which slot is current every minute
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 60_000)
})
onMounted(refreshLastBatchDate)
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
})

const currentSlotId = computed(() => {
   
  nowTick.value
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  if (m < 9 * 60) return 'morning'
  if (m < 12 * 60) return 'forenoon'
  if (m < 14 * 60) return 'noon'
  return 'afternoon'
})

function manualRefresh() {
  refresh().catch(() => {})
}

function onOpenSheet(task: SlotTask) {
  if (task.kind === 'attendance') sheets.attendance = true
  else if (task.kind === 'medication') sheets.medication = true
  else if (task.kind === 'incident') sheets.incident = true
}

function onSheetDone(countKey: string) {
  decrementCount(countKey)
}

function onJumpPage(task: SlotTask) {
  const map: Record<string, string> = {
    observation: '/portal/observations',
    contact_book: '/portal/contact-book',
  }
  const target = task.kind ? map[task.kind] : undefined
  if (target) router.push(`${target}?from=hub`)
}

function jumpDeep(deepLink: string) {
  if (!deepLink) return
  router.push(deepLink)
}

// Phase 1 殼層改版：學生 tab 退出底部導覽後的班級學生入口
function goStudents() {
  router.push('/portal/students?from=hub')
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

</script>

<style scoped>
.class-hub {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}
.class-hub__empty {
  padding: 48px 0;
}
</style>
