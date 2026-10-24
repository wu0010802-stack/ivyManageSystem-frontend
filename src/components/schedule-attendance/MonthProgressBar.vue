<template>
  <nav class="month-progress" aria-label="本月進度" data-test="month-progress">
    <p v-if="loadError" class="month-progress__error" role="alert" data-test="progress-error">
      {{ loadError }}
      <button type="button" class="month-progress__link" data-test="progress-retry" @click="month.reload()">重試</button>
    </p>

    <!-- 整月封存：只能看、不能改，沒有下一步可走，整條換成說明（不畫步驟列） -->
    <section v-if="sealed" class="month-progress__sealed" aria-label="封存狀態" data-test="progress-sealed">
      <div class="month-progress__sealed-text">
        <strong>{{ sealed.month }} 月薪資已封存，這個月的出勤只能看、不能改。</strong>
        <!-- 沒有出勤讀取權限就看不到打卡，無從判斷封存時有沒有沒處理的件，只留標題 -->
        <span v-if="canViewAttendance">
          <template v-if="sealed.leftoverCount > 0">
            封存時還有 {{ sealed.leftoverCount }} 件沒處理，已照系統規則算進薪資。
            <button type="button" class="month-progress__link" data-test="progress-show-leftover" @click="emit('show-leftover')">看這 {{ sealed.leftoverCount }} 件</button>
          </template>
          <template v-else>封存時沒有未處理的件。</template>
        </span>
      </div>
      <button v-if="nextMonth" type="button" class="month-progress__go" data-test="progress-go-month" @click="emit('go-month', nextMonth)">前往 {{ nextMonth.month }} 月</button>
    </section>

    <template v-else>
      <!-- 手機：一顆膠囊（目前這步＋下一步摘要）。本體＝這一步的主要動作（同頁首 primary）；
           要看完整步驟由旁邊的「看進度」展開 -->
      <div v-if="mobile && !loadError" class="month-progress__capsule" :class="{ 'is-idle': !capsuleAction }">
        <button
          type="button"
          class="month-progress__capsule-body"
          :disabled="!capsuleAction"
          data-test="progress-capsule"
          @click="capsuleAction && emit('primary', capsuleAction.action)"
        >
          <span class="month-progress__capsule-text">
            <strong class="month-progress__capsule-main" data-test="progress-capsule-main">{{ capsuleMain }}</strong>
            <span v-if="capsuleSub" class="month-progress__capsule-sub" data-test="progress-capsule-sub">{{ capsuleSub }}</span>
          </span>
        </button>
        <button
          type="button"
          class="month-progress__toggle"
          :aria-expanded="expanded"
          :aria-controls="stepsId"
          :disabled="!step"
          data-test="progress-toggle"
          @click="expanded = !expanded"
        >
          看進度
          <svg class="month-progress__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>

      <ol v-if="showSteps" :id="stepsId" class="month-progress__steps" :aria-label="`${monthNumber} 月結算進度`">
        <li v-if="canViewAttendance" class="month-progress__step" :class="{ 'is-current': importIsCurrent }" :aria-current="importIsCurrent ? 'step' : undefined">
          <!-- 匯入要 ATTENDANCE_WRITE（同頁首匯入鈕）；只有讀取權限時只顯示進度，不給可點的入口 -->
          <button v-if="canWriteAttendance" type="button" class="month-progress__action" data-test="progress-import" @click="emit('import')">
            <span class="month-progress__name">打卡匯入</span>
            <span class="month-progress__value">{{ importValue }}</span>
          </button>
          <div v-else class="month-progress__action is-static" data-test="progress-import">
            <span class="month-progress__name">打卡匯入</span>
            <span class="month-progress__value">{{ importValue }}</span>
          </div>
        </li>
        <li v-if="canViewAttendance" class="month-progress__step" :class="{ 'is-current': step === 'patterns' }" :aria-current="step === 'patterns' ? 'step' : undefined">
          <!-- 設定問題：整月同型態的人，修好設定才會一次消失（點開設定檢查） -->
          <button type="button" class="month-progress__action" :disabled="!patterns.length" data-test="progress-patterns" @click="patternsOpen = true">
            <span class="month-progress__name">先修設定</span>
            <span class="month-progress__value">{{ patternsValue }}</span>
          </button>
        </li>
        <li v-if="canViewAttendance" class="month-progress__step" :class="{ 'is-current': step === 'daily' }" :aria-current="step === 'daily' ? 'step' : undefined">
          <button type="button" class="month-progress__action" data-test="progress-issues" @click="emit('show-issues')">
            <span class="month-progress__name">逐日待辦</span>
            <span class="month-progress__value">{{ dailyValue }}</span>
          </button>
        </li>
        <li v-if="canConfirmRounds" class="month-progress__step" :class="{ 'is-current': step === 'confirm' }" :aria-current="step === 'confirm' ? 'step' : undefined">
          <button type="button" class="month-progress__action" data-test="progress-rounds" @click="roundsOpen = true">
            <span class="month-progress__name">老師確認換班</span>
            <span class="month-progress__value" data-test="progress-rounds-status">{{ roundsValue }}</span>
          </button>
        </li>
        <li class="month-progress__step" :class="{ 'is-current': step === 'payroll' }" :aria-current="step === 'payroll' ? 'step' : undefined">
          <!-- 薪資結算頁需要 SALARY_READ，沒有就只顯示步驟（連過去會被路由守衛擋下） -->
          <router-link v-if="canViewSalary" to="/salary/settle" class="month-progress__action" data-test="progress-salary">
            <span class="month-progress__name">交薪資</span>
            <span class="month-progress__value" :class="{ 'is-muted': step !== 'payroll' }">{{ payrollValue }}</span>
          </router-link>
          <div v-else class="month-progress__action is-static" data-test="progress-salary-text">
            <span class="month-progress__name">交薪資</span>
            <span class="month-progress__value" :class="{ 'is-muted': step !== 'payroll' }">{{ payrollValue }}</span>
          </div>
        </li>
      </ol>

      <p v-if="summary?.sealState === 'partial' && showSteps" class="month-progress__partial" data-test="progress-partial">
        已有 {{ summary.sealedEmployeeIds.size }} 人的薪資封存，他們的出勤只能看；其餘 {{ summary.employedCount - summary.sealedEmployeeIds.size }} 人照常核對。
      </p>
    </template>

    <el-drawer v-if="canViewAttendance" v-model="patternsOpen" title="本月設定檢查" :size="mobile ? '100%' : '520px'" append-to-body>
      <AttendancePatternList v-if="patternsOpen" :patterns="patterns" @records="onPatternRecords" @import="onPatternImport" @recalculate="onPatternRecalculate" />
    </el-drawer>
    <el-drawer v-if="canConfirmRounds" v-model="roundsOpen" title="月底出勤確認（老師確認）" :size="mobile ? '100%' : '520px'" append-to-body @closed="emit('changed')">
      <ConfirmationRoundBar v-if="roundsOpen" :start="range.start" :end="range.end" />
    </el-drawer>
  </nav>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, watch } from 'vue'
