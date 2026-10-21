<template>
  <section class="grid-toolbar" aria-label="班表核對工具列">
    <el-radio-group
      v-if="canMonth"
      :model-value="view ?? 'week'"
      aria-label="週或月檢視"
      data-test="toolbar-view"
      @update:model-value="(v: string | number | boolean | undefined) => emit('update:view', v as GridView)"
    >
      <el-radio-button value="week">週</el-radio-button>
      <el-radio-button value="month">月</el-radio-button>
    </el-radio-group>

    <!-- 頁首已有年月切換時不再放第二組（月模式曾同時出現三個月份選擇） -->
    <div v-if="isMonth && !hideMonthNav" class="grid-toolbar__nav" role="group" aria-label="選擇月份">
      <el-button :icon="ArrowLeft" data-test="toolbar-prev-month" @click="emit('update:date', shiftMonthISO(anchor, -1))">上個月</el-button>
      <el-date-picker
        :model-value="anchor.slice(0, 7)"
        type="month"
        format="YYYY-MM"
        value-format="YYYY-MM"
        :clearable="false"
        aria-label="月份"
        class="grid-toolbar__picker"
        data-test="toolbar-month"
        @update:model-value="(v: string | null) => v && emit('update:date', `${v}-01`)"
      />
      <el-button data-test="toolbar-next-month" @click="emit('update:date', shiftMonthISO(anchor, 1))">下個月 <el-icon><ArrowRight /></el-icon></el-button>
      <span class="grid-toolbar__label">{{ monthLabel }}</span>
    </div>
    <div v-else-if="!isMonth" class="grid-toolbar__nav" role="group" aria-label="選擇週次">
      <el-button :icon="ArrowLeft" data-test="toolbar-prev" :disabled="saving" @click="go(-7)">上週</el-button>
      <el-date-picker
        :model-value="anchor"
        type="date"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        :clearable="false"
        :disabled="saving"
        aria-label="週次日期"
        class="grid-toolbar__picker"
        data-test="toolbar-date"
        @update:model-value="(v: string | null) => v && emit('update:weekStart', v)"
      />
      <el-button data-test="toolbar-next" :disabled="saving" @click="go(7)">下週 <el-icon><ArrowRight /></el-icon></el-button>
      <span class="grid-toolbar__label">{{ weekLabel }}</span>
    </div>

    <el-radio-group
      :model-value="filter"
      aria-label="篩選格子"
      data-test="toolbar-filter"
      @update:model-value="(v: string | number | boolean | undefined) => emit('update:filter', v as GridFilter)"
    >
      <el-radio-button value="all">全部</el-radio-button>
      <el-radio-button value="issues" :title="issueTitle">只看待處理{{ issueText }}</el-radio-button>
      <el-radio-button value="future">只看未來可排</el-radio-button>
    </el-radio-group>

    <el-input
      :model-value="keyword"
      clearable
      placeholder="搜尋姓名或工號"
      aria-label="搜尋人員"
      class="grid-toolbar__keyword"
      data-test="toolbar-keyword"
      @update:model-value="(v: string) => emit('update:keyword', v)"
    />

    <!-- 排班工具收成一個選單（核對時用不到，不和篩選搶位置）；手機不排班，整組收起 -->
    <div v-if="canEditPlan && !isMonth && !compact" class="grid-toolbar__tools" role="group" aria-label="排班工具">
      <el-dropdown :disabled="busy" trigger="click" data-test="toolbar-schedule" @command="onCommand">
        <el-button :disabled="busy">排班工具 <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="copy-prev-week" data-test="toolbar-copy">複製上週排班</el-dropdown-item>
            <el-dropdown-item command="copy-week">複製指定週…</el-dropdown-item>
            <el-dropdown-item command="copy-prev-month">複製上月整月…</el-dropdown-item>
            <el-dropdown-item command="import" divided>匯入班表…</el-dropdown-item>
            <el-dropdown-item command="template">下載匯入範本</el-dropdown-item>
            <el-dropdown-item command="export">匯出本週班表</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <!-- 有變更才出現：停用的「儲存排班（0 處變更）」是整排最搶眼的元素，卻什麼都不能做 -->
      <el-button
        v-if="pendingCount > 0"
        type="primary"
        :loading="saving"
        :disabled="busy"
        data-test="toolbar-save"
        @click="emit('save')"
      >儲存排班（{{ pendingCount }} 處變更）</el-button>
    </div>
    <span v-if="isMonth && pendingCount > 0" class="grid-toolbar__pending" data-test="toolbar-month-pending">
      週模式還有 {{ pendingCount }} 處排班變更未儲存
    </span>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { addDaysISO, shiftMonthISO, type GridFilter, type GridView } from '@/utils/scheduleAttendanceGrid'

