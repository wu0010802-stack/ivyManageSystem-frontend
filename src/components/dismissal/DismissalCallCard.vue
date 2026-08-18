<script setup lang="ts">
import { computed } from 'vue'
import { Clock } from '@element-plus/icons-vue'
import {
  elapsedMinutes,
  urgencyLevel,
  formatWaited,
  monogramOf,
  isPreArrivalNotice,
  waitAnchorIso,
  formatExpectedArrival,
  etaRelativeText,
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

/** 家長預告且未抵達：顯示 ETA、不套 3/8 分鐘等候警示（pnotice01）。 */
const preArrival = computed(() => isPreArrivalNotice(props.call))
/**
 * 等候起算點＝實際到門口時間（arrived_at）；staff 舊流程 arrived_at=requested_at
 * → 數字與改造前逐字相同。預告未抵達不計等候。
 */
const minutes = computed(() =>
  preArrival.value ? null : elapsedMinutes(waitAnchorIso(props.call), props.now),
)
/** 等候時間本身的緊急度（恆為事實，不受狀態影響）。 */
const waitLevel = computed(() => urgencyLevel(minutes.value))
/** 卡片底色語氣：已收到 = 老師正在處理，轉藍冷靜；未確認則隨等候時間升級。 */
const tone = computed(() =>
  props.call.status === 'acknowledged' ? 'ack' : waitLevel.value,
)
const monogram = computed(() => monogramOf(props.call.student_name))
const waited = computed(() => formatWaited(minutes.value))
/** 預告卡的 ETA chip：「預計 15:40 · 還有 12 分」。 */
const etaText = computed(() => {
  if (!preArrival.value) return ''
  const expected = formatExpectedArrival(props.call.expected_arrival_at)
  const rel = etaRelativeText(props.call.expected_arrival_at, props.now)
  return [expected, rel].filter(Boolean).join(' · ')
})
/** 來源/抵達標記：家長預告（未抵達）→「家長預告」；家長已到門口 →「已到門口」。 */
const sourceFlag = computed<{ text: string; kind: 'notice' | 'arrived' } | null>(() => {
  if (props.call.request_source !== 'parent') return null
  if (!props.call.arrived_at) return { text: '家長預告', kind: 'notice' }
  return { text: '已到門口', kind: 'arrived' }
})
const statusText = computed(
  () => STATUS_TEXT[props.call.status ?? ''] ?? props.call.status ?? '',
)

/**
 * 整張卡片的螢幕報讀摘要：學生 + 班級 + 狀態（+ 等候時間）。
 * 圓徽是純視覺（aria-hidden），緊急度只靠顏色/脈動傳達，因此把關鍵訊息
 * 收斂成一句 aria-label，讓報讀器一次讀懂這張卡。
 */
const ariaLabel = computed(() => {
  const parts = [
    props.call.student_name || '未知學生',
    props.call.classroom_name || '未分班',
    statusText.value,
  ]
  if (sourceFlag.value) parts.push(sourceFlag.value.text)
  if (etaText.value) parts.push(etaText.value)
  if (waited.value) parts.push(waited.value)
  return parts.filter(Boolean).join('，')
})
</script>

<template>
  <article class="dcall" :class="`dcall--${tone}`" :aria-label="ariaLabel">
    <div class="dcall__head">
      <span class="dcall__mono" aria-hidden="true">{{ monogram }}</span>
      <div class="dcall__id">
        <h3 class="dcall__name">{{ call.student_name || '未知學生' }}</h3>
        <div class="dcall__sub">
          <span class="dcall__room">{{ call.classroom_name || '未分班' }}</span>
          <span
            v-if="sourceFlag"
            class="dcall__flag"
            :class="`dcall__flag--${sourceFlag.kind}`"
            data-testid="dcall-source-flag"
          >{{ sourceFlag.text }}</span>
          <slot name="secondary" />
        </div>
      </div>
      <!-- 預告未抵達：ETA chip（不套 3/8 分鐘警示）；其餘顯示等候 chip -->
      <span v-if="etaText" class="dcall__wait dcall__wait--eta" data-testid="dcall-eta-chip">
        <el-icon class="dcall__wait-ico"><Clock /></el-icon>{{ etaText }}
      </span>
      <span
        v-else-if="waited"
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

/* 姓名首字圓徽：孩子身分識別，加速隔著教室辨認。
   底色隨卡片語氣（tone）走，與升級色和諧，不再恆綠在紅脈動卡上打架。
   各 tone 一律用較深的 *-darker 階，確保白字維持 WCAG AA 對比。 */
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
  transition: background-color var(--transition-base);
}
.dcall--warning .dcall__mono {
  background: var(--color-warning-darker);
}
.dcall--critical .dcall__mono {
  background: var(--color-danger-darker);
}
.dcall--ack .dcall__mono {
  background: var(--color-info-darker);
}
/* dark mode：*-darker 在 a11y.css 被翻成亮色（供 *-soft 深底上的文字用），但此處 avatar
   是「solid 背景 + 白字」，亮底會讓白字塌掉對比。窄覆寫還原各 tone 深底（與 light mode 同值），
   維持白字 WCAG AA。 */
html.dark .dcall--warning .dcall__mono {
  background: #b45309;
}
html.dark .dcall--critical .dcall__mono {
  background: #b91c1c;
}
html.dark .dcall--ack .dcall__mono {
  background: #1d4ed8;
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
/* 對比：深琥珀 / 深紅文字於各自 soft 底，light mode 達 WCAG AA（用 *-darker token）。
   註：*-darker 未隨 a11y.css 的 html.dark 覆寫，故 dark mode chip 對比延用既有限制
   （與改版前硬編碼色相同，非本次引入；如要根治需在 a11y.css 補 dark *-darker，屬全站範圍）。 */
.dcall__wait--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}
.dcall__wait--critical {
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  font-weight: var(--font-weight-bold);
  /* 等候逾門檻：等候時間 chip 放大，最久沒被接的孩子一眼最醒目 */
  font-size: var(--text-base);
  padding: 5px 12px;
}
/* 預告 ETA chip：資訊藍、不進警示色階（3/8 分鐘警示對預告不適用） */
.dcall__wait--eta {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}

/* 來源/抵達標記（pnotice01）：家長預告＝藍、已到門口＝綠 */
.dcall__flag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
}
.dcall__flag--notice {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}
.dcall__flag--arrived {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
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
  color: var(--color-warning-darker);
}
.dcall__status--acknowledged {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}
.dcall__status--completed {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
}
.dcall__status--cancelled {
  background: var(--neutral-100);
  color: var(--text-tertiary);
}

.dcall__action {
  display: flex;
  gap: var(--space-2);
}

/* 斷點改用專案 custom media（原本寫死 560px 不在斷點系統內，違反 DESIGN.md 硬規則）。
   ⚠ 本元件同時被教師 Portal 的 PortalDismissalCallsView 消費：561–767px（小平板）
   的卡片會比改版前更早收成直向堆疊，屬預期的一致化，非 admin 專屬變更。 */
@media (--to-sm) {
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
  /* 卡片動作（取消通知／標記抵達）是接送看板最關鍵的觸控目標，實測只有 24px。
     消費端用 size="small" 是為了桌機密度，手機一律撐到 44px。 */
  .dcall__action :deep(.el-button) {
    min-height: var(--touch-target-min);
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
