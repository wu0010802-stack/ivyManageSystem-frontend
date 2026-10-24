<template>
  <div class="workspace-header" :class="{ 'workspace-header--mobile': mobile }">
    <div class="workspace-header__nav" role="group" aria-label="選擇月份">
      <el-button aria-label="上個月" :icon="ArrowLeft" circle @click="prevMonth" />
      <!-- 手機一列放不下兩個下拉：年月寫成文字，換月用上／下個月鈕 -->
      <strong v-if="mobile" class="workspace-header__period" data-test="header-period">{{ year }} 年 {{ month }} 月</strong>
      <template v-else>
        <el-select
          :model-value="year"
          class="workspace-header__year"
          aria-label="年份"
          @update:model-value="(v: number) => emit('update:year', Number(v))"
        >
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select
          :model-value="month"
          class="workspace-header__month"
          aria-label="月份"
          @update:model-value="(v: number) => emit('update:month', Number(v))"
        >
          <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
      </template>
      <el-button aria-label="下個月" :icon="ArrowRight" circle @click="nextMonth" />
    </div>

    <!-- 月份狀態：文字＋形狀（圓點／空心圓／鎖頭）表達，不只靠顏色；還不知道這個月的狀態就不畫 -->
    <span v-if="sealState" class="workspace-header__status" :class="`is-${sealState}`" data-test="header-status">
      <svg v-if="sealState === 'sealed'" class="workspace-header__lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" data-test="header-status-lock"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      <span v-else class="workspace-header__mark" aria-hidden="true" />
      {{ STATUS_TEXT[sealState] }}
    </span>

    <!-- 手機：頁首只留一列，匯入、電子打卡台、月底作業全收進 ⋯；主要動作由進度膠囊負責 -->
    <el-dropdown v-if="mobile" trigger="click" @command="onMenuCommand">
      <el-button circle :icon="MoreFilled" aria-label="更多動作" data-test="header-more" />
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="canImport" command="import">匯入打卡紀錄</el-dropdown-item>
          <el-dropdown-item command="kiosk">開電子打卡台</el-dropdown-item>
          <el-dropdown-item v-if="canPayrollCompare" command="payroll" divided>薪資扣項核對</el-dropdown-item>
          <el-dropdown-item command="export" :divided="!canPayrollCompare">匯出月報</el-dropdown-item>
          <el-dropdown-item v-if="canPrintAppraisal" command="appraisal">批次列印考核表</el-dropdown-item>
          <el-dropdown-item v-if="canWrite" command="recalculate">重算本月出勤…</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <div v-else class="workspace-header__actions">
      <!-- 電子打卡台是給打卡用的平板開的，行政很少從這裡開：退成文字連結，不和匯入同級 -->
      <el-button link :icon="Monitor" class="workspace-header__kiosk" data-test="header-kiosk" @click="openKiosk">開電子打卡台</el-button>
      <!-- 主要動作是匯入時，匯入鈕自己就是那顆 primary（整列只有一顆） -->
      <el-button v-if="canImport" :type="importIsPrimary ? 'primary' : undefined" data-test="header-import" @click="onImport">{{ importLabel }}</el-button>
      <!-- 選單裡是月底要做的事（核對扣項、匯出、重算），封存在薪資結算：叫「月結」會以為按了就結帳 -->
      <el-dropdown trigger="click" aria-label="月底作業" @command="onMenuCommand">
        <el-button data-test="header-month-tools">月底作業 <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="canPayrollCompare" command="payroll">薪資扣項核對</el-dropdown-item>
            <el-dropdown-item command="export">匯出月報</el-dropdown-item>
            <el-dropdown-item v-if="canPrintAppraisal" command="appraisal">批次列印考核表</el-dropdown-item>
            <el-dropdown-item v-if="canWrite" command="recalculate">重算本月出勤…</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <!-- 其他步驟的主要動作放在最右（先修設定、處理待辦、交薪資）；沒有（等老師回覆、已封存）就不放 -->
      <el-button v-if="primary && primary.action !== 'import'" type="primary" class="workspace-header__primary" data-test="header-primary" @click="emit('primary', primary.action)">{{ primary.label }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 排班與出勤頁首列：月份切換＋月份狀態膠囊＋動作（匯入打卡紀錄、月底作業選單、電子打卡台連結、
 * 隨月份狀態變的主要動作）。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowLeft, ArrowRight, MoreFilled, Monitor } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import type { PrimaryAction, PrimaryActionSpec, SealState } from '@/utils/attendanceMonthSummary'

