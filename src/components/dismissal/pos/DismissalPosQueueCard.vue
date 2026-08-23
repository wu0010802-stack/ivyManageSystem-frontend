<script setup lang="ts">
/**
 * 右欄單張佇列卡片（T-009）：呈現一個 PosQueueItem（staging 倒數中／後端
 * active call），套用 T-004 useSwipeToCancel 做左右滑動取消。
 *
 * 家長預約且未抵達的 ETA 顯示重用 useDismissalUrgency.ts 既有的
 * formatExpectedArrival / etaRelativeText（不重造等候/ETA 文案邏輯）。
 *
 * proxy（委託代理人，T-021）刻意不吃這條 ETA 路徑：後端建立 proxy 的
 * dismissal_call 時 expected_arrival_at 填的是「建立當下時間」，不是真的
 * 預計抵達時間，顯示 ETA 倒數／相對文案會誤導辦公室。proxy 分支改顯示
 * 代理人姓名（＋關係）＋明碼取件碼＋靜態狀態文字，不呼叫
 * formatExpectedArrival/etaRelativeText。
 *
 * 範圍說明：mockup（docs/mockups/2026-08-20-dismissal-pos-queue.html）對「已送出
 * 通知」的 active call 多做了一層 swipe 後二次確認 strip（避免手滑誤取消已通知
 * 教師端的項目）；T-009 acceptance_criteria 只要求「swipe 完成後 emit cancel(item)
 * 恰一次」，未要求二次確認，本輪不加這層，避免超出 task 範圍——如需要可另拆 task。
 */
import { computed } from 'vue'
import {
  formatExpectedArrival,
  etaRelativeText,
  isPreArrivalNotice,
} from '@/composables/useDismissalUrgency'
import { useSwipeToCancel } from '@/composables/useSwipeToCancel'
import type { PosQueueItem, PosQueueSource } from '@/types/dismissalPos'
import DismissalPosCountdownBar from './DismissalPosCountdownBar.vue'

const props = withDefaults(
  defineProps<{
    item: PosQueueItem
    /** 供 ETA 相對文案計算「現在」；未帶則退回掛載當下的 Date.now()（父層建議傳入 useNowClock 的 now 讓文案活著跳）。 */
    now?: number
  }>(),
  { now: () => Date.now() },
)

const emit = defineEmits<{
  cancel: [item: PosQueueItem]
}>()

const SOURCE_LABEL: Record<PosQueueSource, string> = {
  onsite: '現場',
  reservation: '預約',
  proxy: '代理',
}

const sourceLabel = computed(() => SOURCE_LABEL[props.item.source])

const isProxy = computed(() => props.item.source === 'proxy')

/** 代理人姓名（＋關係，如「王小明（阿姨）」），沿用既有 PickupAuthorizationsView 等頁的顯示慣例。 */
const proxyPersonLabel = computed(() => {
  if (!isProxy.value) return ''
  const name = props.item.call?.person_name
  if (!name) return ''
  const relation = props.item.call?.person_relation
  return relation ? `${name}（${relation}）` : name
})

const proxyPickupCode = computed(() =>
  isProxy.value ? (props.item.call?.pickup_code ?? '') : '',
)

/** 家長預約且尚未抵達：顯示 ETA，不顯示「已通知教師端」等候標記。proxy 一律不算 preArrival（見檔頭註解）。 */
const preArrival = computed(
  () =>
    !isProxy.value &&
    props.item.phase === 'active' &&
    !!props.item.call &&
    isPreArrivalNotice(props.item.call),
)

const etaText = computed(() => {
  if (isProxy.value || !preArrival.value || !props.item.call) return ''
  const expected = formatExpectedArrival(props.item.call.expected_arrival_at)
  const rel = etaRelativeText(props.item.call.expected_arrival_at, props.now)
  return [expected, rel].filter(Boolean).join(' · ')
})

/** proxy 且已送出：顯示靜態委託接送狀態文字，不進 ETA／等候標記路徑。 */
const showProxyStatus = computed(() => props.item.phase === 'active' && isProxy.value)

/** 已送出（active）且非預約未抵達、非 proxy：顯示「已通知教師端，等待確認」等候標記。 */
const showWaitingFlag = computed(
  () => props.item.phase === 'active' && !isProxy.value && !preArrival.value,
)