import { getConfirmationRound, listConfirmationRounds, listUnroundedConfirmationItems } from '@/api/attendanceConfirmation'
import type { MonthGridState } from '@/composables/useMonthGrid'
import { backdatedPendingCount, pickDisplayRound, roundReplyProgress } from '@/utils/attendanceConfirm'
import { buildMonthSummary, currentStep, primaryAction, primaryLabel, type MonthStep, type MonthSummary, type PrimaryAction } from '@/utils/attendanceMonthSummary'
import { hasPermission } from '@/utils/auth'
import { todayTaipeiISO } from '@/utils/format'
import AttendancePatternList from './AttendancePatternList.vue'

const ConfirmationRoundBar = defineAsyncComponent(() => import('@/components/attendance/ConfirmationRoundBar.vue'))

const props = defineProps<{
  /** 頁面建立的整月格子資料（與月格子共用同一份，D-06） */
  month: MonthGridState
  mobile?: boolean
}>()
const emit = defineEmits<{
  'show-issues': []
  /** 封存月：看封存前沒處理完的那幾件（只能稽核） */
  'show-leftover': []
  /** 封存月：前往下一個要核對的月份 */
  'go-month': [payload: { year: number; month: number }]
  changed: []
  /** 整月摘要（含目前步驟）：頁首主要動作、匯出提醒共用。載入失敗或換月載入中不送 */
  summary: [value: MonthSummary & { step: MonthStep }]
  /** 設定檢查清單：看某人整月出勤（帶第一個應上班日） */
  records: [employeeId: number, date: string]
  /** 打卡匯入／設定檢查清單：開匯入打卡（重新匯入時把卡號對上） */
  import: []
  /** 設定檢查清單：重算本月出勤 */
  recalculate: []
  /** 手機膠囊本體：目前這步的主要動作（同頁首 primary，頁面用同一個處理函式） */
  primary: [action: PrimaryAction]
}>()

