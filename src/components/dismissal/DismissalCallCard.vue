<script setup lang="ts">
import { computed } from 'vue'
import { Clock } from '@element-plus/icons-vue'
import {
  elapsedMinutes,
  urgencyLevel,
  formatWaited,
  monogramOf,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'

/**
 * 接送通知卡片（管理端佇列 + 老師 portal 共用的呈現元件）。
 * 負責孩子辨識（姓名首字圓徽 + 放大姓名 + 班級）、等候時間升級色、狀態。
 * 動作（已收到 / 帶出去放學 / 取消）由父層用 #action slot 注入；
 * #secondary slot 放額外脈絡（管理端的「通知人」）。
 */
const props = defineProps<{
  call: DismissalCallView
  /** 由父層 useNowClock 提供，每 30 秒前進讓等候時間活著跳。 */
  now: number
}>()

const STATUS_TEXT: Record<string, string> = {
  pending: '等待確認',
  acknowledged: '已收到',
  completed: '已放學',
  cancelled: '已取消',
}

const minutes = computed(() => elapsedMinutes(props.call.requested_at, props.now))
/** 等候時間本身的緊急度（恆為事實，不受狀態影響）。 */
const waitLevel = computed(() => urgencyLevel(minutes.value))
/** 卡片底色語氣：已收到 = 老師正在處理，轉藍冷靜；未確認則隨等候時間升級。 */
const tone = computed(() =>
  props.call.status === 'acknowledged' ? 'ack' : waitLevel.value,
)
const monogram = computed(() => monogramOf(props.call.student_name))
const waited = computed(() => formatWaited(minutes.value))
const statusText = computed(
  () => STATUS_TEXT[props.call.status ?? ''] ?? props.call.status ?? '',
)
</script>

<template>
  <article class="dcall" :class="`dcall--${tone}`">
    <div class="dcall__head">
      <span class="dcall__mono" aria-hidden="true">{{ monogram }}</span>
      <div class="dcall__id">
        <h3 class="dcall__name">{{ call.student_name || '未知學生' }}</h3>
        <div class="dcall__sub">
          <span class="dcall__room">{{ call.classroom_name || '未分班' }}</span>
          <slot name="secondary" />
        </div>
      </div>
      <span
        v-if="waited"
        class="dcall__wait"
        :class="`dcall__wait--${waitLevel}`"
      >
        <el-icon class="dcall__wait-ico"><Clock /></el-icon>{{ waited }}
      </span>
    </div>

    <p v-if="call.note" class="dcall__note">備註：{{ call.note }}</p>

    <div class="dcall__foot">
      <span class="dcall__status" :class="`dcall__status--${call.status}`">{{ statusText }}</span>
      <div class="dcall__action"><slot name="action" /></div>
    </div>
  </article>
</template>

<style scoped>
.dcall {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

/* 底色語氣：未確認隨等候升級（琥珀 → 紅），已收到轉藍冷靜 */
.dcall--warning {
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
}
.dcall--critical {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
  animation: dcall-pulse 2.4s ease-in-out infinite;
}
.dcall--ack {
  background: var(--color-info-soft);
  border-color: var(--color-info);
}

@keyframes dcall-pulse {
  0%,
  100% {
    box-shadow: var(--shadow-sm);
  }
  50% {
    box-shadow: 0 0 0 4px var(--color-danger-soft);
  }
}

.dcall__head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

/* 姓名首字圓徽：孩子身分識別，深綠品牌底，加速隔著教室辨認 */
.dcall__mono {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
}

.dcall__id {
  flex: 1;
  min-width: 0;
}

.dcall__name {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.2;
  word-break: break-word;
}

.dcall__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.dcall__room {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--neutral-100);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
}

/* 等候時間 chip：相對時間 + 升級色。文字用深色保對比，色彩靠底色傳達 */
.dcall__wait {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--neutral-100);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dcall__wait-ico {
  font-size: 14px;
}
/* 對比微調：深琥珀 / 深紅文字於各自 soft 底上達 WCAG AA */
.dcall__wait--warning {
  background: var(--color-warning-soft);
  color: #92600a;
}
.dcall__wait--critical {
  background: var(--color-danger-soft);
  color: #b42318;
  font-weight: var(--font-weight-bold);
}

.dcall__note {
  margin: var(--space-3) 0 0;
  padding-left: calc(44px + var(--space-3));
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.dcall__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-left: calc(44px + var(--space-3));
}

.dcall__status {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  padding: 2px 8px;
  border-radius: 6px;
}
.dcall__status--pending {
  background: var(--color-warning-soft);
  color: #92600a;
}
.dcall__status--acknowledged {
  background: var(--color-info-soft);
  color: #1f5bb5;
}
.dcall__status--completed {
  background: var(--color-success-soft);
  color: #1a7f4b;
}
.dcall__status--cancelled {
  background: var(--neutral-100);
  color: var(--text-tertiary);
}

.dcall__action {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 560px) {
  .dcall__note,
  .dcall__foot {
    padding-left: 0;
  }
  .dcall__foot {
    flex-direction: column;
    align-items: stretch;
  }
  .dcall__status {
    align-self: flex-start;
  }
  .dcall__action {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dcall--critical {
    animation: none;
  }
  .dcall {
    transition: none;
  }
}
</style>
