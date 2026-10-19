<template>
  <div class="workspace-header">
    <div class="workspace-header__nav" role="group" aria-label="選擇月份">
      <el-button aria-label="上個月" :icon="ArrowLeft" circle @click="prevMonth" />
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
      <el-button aria-label="下個月" :icon="ArrowRight" circle @click="nextMonth" />
    </div>

    <div class="workspace-header__actions">
      <el-button :icon="Monitor" @click="openKiosk">電子打卡</el-button>
      <el-button v-if="canWrite" @click="emit('import')">匯入打卡紀錄</el-button>
      <el-dropdown trigger="click" aria-label="月結工具" @command="onMonthTool">
        <el-button>月結 <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="canPayrollCompare" command="payroll">薪資扣項核對</el-dropdown-item>
            <el-dropdown-item command="export">匯出月報</el-dropdown-item>
            <el-dropdown-item v-if="canWrite" command="recalculate">重算本月出勤…</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 排班與出勤頁首列：月份切換＋動作（電子打卡、匯入打卡紀錄、月結選單）。
 * 本月出勤統計在出勤明細頁籤（AttendanceMonthStats），不在這裡。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowLeft, ArrowRight, Monitor } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

const props = defineProps<{
  year: number
  month: number
  /** 可做薪資扣項核對（月結選單才列出） */
  canPayrollCompare?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:year', v: number): void
  (e: 'update:month', v: number): void
  /** 上／下個月：年月一起送，跨年時才不會先換年、再用舊年份換月 */
  (e: 'update:period', year: number, month: number): void
  (e: 'import'): void
  (e: 'export'): void
  (e: 'payroll'): void
  /** 依目前班表重算本月已匯入的出勤（改了員工上下班時間或班別時段之後） */
  (e: 'recalculate'): void
}>()

const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))

const router = useRouter()

// 電子打卡台為免登入、全屏、無側邊導航的獨立 kiosk 頁；新分頁開啟以免中斷後台操作
function openKiosk() {
  window.open(router.resolve({ name: 'kiosk-punch' }).href, '_blank')
}

function onMonthTool(command: string | number | object): void {
  if (command === 'payroll') emit('payroll')
  else if (command === 'export') emit('export')
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
.workspace-header__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.workspace-header__actions .el-button { margin-left: 0; }

/* 手機：月份切換撐滿一列，圓鈕與動作鈕到觸控高度，動作列等寬鋪滿 */
@media (--to-sm) {
  .workspace-header, .workspace-header__nav, .workspace-header__actions { width: 100%; }
  .workspace-header__nav .el-select { flex: 1 1 0; width: auto; }
  .workspace-header__nav .el-button { width: var(--touch-target-min); height: var(--touch-target-min); flex: 0 0 auto; }
  .workspace-header__actions > * { flex: 1 1 0; }
  .workspace-header__actions .el-button { width: 100%; min-height: var(--touch-target-min); }
}
</style>
