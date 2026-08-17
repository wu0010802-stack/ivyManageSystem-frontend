<template>
  <div class="admin-list-toolbar">
    <div v-if="searchable" class="admin-list-toolbar__search" data-test="toolbar-search">
      <!-- aria-label 落在內層 input（el-input 透傳 attrs）；placeholder 不是 label，
           螢幕閱讀器需要明確名稱 -->
      <el-input
        :model-value="search"
        :placeholder="searchPlaceholder"
        :prefix-icon="Search"
        :aria-label="searchPlaceholder"
        clearable
        @update:model-value="(v) => emit('update:search', String(v ?? ''))"
      />
    </div>

    <div
      v-for="group in filters"
      :key="group.key"
      class="admin-list-toolbar__filter"
      :data-test="`toolbar-filter-${group.key}`"
    >
      <span class="admin-list-toolbar__filter-label">{{ group.label }}</span>
      <el-radio-group
        size="small"
        :model-value="currentValue(group.key)"
        @update:model-value="(v) => onFilterChange(group.key, v)"
      >
        <el-radio-button
          v-for="opt in withAllOption(group)"
          :key="String(opt.value)"
          :value="opt.value"
        >
          {{ opt.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="admin-list-toolbar__spacer" />

    <span class="admin-list-toolbar__count" data-test="toolbar-count">{{ countText }}</span>

    <slot name="actions" />

    <el-button
      v-if="exportable"
      type="success"
      :loading="exporting"
      data-test="toolbar-export"
      @click="emit('export')"
    >
      匯出 Excel
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Search } from '@element-plus/icons-vue'

export interface FilterOption {
  label: string
  value: string | number
}
export interface FilterGroup {
  key: string
  label: string
  options: FilterOption[]
  allLabel?: string
}

const props = withDefaults(
  defineProps<{
    search?: string
    searchable?: boolean
    searchPlaceholder?: string
    filters?: FilterGroup[]
    filterValues?: Record<string, unknown>
    total?: number
    shown?: number
    exportable?: boolean
    exporting?: boolean
  }>(),
  {
    search: '',
    searchable: true,
    searchPlaceholder: '搜尋...',
    filters: () => [],
    filterValues: () => ({}),
    total: 0,
    shown: undefined,
    exportable: false,
    exporting: false,
  },
)

const emit = defineEmits<{
  'update:search': [value: string]
  'update:filter-values': [value: Record<string, unknown>]
  export: []
}>()

const ALL_VALUE = '__all__'

const currentValue = (key: string): string | number => {
  const v = props.filterValues[key]
  return v === undefined || v === null || v === '' ? ALL_VALUE : (v as string | number)
}

const withAllOption = (group: FilterGroup): FilterOption[] => [
  { label: group.allLabel ?? '全部', value: ALL_VALUE },
  ...group.options,
]

const onFilterChange = (key: string, value: unknown) => {
  const next = { ...props.filterValues }
  if (value === ALL_VALUE) {
    delete next[key]
  } else {
    next[key] = value
  }
  emit('update:filter-values', next)
}

const countText = computed(() => {
  if (props.shown !== undefined && props.shown !== props.total) {
    return `顯示 ${props.shown} / 共 ${props.total} 筆`
  }
  return `共 ${props.total} 筆`
})
</script>

<style scoped>
.admin-list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.admin-list-toolbar__search {
  width: 280px;
}
.admin-list-toolbar__filter {
  display: flex;
  align-items: center;
  gap: 6px;
}
.admin-list-toolbar__filter-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.admin-list-toolbar__spacer {
  flex: 1 1 auto;
}
.admin-list-toolbar__count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 手機（≤767.98px）：搜尋框撐滿、篩選段落鈕改橫向捲動、
   筆數與動作鈕收同一列，觸控目標對齊 44px。共用元件一次改，11 個列表頁同時受益 */
@media (--to-sm) {
  .admin-list-toolbar__search {
    width: 100%;
  }
  .admin-list-toolbar__filter {
    max-width: 100%;
    overflow-x: auto;
  }
  .admin-list-toolbar__filter-label {
    white-space: nowrap;
  }
  /* 段落鈕不換行改捲動：radio-button 換行會斷開首尾圓角的膠囊外觀 */
  .admin-list-toolbar__filter :deep(.el-radio-group) {
    flex-wrap: nowrap;
  }
  .admin-list-toolbar__filter :deep(.el-radio-button__inner) {
    min-height: var(--touch-target-min);
    display: inline-flex;
    align-items: center;
  }
  .admin-list-toolbar__spacer {
    display: none;
  }
  .admin-list-toolbar__count {
    flex: 1 1 auto;
  }
  .admin-list-toolbar :deep(.el-button) {
    min-height: var(--touch-target-min);
  }
}
</style>
