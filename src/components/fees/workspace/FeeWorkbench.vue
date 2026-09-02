<template>
  <section class="fee-workbench" aria-label="學費管理工作台">
    <p class="context-line">
      今天 {{ today }}<span aria-hidden="true"> ・ </span>統計月份 {{ monthLabel }}
    </p>

    <el-skeleton v-if="loading" :rows="5" animated data-test="workbench-skeleton" />

    <ul v-else class="queue" data-test="workbench-queue">
      <li v-if="actionItems.length" class="queue-section">
        待處理<span class="queue-section__count">{{ actionItems.length }}</span>
      </li>
      <li
        v-for="item in actionItems"
        :key="item.key"
        class="queue-row queue-row--action"
        :data-test="`workbench-row-${item.key}`"
      >
        <!-- 整列可點：按鈕只是視覺提示，真正的點擊目標是整列（Fitts' law） -->
        <button
          type="button"
          class="queue-row__hit"
          :aria-label="`${item.title}：${item.actionLabel}`"
          :data-test="`workbench-action-${item.key}`"
          @click="emit('navigate', item.target)"
        >
          <span class="row-status" data-state="action">
            <el-icon class="row-status__icon" aria-hidden="true"><Warning /></el-icon>
            <span class="sr-only">待處理</span>
          </span>
          <span class="row-main">
            <span class="row-title">{{ item.title }}</span>
            <span v-if="item.detail" class="row-detail">{{ item.detail }}</span>
          </span>
          <span class="row-go">{{ item.actionLabel }}<span aria-hidden="true"> ›</span></span>
        </button>
      </li>

      <li v-if="restItems.length" class="queue-section">沒有待辦</li>
      <li
        v-for="item in restItems"
        :key="item.key"
        class="queue-row"
        :data-test="`workbench-row-${item.key}`"
      >
        <button
          type="button"
          class="queue-row__hit"
          :aria-label="`${item.title}：${item.actionLabel}`"
          :data-test="`workbench-action-${item.key}`"
          @click="emit('navigate', item.target)"
        >
          <span class="row-status" :data-state="item.state">
            <el-icon class="row-status__icon" aria-hidden="true">
              <CircleCheck v-if="item.state === 'ok'" />
              <MoreFilled v-else />
            </el-icon>
            <span class="sr-only">{{ FEE_QUEUE_STATE_TEXT[item.state] }}</span>
          </span>
          <span class="row-main">
            <span class="row-title">{{ item.title }}</span>
            <span v-if="item.detail" class="row-detail">{{ item.detail }}</span>
          </span>
          <span class="row-go row-go--muted">
            {{ item.actionLabel }}<span aria-hidden="true"> ›</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * 學費管理工作台：以工作佇列呈現「現在需要處理什麼」。
 *
 * 2026-09-02 改版：
 * - 待處理項目集中在最上方且依金額大到小排序，沒有待辦的收到下方分組；
 *   改版前六項固定順序混排，使用者得逐列讀圖示才知道哪件事要做。
 * - 整列可點（原本只有右側小按鈕是點擊目標）。
 * - 資料載入抽到 useFeeOverview，與主導航頁籤的待辦數共用同一次載入。
 *
 * 原則：拿不到可靠數字的項目只顯示狀態與入口，絕不顯示推估／假數字。
 * 佇列不含任何學生姓名等 PII，只有聚合計數與金額。
 */
import { onActivated, onMounted } from 'vue'
import { CircleCheck, MoreFilled, Warning } from '@element-plus/icons-vue'
import type { FeeNavTarget } from './feesNavigation'
import { FEE_QUEUE_STATE_TEXT, useFeeOverview } from './useFeeOverview'

const emit = defineEmits<{ navigate: [target: FeeNavTarget] }>()

const {
  loading,
  today,
  monthLabel,
  actionItems,
  restItems,
  ensureLoaded,
  refresh,
} = useFeeOverview()

// KeepAlive 下切回工作台時重新整理待辦（不閃 skeleton）；
// 首次 activated 與 mounted 連發，用旗標避免重複載入。
let mountedOnce = false
onMounted(async () => {
  await ensureLoaded()
  mountedOnce = true
})
onActivated(() => {
  if (mountedOnce) refresh()
})
</script>

<style scoped>
.fee-workbench {
  max-width: 880px;
}

.context-line {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-color);
}

.queue-section {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  letter-spacing: 0.5px;
}

.queue-section__count {
  min-width: 18px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  font-weight: 600;
  text-align: center;
}

.queue-row {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.queue-row:last-child {
  border-bottom: none;
}

.queue-row__hit {
  width: 100%;
  min-height: var(--touch-target-min);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.queue-row__hit:hover,
.queue-row__hit:focus-visible {
  background: var(--bg-color);
}

.row-status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

.row-status__icon {
  font-size: 18px;
}

.row-status[data-state='ok'] .row-status__icon {
  color: var(--el-color-success);
}

.row-status[data-state='action'] .row-status__icon {
  color: var(--el-color-warning);
}

.row-status[data-state='muted'] .row-status__icon,
.row-status[data-state='unknown'] .row-status__icon {
  color: var(--el-text-color-placeholder);
}

.row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-title {
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--el-text-color-primary);
}

.row-detail {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.row-go {
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--el-color-primary);
  white-space: nowrap;
}

.row-go--muted {
  color: var(--text-tertiary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (--to-sm) {
  .queue-row__hit {
    flex-wrap: wrap;
  }
  .row-go {
    margin-left: calc(18px + var(--space-3));
  }
}
</style>
