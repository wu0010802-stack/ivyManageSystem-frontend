<template>
  <section class="grid-toolbar" aria-label="班表核對工具列">
    <div class="grid-toolbar__nav" role="group" aria-label="選擇週次">
      <el-button :icon="ArrowLeft" data-test="toolbar-prev" @click="go(-7)">上週</el-button>
      <el-date-picker
        :model-value="weekStart"
        type="date"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        :clearable="false"
        aria-label="週次日期"
        class="grid-toolbar__picker"
        data-test="toolbar-date"
        @update:model-value="(v: string | null) => v && emit('update:weekStart', mondayOf(v))"
      />
      <el-button data-test="toolbar-next" @click="go(7)">下週 <el-icon><ArrowRight /></el-icon></el-button>
      <span class="grid-toolbar__label">{{ weekLabel }}</span>
    </div>

    <el-radio-group
      :model-value="filter"
      size="small"
      aria-label="篩選格子"
      data-test="toolbar-filter"
      @update:model-value="(v: string | number | boolean | undefined) => emit('update:filter', v as GridFilter)"
    >
      <el-radio-button value="all">全部</el-radio-button>
      <el-radio-button value="issues">只看有問題{{ issueCount ? `（${issueCount}）` : '' }}</el-radio-button>
      <el-radio-button value="future">只看未來可排</el-radio-button>
    </el-radio-group>

    <div v-if="canEditPlan" class="grid-toolbar__tools" role="group" aria-label="排班工具">
      <el-dropdown split-button :disabled="busy" data-test="toolbar-copy" @click="emit('copy-prev-week')" @command="onCommand">
        複製上週排班
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="copy-week">複製指定週…</el-dropdown-item>
            <el-dropdown-item command="copy-prev-month">複製上月整月…</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown data-test="toolbar-io" @command="onCommand">
        <el-button>匯入匯出 <el-icon><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="import">匯入班表…</el-dropdown-item>
            <el-dropdown-item command="template">下載匯入範本</el-dropdown-item>
            <el-dropdown-item command="export">匯出本週班表</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="pendingCount === 0 || busy"
        data-test="toolbar-save"
        @click="emit('save')"
      >儲存排班（{{ pendingCount }} 處變更）</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { addDaysISO, mondayOf, type GridFilter } from '@/utils/scheduleAttendanceGrid'

export type ToolbarCommand = 'copy-week' | 'copy-prev-month' | 'import' | 'template' | 'export'

const props = defineProps<{
  weekStart: string
  filter: GridFilter
  canEditPlan: boolean
  pendingCount: number
  saving?: boolean
  busy?: boolean
  issueCount?: number
}>()
const emit = defineEmits<{
  'update:weekStart': [value: string]
  'update:filter': [value: GridFilter]
  'copy-prev-week': []
  command: [command: ToolbarCommand]
  save: []
}>()

const weekLabel = computed(() => {
  const end = addDaysISO(props.weekStart, 6)
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number)
    return `${m}/${d}`
  }
  return `${fmt(props.weekStart)}～${fmt(end)}`
})

function go(days: number): void {
  emit('update:weekStart', addDaysISO(props.weekStart, days))
}

function onCommand(command: string | number | object): void {
  emit('command', command as ToolbarCommand)
}
</script>

<style scoped>
.grid-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.grid-toolbar__nav, .grid-toolbar__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.grid-toolbar__tools { margin-left: auto; }
.grid-toolbar__picker { width: 150px; }
.grid-toolbar__label { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
@media (--to-sm) {
  .grid-toolbar__tools { margin-left: 0; }
}
</style>