export type ToolbarCommand = 'copy-week' | 'copy-prev-month' | 'import' | 'template' | 'export'

const props = defineProps<{
  weekStart: string
  filter: GridFilter
  keyword: string
  canEditPlan: boolean
  pendingCount: number
  saving?: boolean
  busy?: boolean
  issueCount?: number
  /** 檢視（預設週）；月模式唯讀，排班工具收起 */
  view?: GridView
  /** 錨點日期（月模式的年月與上下月以它為準）；沒給用 weekStart */
  date?: string
  /** 可切月模式（桌機） */
  canMonth?: boolean
  /** 待處理中屬於「待修設定」（整月同型態）的格數：篩選鈕拆開寫 */
  patternIssueCount?: number
  /** 手機：收起排班工具 */
  compact?: boolean
  /** 頁首已有月份切換（有出勤讀取權限時）：月模式不再顯示工具列的月份導覽 */
  hideMonthNav?: boolean
}>()
const emit = defineEmits<{
  'update:weekStart': [value: string]
  'update:filter': [value: GridFilter]
  'update:keyword': [value: string]
  'update:view': [value: GridView]
  'update:date': [value: string]
  'copy-prev-week': []
  command: [command: ToolbarCommand]
  save: []
}>()

const isMonth = computed(() => props.view === 'month')
/** 「（本週 49＋待修設定 60）」：待修設定是整月同型態、修好設定會一起消失的格子，和逐日異常分開寫 */
const issueText = computed(() => {
  const total = props.issueCount ?? 0
  if (!total) return ''
  const scope = isMonth.value ? '本月' : '本週'
  const pattern = Math.min(props.patternIssueCount ?? 0, total)
  return pattern ? `（${scope} ${total - pattern}＋待修設定 ${pattern}）` : `（${scope} ${total}）`
})
const issueTitle = computed(() =>
  props.patternIssueCount ? '待修設定：整月同一種情形的格子，多半是員工時段或卡號設定問題，修好設定後重算或重新匯入會一起消失' : undefined)
const anchor = computed(() => props.date ?? props.weekStart)
const monthLabel = computed(() => `${anchor.value.slice(0, 4)} 年 ${Number(anchor.value.slice(5, 7))} 月`)

const weekLabel = computed(() => {
  const end = addDaysISO(props.weekStart, 6)
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number)
    return `${m}/${d}`
  }
  return `${fmt(props.weekStart)}～${fmt(end)}`
})

/**
 * 上下週：錨點決定整頁的月份（本月進度等）。新的一週若仍有日子落在原本的月份，用該週落在原月的第一天
 * （比照 ScheduleGridPanel.openWeek）；整週都離開原月才用週一。直接寫週一會讓跨月週整頁跳到上個月（QA P3）。
 */
function go(days: number): void {
  const monday = addDaysISO(props.weekStart, days)
  const sunday = addDaysISO(monday, 6)
  const month = anchor.value.slice(0, 7)
  const monthStart = `${month}-01`
  const overlapsMonth = monday.slice(0, 7) === month || sunday.slice(0, 7) === month
  emit('update:weekStart', overlapsMonth && monday < monthStart ? monthStart : monday)
}

function onCommand(command: string | number | object): void {
  if (command === 'copy-prev-week') emit('copy-prev-week')
  else emit('command', command as ToolbarCommand)
}
</script>

<style scoped>
.grid-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.grid-toolbar__nav, .grid-toolbar__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.grid-toolbar__tools { margin-left: auto; }
.grid-toolbar__picker { width: 132px; }
.grid-toolbar__keyword { width: 168px; }
.grid-toolbar__pending { margin-left: auto; color: var(--color-warning-darker); font-size: var(--text-sm); }
.grid-toolbar__label { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
/* 桌機：捲動時工具列（週次、篩選、儲存排班）固定在捲動區頂端，改到第 60 列也按得到儲存 */
@media (--bp-sm) {
  .grid-toolbar { position: sticky; top: 0; z-index: var(--z-sticky); margin-bottom: 0; padding: var(--space-2) 0 var(--space-3); background: var(--bg-color); }
}
@media (--to-sm) {
  .grid-toolbar__tools { margin-left: 0; }
}
</style>