const range = computed(() => props.month.range.value)
const data = computed(() => props.month.data.value)
const loadError = computed(() => props.month.loadError.value)
const canViewAttendance = hasPermission('ATTENDANCE_READ')
// 匯入打卡需要寫入權限（頁首匯入鈕同條件）；沒有就不能把步驟 1 做成可點的入口
const canWriteAttendance = hasPermission('ATTENDANCE_WRITE')
// 薪資結算頁需要 SALARY_READ，沒有就只顯示步驟名稱（連過去會被路由守衛擋下）
const canViewSalary = hasPermission('SALARY_READ')
// 確認輪次端點掛在 SCHEDULE 路由下，讀取還要 ATTENDANCE_READ（同原打卡核對頁籤條件）
const canConfirmRounds = hasPermission('SCHEDULE') && canViewAttendance

const roundsOpen = ref(false)

// 設定檢查（型態診斷）：沒有出勤讀取權限時格子沒有打卡資料，本來就判斷不出型態
const patterns = computed(() => (canViewAttendance ? props.month.patterns.value : []))
const patternsOpen = ref(false)
/** 頁面（格子列首註記、抽屜型態提醒、頁首主要動作）也能開設定檢查 */
defineExpose({ openPatterns: () => { if (canViewAttendance && patterns.value.length) patternsOpen.value = true } })
function onPatternRecords(employeeId: number, date: string): void {
  patternsOpen.value = false
  emit('records', employeeId, date)
}
function onPatternImport(): void {
  patternsOpen.value = false
  emit('import')
}
function onPatternRecalculate(): void {
  patternsOpen.value = false
  emit('recalculate')
}

// 老師確認：進行中輪次的回覆進度（D-07）與老師自行補登的待處理數（SPEC-026 3-3）。
// 狀態只是輔助，讀不到就當沒有進行中，按鈕照常可開抽屜。
// 跟著整月資料重讀：換月、明細處理、關閉確認抽屜（頁面遞增 revision）後都會更新。
const roundProgress = ref<{ replied: number; total: number } | null>(null)
const backdatedPending = ref(0)
/** 這個月的老師確認狀態讀完了沒：沒讀完時目前步驟不下判斷（不然會先閃過「交薪資」） */
const roundsReady = ref(false)
/** 讀輪次失敗：狀態未知，不能當成「沒有進行中」而暗示可以交薪資 */
const roundsFailed = ref(false)
let roundSeq = 0

/** 老師自行補登中行政要動手的筆數（SPEC-026 3-3）。補登清單讀不到只是少了這段，不影響輪次進度。 */
async function loadBackdatedPending(start: string, end: string): Promise<number> {
  try {
    return backdatedPendingCount((await listUnroundedConfirmationItems({ start_date: start, end_date: end })).data)
  } catch {
    return 0
  }
}

async function loadRoundStatus(): Promise<void> {
  if (!canConfirmRounds) return
  const current = ++roundSeq
  const { start, end } = range.value
  let progress: { replied: number; total: number } | null = null
  let pending = 0
  let failed = false
  try {
    const backdated = loadBackdatedPending(start, end)
    const round = pickDisplayRound((await listConfirmationRounds({ start_date: start, end_date: end })).data)
    const employees = round?.status === 'open' ? (await getConfirmationRound(round.id)).data.employees : null
    progress = roundReplyProgress(round, employees)
    pending = await backdated
  } catch {
    progress = null
    pending = 0
    failed = true
  }
  if (current !== roundSeq) return
  roundProgress.value = progress
  backdatedPending.value = pending
  roundsFailed.value = failed
  roundsReady.value = true
}
// data 變 null＝換月載入中或整月請求失敗：先作廢在飛的舊請求並清掉狀態，不殘留上個月的進度
watch(data, (g) => {
  if (g) {
    void loadRoundStatus()
  } else {
    roundSeq += 1
    roundProgress.value = null
    backdatedPending.value = 0
    roundsFailed.value = false
    roundsReady.value = false
  }
}, { immediate: true })