const { dragX, reboundInstant, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } =
  useSwipeToCancel({
    onCommit: () => emit('cancel', props.item),
  })

const bodyStyle = computed(() => ({
  transform: `translateX(${dragX.value}px)`,
}))
</script>

<template>
  <div class="pos-queue-card" :class="`pos-queue-card--${item.source}`">
    <div class="pos-queue-card__swipe-bg" aria-hidden="true">滑動取消</div>
    <div
      class="pos-queue-card__body"
      :class="{ 'pos-queue-card__body--rebound-instant': reboundInstant }"
      :style="bodyStyle"
      data-testid="pos-queue-card-body"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <div class="pos-queue-card__top">
        <div class="pos-queue-card__id">
          <div class="pos-queue-card__name">{{ item.studentName || '未知學生' }}</div>
          <div class="pos-queue-card__room">{{ item.classroomName || '未分班' }}</div>
        </div>
        <span class="pos-queue-card__source-tag" :class="`pos-queue-card__source-tag--${item.source}`">
          {{ sourceLabel }}
        </span>
      </div>

      <div v-if="isProxy && (proxyPersonLabel || proxyPickupCode)" class="pos-queue-card__proxy-info">
        <span v-if="proxyPersonLabel" class="pos-queue-card__proxy-person">{{ proxyPersonLabel }}</span>
        <span v-if="proxyPickupCode" class="pos-queue-card__proxy-code">取件碼 {{ proxyPickupCode }}</span>
      </div>

      <DismissalPosCountdownBar
        v-if="item.phase === 'staging' && item.countdown"
        :started-at="item.countdown.startedAt"
        :duration-ms="item.countdown.durationMs"
      />
      <div v-else-if="etaText" class="pos-queue-card__eta-flag">{{ etaText }}</div>
      <div v-else-if="showProxyStatus" class="pos-queue-card__waiting-flag">
        <span class="pos-queue-card__waiting-dot" aria-hidden="true" />今日委託接送，等待到場
      </div>
      <div v-else-if="showWaitingFlag" class="pos-queue-card__waiting-flag">
        <span class="pos-queue-card__waiting-dot" aria-hidden="true" />已通知教師端，等待確認
      </div>
    </div>
  </div>
</template>

<style scoped>
.pos-queue-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--border-color);
  background: var(--surface-color);
  box-shadow: var(--shadow-sm);
}

.pos-queue-card__swipe-bg {
  position: absolute;
  inset: 0;
  background: var(--color-danger);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm, 13px);
  font-weight: 700;
}

.pos-queue-card__body {
  position: relative;
  background: var(--surface-color);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  touch-action: pan-y;
  transition: transform var(--transition-base, 0.2s ease);
}

.pos-queue-card__body--rebound-instant {
  transition: none;
}

.pos-queue-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2, 8px);
}

.pos-queue-card__name {
  font-size: var(--text-xl, 18px);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.25;
}

.pos-queue-card__room {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary);
  margin-top: 2px;
}

.pos-queue-card__source-tag {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: var(--radius-full, 9999px);
  font-size: 11px;
  font-weight: 700;
}

.pos-queue-card__source-tag--onsite {
  background: var(--brand-primary);
  color: #fff;
}

.pos-queue-card__source-tag--reservation {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}

.pos-queue-card__source-tag--proxy {
  background: var(--neutral-700);
  color: #fff;
}

.pos-queue-card__proxy-info {
  margin-top: var(--space-2, 8px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px var(--space-2, 8px);
}

.pos-queue-card__proxy-person {
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary);
}

.pos-queue-card__proxy-code {
  font-size: var(--text-sm, 13px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.pos-queue-card__eta-flag {
  margin-top: var(--space-3, 12px);
  font-size: var(--text-xs, 12px);
  color: var(--color-info-darker);
  font-weight: 600;
}

.pos-queue-card__waiting-flag {
  margin-top: var(--space-3, 12px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  color: var(--color-success-darker);
}

.pos-queue-card__waiting-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  animation: pos-queue-card-pulse 1.6s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .pos-queue-card__body {
    transition: none;
  }
  .pos-queue-card__waiting-dot {
    animation: none;
  }
}

@keyframes pos-queue-card-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
