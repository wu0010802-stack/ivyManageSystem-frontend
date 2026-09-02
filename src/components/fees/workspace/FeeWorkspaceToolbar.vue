<template>
  <div class="fee-ws-toolbar">
    <!-- 次層檢視：深色文字頁籤（與主導航的底線頁籤在視覺上分層） -->
    <div
      v-if="views.length"
      class="fee-ws-toolbar__tabs"
      role="tablist"
      :aria-label="tabsLabel"
      :data-test="tabsTestId"
    >
      <button
        v-for="v in views"
        :key="v.key"
        type="button"
        role="tab"
        class="fee-subtab"
        :class="{ 'fee-subtab--active': v.key === view }"
        :aria-selected="v.key === view"
        :data-test="`${tabsTestId}-${v.key}`"
        @click="onSelect(v.key)"
      >
        {{ v.label }}
        <span v-if="counts?.[v.key]" class="fee-subtab__count">{{ counts[v.key] }}</span>
      </button>
    </div>

    <!-- 說明：教學文字不常駐佔版面，收進問號 popover -->
    <el-popover
      v-if="$slots.help"
      :width="360"
      placement="bottom-start"
      trigger="click"
      popper-class="fee-help-popover"
    >
      <template #reference>
        <button
          type="button"
          class="fee-help-btn"
          :aria-label="helpLabel"
          data-test="fee-help-btn"
        >
          ?
        </button>
      </template>
      <div class="fee-help">
        <slot name="help" />
      </div>
    </el-popover>

    <!-- lead＝本檢視內的「看哪一塊」切換（月表／逐筆、代收／存摺），
         與右側的「做什麼」動作分開放，避免兩種語意混在同一區 -->
    <slot name="lead" />

    <span class="fee-ws-toolbar__spacer" />

    <slot name="actions" />
  </div>
</template>

<script setup lang="ts">
/**
 * 學費管理各工作區共用的工具列版型（2026-09-02 簡化改版）。
 *
 * 版型固定為：左＝次層檢視頁籤 ＋ 說明問號；右＝篩選脈絡與動作（actions slot，
 * 由呼叫端決定，慣例是「次要動作…唯一一顆主要動作」置於最右）。
 *
 * 改版前五個工作區各自寫一份 `workspace-bar`（el-segmented ＋ 散落的 hint 文字
 * ＋ 各自不同的按鈕位置），使用者每切一個檢視就要重新找按鈕。此元件把版型
 * 收斂成一處，教學文字統一收進 popover。
 */
import type { FeeWorkspaceViewDef } from './feesNavigation'

const props = withDefaults(
  defineProps<{
    /** 次層檢視定義；空陣列時不渲染頁籤（例如工作台） */
    views?: FeeWorkspaceViewDef[]
    /** 目前檢視 key */
    view?: string | null
    /** 各檢視的待辦數徽章（0 或未給則不顯示） */
    counts?: Record<string, number | undefined>
    /** 頁籤群組的無障礙名稱 */
    tabsLabel?: string
    /** data-test 前綴，例如 billing-view → billing-view-receivable */
    tabsTestId?: string
    /** 說明按鈕的無障礙名稱 */
    helpLabel?: string
  }>(),
  {
    views: () => [],
    view: null,
    counts: undefined,
    tabsLabel: '檢視切換',
    tabsTestId: 'ws-view',
    helpLabel: '顯示本頁使用說明',
  },
)

const emit = defineEmits<{ 'change-view': [view: string] }>()

function onSelect(key: string) {
  if (key !== props.view) emit('change-view', key)
}
</script>

<style scoped>
.fee-ws-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  row-gap: var(--space-2);
  margin-bottom: var(--space-3);
  min-height: var(--touch-target-min);
}

.fee-ws-toolbar__spacer {
  flex: 1 1 auto;
}

.fee-ws-toolbar__tabs {
  display: inline-flex;
  gap: var(--space-1);
}

.fee-subtab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  font: inherit;
  font-size: var(--text-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.fee-subtab:hover {
  background: var(--bg-color-soft);
  color: var(--text-primary);
}

/* 深色作用態：與主導航的 primary 底線頁籤分層（同色會讓兩層看起來一樣重）。
   用 EP 既有 token 的反白配對，不新增 deprecated 的 --neutral-* 用法。 */
.fee-subtab--active,
.fee-subtab--active:hover {
  background: var(--el-text-color-primary);
  color: var(--el-bg-color);
  font-weight: 500;
}

.fee-subtab__count {
  min-width: 18px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
}

.fee-help-btn {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--surface-color);
  color: var(--text-tertiary);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.fee-help-btn:hover,
.fee-help-btn:focus-visible {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.fee-help {
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--text-primary);
}

.fee-help :deep(p) {
  margin: 0 0 var(--space-2);
}

.fee-help :deep(p:last-child) {
  margin-bottom: 0;
}

.fee-help :deep(ol),
.fee-help :deep(ul) {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-5);
}

.fee-help :deep(li) {
  margin-bottom: var(--space-1);
}

.fee-help :deep(.fee-help__note) {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}
</style>