/** 整月摘要：所有計數與封存狀態的唯一來源（utils/attendanceMonthSummary） */
const summary = computed(() => (data.value ? buildMonthSummary(data.value, patterns.value, data.value.today) : null))
/** 還沒回覆確認的人數 */
const confirmOutstanding = computed(() => (roundProgress.value ? roundProgress.value.total - roundProgress.value.replied : 0))
/**
 * 目前輪到哪一步；還在載入（整月資料或老師確認狀態）時為 null。
 * 沒有出勤讀取權限的人看不到匯入／核對，也沒有匯入涵蓋資料可判斷，直接輪到交薪資。
 */
const step = computed<MonthStep | null>(() => {
  const s = summary.value
  if (!s) return null
  if (s.sealState === 'sealed') return 'done'
  // 月份還沒過完不論有沒有匯入資料可看，都還不能交薪資
  if (!canViewAttendance) return s.monthEnded ? 'payroll' : 'waiting'
  if (canConfirmRounds && !roundsReady.value) return null
  const next = currentStep(s, confirmOutstanding.value)
  // 老師確認狀態讀不到＝未知，視為仍需確認：停在這一步，絕不在未知時暗示可以交薪資
  // （月中是 waiting、本來就不暗示可以交薪資，不在此列）
  return next === 'payroll' && roundsFailed.value ? 'confirm' : next
})
/** 步驟 1 是目前這步：該匯入，或前面都做完了、只剩等月底再匯入 */
const importIsCurrent = computed(() => step.value === 'import' || step.value === 'waiting')

// 頁首主要動作與匯出月報前的提醒用同一份摘要；載入失敗不送（避免拿 0 當「都處理完了」）
const emittedSummary = computed(() => (summary.value && step.value ? { ...summary.value, step: step.value } : null))
watch(emittedSummary, (value) => {
  if (value) emit('summary', value)
}, { immediate: true })

// ── 封存 ────────────────────────────────────────────────────────────────────
const sealed = computed(() => (summary.value?.sealState === 'sealed' ? summary.value : null))
/** 封存月早於今天（台北）所在月份才有「下一個要核對的月份」 */
const nextMonth = computed(() => {
  const s = sealed.value
  if (!s) return null
  if (`${s.year}-${String(s.month).padStart(2, '0')}` >= todayTaipeiISO().slice(0, 7)) return null
  return s.month === 12 ? { year: s.year + 1, month: 1 } : { year: s.year, month: s.month + 1 }
})

// ── 步驟列文字 ──────────────────────────────────────────────────────────────
const monthNumber = computed(() => summary.value?.month ?? Number(range.value.start.slice(5, 7)))
/** 還沒有數字可寫時的占位：載入中「…」、載入失敗「—」（不能寫 0 或「沒有」，會被讀成都處理完了） */
const placeholder = computed(() => (loadError.value ? '—' : '…'))
const md = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}

