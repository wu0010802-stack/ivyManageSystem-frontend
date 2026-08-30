<template>
  <div class="admin-list-toolbar" :class="{ 'is-mobile': isMobile }">
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

    <!-- 手機：篩選收進 bottom sheet，常駐列只留搜尋＋篩選鈕，把垂直空間還給資料。
         桌機維持原本常駐段落鈕，行為與版面逐字不變。 -->
    <el-button
      v-if="isMobile && filters.length"
      class="admin-list-toolbar__filter-trigger"
      data-test="toolbar-filter-trigger"
      :type="activeFilters.length ? 'primary' : 'default'"
      :plain="activeFilters.length > 0"
      :icon="Filter"
      @click="sheetOpen = true"
    >
      篩選<template v-if="activeFilters.length">（{{ activeFilters.length }}）</template>
    </el-button>

    <template v-if="!isMobile">
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
    </template>

    <!-- 手機：已選條件以可移除 chip 攤開，避免條件藏在 sheet 裡看不見 -->
    <div
      v-if="isMobile && activeFilters.length"
      class="admin-list-toolbar__chips"
      data-test="toolbar-chips"
    >
      <!-- 整顆 chip 都是移除目標：EP 的關閉圖示只有 20px，達不到 44px 觸控下限。
           X 保留作為「可移除」的視覺提示。 -->
      <el-tag
        v-for="chip in activeFilters"
        :key="chip.key"
        :data-test="`toolbar-chip-${chip.key}`"
        type="info"
        closable
        disable-transitions
        role="button"
        tabindex="0"
        :aria-label="`移除篩選條件 ${chip.label}：${chip.valueLabel}`"
        @close="onFilterChange(chip.key, ALL_VALUE)"
        @click="onFilterChange(chip.key, ALL_VALUE)"
        @keydown.enter.prevent="onFilterChange(chip.key, ALL_VALUE)"
        @keydown.space.prevent="onFilterChange(chip.key, ALL_VALUE)"
      >
        {{ chip.label }}：{{ chip.valueLabel }}
      </el-tag>
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

    <!-- 篩選 sheet：由下往上，拇指可及；側向抽屜在手機會蓋掉整個內容區 -->
    <el-drawer
      v-if="isMobile && filters.length"
      v-model="sheetOpen"
      class="admin-list-toolbar__sheet"
      title="篩選"
      direction="btt"
      size="auto"
      data-test="toolbar-filter-sheet"
    >
      <div
        v-for="group in filters"
        :key="group.key"
        class="admin-list-toolbar__sheet-group"
        :data-test="`toolbar-sheet-filter-${group.key}`"
      >
        <span class="admin-list-toolbar__filter-label">{{ group.label }}</span>
        <el-radio-group
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

      <template #footer>
        <div class="admin-list-toolbar__sheet-actions">
          <el-button
            data-test="toolbar-filter-clear"
            :disabled="!activeFilters.length"
            @click="clearFilters"
          >
            清除全部
          </el-button>
          <el-button type="primary" data-test="toolbar-filter-done" @click="sheetOpen = false">
            查看結果
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Filter, Search } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'

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

const { isMobile } = useIsMobile()
const sheetOpen = ref(false)

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

/** 目前生效的篩選條件（供手機 chip 與篩選鈕數量標示）。值對不到選項時退回原始值字串。 */
const activeFilters = computed(() =>
  props.filters
    .filter((g) => currentValue(g.key) !== ALL_VALUE)
    .map((g) => {
      const v = currentValue(g.key)
      const hit = g.options.find((o) => o.value === v)
      return { key: g.key, label: g.label, valueLabel: hit ? hit.label : String(v) }
    }),
)

/** 只清掉本工具列宣告的篩選 key，不動消費端塞在 filterValues 裡的其他狀態。 */
const clearFilters = () => {
  const next = { ...props.filterValues }
  props.filters.forEach((g) => delete next[g.key])
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

/* 手機（≤767.98px）：搜尋框與篩選鈕併一列、已選條件以 chip 攤開整寬，
   筆數與動作鈕收同一列，觸控目標對齊 44px。共用元件一次改，11 個列表頁同時受益 */
@media (--to-sm) {
  .admin-list-toolbar__search {
    flex: 1 1 60%;
    width: auto;
    min-width: 0;
  }
  .admin-list-toolbar__filter-trigger {
    min-height: var(--touch-target-min);
    flex: 0 0 auto;
  }
  .admin-list-toolbar__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    width: 100%;
  }
  /* 整顆 chip 是觸控目標，對齊 44px 下限（EP 的 .el-tag__close 只有 20px） */
  .admin-list-toolbar__chips :deep(.el-tag) {
    min-height: var(--touch-target-min);
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }
  .admin-list-toolbar__chips :deep(.el-tag__close) {
    width: var(--space-5);
    height: var(--space-5);
    font-size: var(--text-base);
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

/* 篩選 sheet 內部：每組直向堆疊、選項可換行，觸控目標 44px */
.admin-list-toolbar__sheet-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.admin-list-toolbar__sheet-group :deep(.el-radio-group) {
  flex-wrap: wrap;
}
.admin-list-toolbar__sheet-group :deep(.el-radio-button__inner) {
  min-height: var(--touch-target-min);
  display: inline-flex;
  align-items: center;
}
.admin-list-toolbar__sheet-actions {
  display: flex;
  gap: var(--space-3);
}
.admin-list-toolbar__sheet-actions :deep(.el-button) {
  flex: 1 1 0;
  min-height: var(--touch-target-min);
}
/* sheet 高度自適應內容，過長才內捲；底部留系統手勢列空間 */
.admin-list-toolbar__sheet :deep(.el-drawer__body) {
  max-height: 60dvh;
  overflow-y: auto;
}
.admin-list-toolbar__sheet :deep(.el-drawer__footer) {
  padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
}
</style>