const props = defineProps<{
  year: number
  month: number
  /** 可做薪資扣項核對（月結選單才列出） */
  canPayrollCompare?: boolean
  /** 可批次列印月考核表（月底作業選單才列出；含薪資金額，需全員薪資視野） */
  canPrintAppraisal?: boolean
  /** 目前步驟的主要動作（整頁只有一顆 primary）；null＝沒有（等老師回覆、已封存、載入中、沒有權限）。手機不放，由進度膠囊負責 */
  primary?: PrimaryActionSpec | null
  /** 這個月的封存狀態；還不知道（摘要還沒載入）就不傳，不畫膠囊 */
  sealState?: SealState
  /** 手機：頁首收成一列（上個月、年月、下個月、狀態膠囊、⋯） */
  mobile?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:year', v: number): void
  (e: 'update:month', v: number): void
  /** 上／下個月：年月一起送，跨年時才不會先換年、再用舊年份換月 */
  (e: 'update:period', year: number, month: number): void
  (e: 'import'): void
  (e: 'export'): void
  (e: 'payroll'): void
  (e: 'appraisal'): void
  /** 依目前班表重算本月已匯入的出勤（改了員工上下班時間或班別時段之後） */
  (e: 'recalculate'): void
  /** 按了主要按鈕（匯入也算：它是 primary 時送這個，不送 import） */
  (e: 'primary', action: PrimaryAction): void
}>()

const STATUS_TEXT: Record<SealState, string> = {
  open: '核對中',
  partial: '部分封存',
  sealed: '已封存・唯讀',
}

const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))
/** 匯入入口：要出勤寫入權限，且月份還沒整月封存（後端本來就拒收已封存月份的匯入） */
const canImport = computed(() => canWrite.value && props.sealState !== 'sealed')
const importIsPrimary = computed(() => props.primary?.action === 'import')
const importLabel = computed(() => (props.primary?.action === 'import' ? props.primary.label : '匯入打卡紀錄'))

function onImport(): void {
  if (importIsPrimary.value) emit('primary', 'import')
  else emit('import')
}

const router = useRouter()

// 電子打卡台為免登入、全屏、無側邊導航的獨立 kiosk 頁；新分頁開啟以免中斷後台操作
function openKiosk() {
  window.open(router.resolve({ name: 'kiosk-punch' }).href, '_blank')
}

/** 月底作業選單（桌機）與 ⋯ 選單（手機）共用 */
function onMenuCommand(command: string | number | object): void {
  if (command === 'import') emit('import')
  else if (command === 'kiosk') openKiosk()
  else if (command === 'payroll') emit('payroll')
  else if (command === 'export') emit('export')
  else if (command === 'appraisal') emit('appraisal')
  else if (command === 'recalculate') emit('recalculate')
}

const now = new Date()
const yearOptions = computed(() => {
  const base = props.year || now.getFullYear()
  return [base - 2, base - 1, base, base + 1, base + 2]
})

function prevMonth() {
  if (props.month === 1) emit('update:period', props.year - 1, 12)
  else emit('update:period', props.year, props.month - 1)
}

function nextMonth() {
  if (props.month === 12) emit('update:period', props.year + 1, 1)
  else emit('update:period', props.year, props.month + 1)
}
</script>

<style scoped>
.workspace-header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-5); }
.workspace-header__nav { display: flex; align-items: center; gap: var(--space-2); }
.workspace-header__nav .el-button { margin-left: 0; }
.workspace-header__year { width: 7rem; }
.workspace-header__month { width: 6rem; }
.workspace-header__period { font-size: var(--text-lg); font-variant-numeric: tabular-nums; white-space: nowrap; }
.workspace-header__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.workspace-header__actions .el-button { margin-left: 0; }
/* 電子打卡台退成連結排在動作鈕之後；主要動作在最右 */
.workspace-header__kiosk { order: 1; }
.workspace-header__primary { order: 2; }

/* 月份狀態膠囊：核對中＝主色淡底＋實心圓點、部分封存＝黃淡底＋空心圓、已封存＝中性灰＋鎖頭（封存是狀態、不是警告） */
.workspace-header__status {
  display: inline-flex; align-items: center; gap: var(--space-1); min-height: 26px; padding: 0 var(--space-3);
  border-radius: var(--radius-full); color: var(--el-text-color-primary); font-size: var(--text-sm); font-weight: 600; white-space: nowrap;
}
.workspace-header__status.is-open { background: var(--color-primary-lighter); }
.workspace-header__status.is-partial { background: var(--el-color-warning-light-9); }
.workspace-header__status.is-sealed { background: var(--el-fill-color); color: var(--el-text-color-regular); }
.workspace-header__mark { box-sizing: border-box; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); }
.workspace-header__status.is-partial .workspace-header__mark { border: 2px solid var(--el-color-warning); background: transparent; }
.workspace-header__lock { flex: none; width: 12px; height: 12px; }

/* 手機一列：上個月、年月、下個月、狀態膠囊、⋯ 都不換行；年月文字可收縮，圓鈕到觸控高度 */
.workspace-header--mobile { flex-wrap: nowrap; gap: var(--space-1); width: 100%; }
.workspace-header--mobile .workspace-header__nav { flex: 1 1 auto; gap: var(--space-1); min-width: 0; }
.workspace-header--mobile .workspace-header__nav .el-button,
.workspace-header--mobile > .el-dropdown .el-button { flex: none; width: var(--touch-target-min); height: var(--touch-target-min); margin-left: 0; }
.workspace-header--mobile .workspace-header__period { flex: 1 1 auto; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; }
.workspace-header--mobile .workspace-header__status { flex: none; }
</style>