const importValue = computed(() => {
  const s = summary.value
  if (!s) return placeholder.value
  if (step.value === 'waiting') return `已匯入至 ${md(s.importedThrough)}，月底後再匯入`
  const { lastCovered, missingWorkdays } = s.importStatus
  if (!lastCovered) return '還沒匯入'
  if (missingWorkdays.length) return `缺 ${missingWorkdays.length} 個工作日`
  return `已匯入至 ${md(lastCovered)}`
})
/** 一天都還沒匯入：設定問題與逐日待辦都還判斷不出來，「沒有」會被讀成都處理完了 */
const notImported = computed(() => {
  const s = summary.value
  return !!s && !s.importStatus.lastCovered && s.importStatus.missingWorkdays.length > 0
})
const patternsValue = computed(() => {
  const s = summary.value
  if (!s) return placeholder.value
  if (notImported.value) return '等匯入後才能核對'
  return s.patternPeople > 0 ? `${s.patternPeople} 人，修好可清掉 ${s.patternIssueCount} 件` : '沒有'
})
const dailyValue = computed(() => {
  const s = summary.value
  if (!s) return placeholder.value
  if (notImported.value) return '等匯入後才能核對'
  return s.dailyIssueCount > 0 ? `${s.dailyIssueCount} 件` : '沒有'
})
const roundsValue = computed(() => {
  if (!summary.value || !roundsReady.value) return placeholder.value
  if (roundsFailed.value) return '—'
  const progress = roundProgress.value
  const base = progress ? `已回覆 ${progress.replied} / ${progress.total}` : '沒有進行中'
  return backdatedPending.value > 0 ? `${base}・補登待處理 ${backdatedPending.value}` : base
})
const payrollValue = computed(() => {
  if (!summary.value) return placeholder.value
  if (step.value === 'payroll') return '可以交了'
  return step.value === 'waiting' ? '月底後開放' : '前面完成後開放'
})

// ── 手機膠囊 ────────────────────────────────────────────────────────────────
/** 手機預設只顯示膠囊；展開才看完整步驟列（桌機一律顯示） */
const expanded = ref(false)
const showSteps = computed(() => (props.mobile ? expanded.value : true))
const stepsId = useId()
/** 膠囊本體的動作：規則與頁首 primary 相同（匯入要出勤寫入、交薪資要薪資讀取；等老師回覆、載入中沒有） */
const capsuleAction = computed(() => {
  const s = summary.value
  return s ? primaryAction(s, step.value, { writeAttendance: canWriteAttendance, viewSalary: canViewSalary }) : null
})
const capsuleMain = computed(() => {
  const s = summary.value
  const current = step.value
  if (!s || !current) return loadError.value ? '—' : '載入本月進度…'
  // 等老師回覆沒有行政能按的動作，主文改寫在等什麼
  if (current === 'confirm') return '等老師回覆換班'
  // 月份還沒過完、前面都做完了：沒有動作可按。看得到匯入進度的人寫匯入到哪天；看不到的只剩交薪資一步
  if (current === 'waiting') return canViewAttendance ? importValue.value : '交薪資月底後開放'
  // 沒有權限時字照寫（讓人知道下一步是什麼），只是不能點
  return primaryLabel(s, current) ?? ''
})
/** 副文＝下一步摘要 */
const capsuleSub = computed(() => {
  const s = summary.value
  const current = step.value
  if (!s || !current) return ''
  switch (current) {
    case 'import':
      return `${importValue.value}，匯入後才能核對`
    case 'patterns':
      return `修好可清掉 ${s.patternIssueCount} 件${s.dailyIssueCount > 0 ? `，之後還有 ${s.dailyIssueCount} 件逐日待辦` : ''}`
    case 'daily':
      if (confirmOutstanding.value > 0) return '處理完後，等老師回覆換班再交薪資'
      return s.monthEnded ? '處理完就可以交薪資' : '處理完後，月底再交薪資'
    case 'confirm':
      if (roundsFailed.value) return '讀不到老師確認的狀態，先確認再交薪資'
      if (!roundProgress.value) return ''
      return `已回覆 ${roundProgress.value.replied} / ${roundProgress.value.total}，${s.monthEnded ? '回覆完就可以交薪資' : '月底後才能交薪資'}`
    case 'waiting':
      return canViewAttendance ? '交薪資月底後開放' : ''
    case 'payroll':
      return '前面的步驟都完成了'
    default:
      return ''
  }
})
</script>

<style scoped>
.month-progress { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-2); font-size: var(--text-sm); }
.month-progress__error { margin: 0; color: var(--el-color-danger); font-size: var(--text-sm); }

/* 五步驟：一格一步，目前這步用淺底強調（不用側邊色條）；格線用 1px gap 露出容器底色，換行也不會斷線 */
.month-progress__steps {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; counter-reset: month-step;
  margin: 0; padding: 0; list-style: none; overflow: hidden;
  border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); background: var(--el-border-color-lighter);
}
.month-progress__step { display: flex; counter-increment: month-step; background: var(--el-bg-color); }
.month-progress__step.is-current { background: var(--color-primary-lighter); }
.month-progress__action {
  display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0;
  padding: var(--space-2) var(--space-3); border: 0; background: transparent; color: inherit; font: inherit;
  text-align: left; text-decoration: none; cursor: pointer;
}
.month-progress__action:disabled, .month-progress__action.is-static { cursor: default; }
.month-progress__action:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
.month-progress__name { color: var(--el-text-color-regular); font-size: var(--text-xs); font-weight: 600; }
.month-progress__name::before { content: counter(month-step) ' '; }
.month-progress__step.is-current .month-progress__name { color: var(--el-text-color-primary); }
.month-progress__value { color: var(--el-text-color-primary); font-size: var(--text-base); font-weight: 600; font-variant-numeric: tabular-nums; }
.month-progress__value.is-muted { color: var(--el-text-color-regular); font-weight: 400; }
.month-progress__partial { margin: 0; color: var(--el-text-color-regular); }

/* 封存橫幅：灰底中性（封存不是警告，是狀態） */
.month-progress__sealed {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); padding: var(--space-3) var(--space-4);
  border: 1px solid var(--el-border-color); border-radius: var(--radius-md); background: var(--el-fill-color-light);
}
.month-progress__sealed-text { display: flex; flex: 1 1 320px; flex-direction: column; gap: var(--space-1); min-width: 0; }
.month-progress__sealed-text strong { color: var(--el-text-color-primary); font-size: var(--text-base); }
.month-progress__sealed-text span { color: var(--el-text-color-regular); }
.month-progress__go {
  display: inline-flex; align-items: center; min-height: 36px; padding: 0 var(--space-3);
  border: 1px solid var(--color-primary); border-radius: var(--radius-md); background: var(--el-bg-color);
  color: var(--el-text-color-primary); font: inherit; font-weight: 600; cursor: pointer;
}
.month-progress__link { display: inline; padding: 0; border: 0; background: transparent; color: var(--el-color-primary); font: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.month-progress__go:focus-visible, .month-progress__link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.month-progress__capsule-body:focus-visible, .month-progress__toggle:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }

/* 手機膠囊：本體（主要動作）撐滿、至少 60px 高；右側「看進度」是小鈕，不和本體搶點擊 */
.month-progress__capsule {
  display: flex; align-items: stretch; box-sizing: border-box; width: 100%; min-height: 60px;
  border: 1px solid var(--color-primary); border-radius: var(--radius-lg); background: var(--color-primary-lighter); color: var(--el-text-color-primary);
}
.month-progress__capsule.is-idle { border-color: var(--el-border-color); background: var(--el-fill-color-light); color: var(--el-text-color-regular); }
.month-progress__capsule-body {
  display: flex; flex: 1; align-items: center; min-width: 0; padding: var(--space-2) var(--space-4);
  border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.month-progress__capsule-body:disabled { cursor: default; }
.month-progress__capsule-text { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.month-progress__capsule-main { font-size: var(--text-lg); font-weight: 600; }
.month-progress__capsule-sub { color: var(--el-text-color-regular); font-size: var(--text-sm); }
.month-progress__toggle {
  display: inline-flex; flex: none; align-items: center; gap: var(--space-1); min-height: var(--touch-target-min); align-self: center; margin-right: var(--space-2); padding: 0 var(--space-2);
  border: 0; background: transparent; color: var(--el-text-color-regular); font: inherit; font-size: var(--text-sm); cursor: pointer;
}
.month-progress__toggle:disabled { cursor: default; }
.month-progress__chevron { flex: none; width: 16px; height: 16px; transition: transform var(--transition-fast); }
.month-progress__toggle[aria-expanded='true'] .month-progress__chevron { transform: rotate(180deg); }

/* 觸控裝置才把可點區域撐到 44px：桌機也撐的話整列變高、1280 寬把格子推出首屏 */
@media (pointer: coarse) {
  .month-progress__action { min-height: var(--touch-target-min); }
  .month-progress__link { min-height: var(--touch-target-min); }
  .month-progress__go { min-height: var(--touch-target-min); }
}
/* 手機：步驟一列一格 */
@media (--to-sm) {
  .month-progress__steps { grid-template-columns: 1fr; }
}
</style>
