<script setup lang="ts">
/**
 * 右欄單張佇列卡片（T-009，2026-08-22 互動調整）：呈現一個 PosQueueItem（staging
 * 倒數中／後端 active call），套用 useSwipeReveal 做向左滑動露出取消按鈕——鬆手
 * 只會彈開／回彈，需再點一次露出的取消按鈕才會 emit cancel(item)（不是滑動放開
 * 就直接觸發，取代舊版 useSwipeToCancel 的一步式手勢）。
 *
 * 家長預約且未抵達的 ETA 顯示重用 useDismissalUrgency.ts 既有的
 * formatExpectedArrival / etaRelativeText（不重造等候/ETA 文案邏輯）。
 *
 * 對照 docs/mockups/2026-08-22-dismissal-pos-card-density.html：不分 staging／
 * active，統一用同一顆滑開才出現的取消按鈕，未額外做「已送出通知」的二次確認 strip
 * （彈開＋需再點按鈕本身已是一次確認，如需要更強的二次確認可另拆 task）。
 *
 * proxy（委託代理人，T-021）刻意不吃 ETA／等候標記路徑：後端建立 proxy 的
 * dismissal_call 時 expected_arrival_at 填的是「建立當下時間」，不是真的
 * 預計抵達時間，顯示 ETA 倒數／相對文案會誤導辦公室。proxy 分支改顯示
 * 代理人姓名（＋關係）＋明碼取件碼＋靜態狀態文字，不呼叫
 * formatExpectedArrival/etaRelativeText，也不套用「老師已收到」兩階段等候文案
 * （那是給家長/現場通知用的，proxy 走的是完全不同的核銷流程）。
 *
 * 確認接送（T-022，D10④）：proxy 卡片在代理人姓名／明碼取件碼旁新增「確認接送」
 * 按鈕，辦公室人員目視比對本卡明碼與代理人所述一致後一鍵確認，不重新輸入 6 碼。
 * 點擊 emit confirm-pickup(item)，呼叫端（DismissalPosQueuePanel → DismissalPosBoard）
 * 轉呼叫 useDismissalPosQueue.confirmProxyPickup 打 confirm-visual-match。與 swipe
 * 取消是兩個獨立動作，proxy 卡片仍保留既有 swipe 手勢露出取消鈕的能力。
 *
 * 按鈕 review 修復（2026-08-23）：
 *  - `confirming` prop（呼叫端傳入 useDismissalPosQueue.confirmingIds 的 membership）
 *    在呼叫進行中 disable 按鈕，防止連點在第一次 confirm-visual-match resolve 前
 *    發出第二次請求（打破『呼叫端點恰一次』acceptance criteria）。
 *  - 按鈕加 `@pointerdown.stop`：body 容器綁了 useSwipeReveal 的 onPointerDown
 *    （內部 setPointerCapture），事件會從按鈕冒泡上去，一旦容器對這次互動
 *    setPointerCapture，後續 pointer 事件會被導向 capturing element 而非按鈕，
 *    在觸控裝置上可能讓點擊失效或不穩定。stop 讓這次 pointerdown 不冒泡到容器。
 */
import { computed } from 'vue'
import {
  formatExpectedArrival,
  etaRelativeText,
  isPreArrivalNotice,
} from '@/composables/useDismissalUrgency'
import { useSwipeReveal } from '@/composables/useSwipeReveal'
import { formatTaipeiClock } from '@/utils/taipeiTime'
import type { PosQueueItem, PosQueueSource } from '@/types/dismissalPos'
import DismissalPosCountdownBar from './DismissalPosCountdownBar.vue'

const props = withDefaults(
  defineProps<{
    item: PosQueueItem
    /** 供 ETA 相對文案計算「現在」；未帶則退回掛載當下的 Date.now()（父層建議傳入 useNowClock 的 now 讓文案活著跳）。 */
    now?: number
    /** 確認接送呼叫進行中（T-022 review 修復）：true 時 disable 按鈕，防連點重複呼叫。 */
    confirming?: boolean
  }>(),
  { now: () => Date.now(), confirming: false },
)

const emit = defineEmits<{
  cancel: [item: PosQueueItem]
  /** 目視比對明碼後一鍵確認接送（T-022，D10④），僅 proxy 卡片會 emit。 */
  'confirm-pickup': [item: PosQueueItem]
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

/**
 * 確認接送按鈕（T-022，D10④）：辦公室人員目視比對本卡明碼與代理人所述一致後
 * 一鍵確認，不重新輸入 6 碼。需要 pickup_authorization_id 才能呼叫
 * confirm-visual-match，proxy active call 理論上恆有值（見 useDismissalUrgency.ts），
 * 缺值時保守不顯示按鈕，避免帶 undefined 呼叫後端。
 */
const proxyAuthId = computed(() => props.item.call?.pickup_authorization_id)
const showConfirmButton = computed(
  () => isProxy.value && props.item.phase === 'active' && typeof proxyAuthId.value === 'number',
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

/** proxy 且已送出：顯示靜態委託接送狀態文字，不進 ETA／等候標記／兩階段文案路徑。 */
const showProxyStatus = computed(() => props.item.phase === 'active' && isProxy.value)

/** 已送出（active）且非預約未抵達、非 proxy：顯示等候標記，文案依老師是否已確認分兩階段。 */
const showWaitingFlag = computed(
  () => props.item.phase === 'active' && !isProxy.value && !preArrival.value,
)

/** 按鈕本身也擋一次（belt-and-suspenders）：:disabled 理論上已擋掉 click，這裡防呆避免測試/未來改動繞過 disabled 屬性。 */
function handleConfirmClick() {
  if (props.confirming) return
  emit('confirm-pickup', props.item)
}

/** 老師已按下確認（acknowledged）：等候標記進入第二階段，讓櫃台知道教師端已接手。 */
const isAcknowledged = computed(() => props.item.call?.status === 'acknowledged')

const waitingText = computed(() =>
  isAcknowledged.value ? '老師已收到，準備放學' : '已通知教師端，等待確認',
)

/** 已放學（done）：保留在佇列尾端供回顧，顯示放學時間、整卡降階、不可滑動取消。 */
const isDone = computed(() => props.item.phase === 'done')

const doneText = computed(() => {
  if (!isDone.value) return ''
  const time = formatTaipeiClock(props.item.call?.completed_at as string | undefined)
  return time ? `已放學 ${time}` : '已放學'
})

const {
  dragX,
  isOpen,
  reboundInstant,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  close,
} = useSwipeReveal()

/** done 卡沒有取消語意：不進入 swipe 手勢，卡片維持靜止。 */
function handlePointerDown(e: PointerEvent) {
  if (isDone.value) return
  onPointerDown(e)
}

/** 取消按鈕點擊才是真正觸發業務動作的地方；成功後主動收合，避免卡片移除前殘留彈開狀態。 */
function handleCancelClick() {
  emit('cancel', props.item)
  close()
}

const bodyStyle = computed(() => ({
  transform: `translateX(${dragX.value}px)`,
}))
</script>

<template>
  <div
    class="pos-queue-card"
    :class="[`pos-queue-card--${item.source}`, { 'pos-queue-card--done': isDone }]"
  >
    <div v-if="!isDone" class="pos-queue-card__reveal">
      <button
        type="button"
        class="pos-queue-card__cancel-btn"
        :disabled="!isOpen"
        :tabindex="isOpen ? 0 : -1"
        @click="handleCancelClick"
      >
        取消
      </button>
    </div>
    <div
      class="pos-queue-card__body"
      :class="{ 'pos-queue-card__body--rebound-instant': reboundInstant }"
      :style="bodyStyle"
      data-testid="pos-queue-card-body"
      @pointerdown="handlePointerDown"
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
        <el-button
          v-if="showConfirmButton"
          type="primary"
          size="small"
          class="pos-queue-card__confirm-btn"
          data-testid="pos-queue-card-confirm-pickup"
          :loading="confirming"
          :disabled="confirming"
          @pointerdown.stop
          @click="handleConfirmClick"
        >
          確認接送
        </el-button>
      </div>

      <DismissalPosCountdownBar
        v-if="item.phase === 'staging' && item.countdown"
        :started-at="item.countdown.startedAt"
        :duration-ms="item.countdown.durationMs"
      />
      <div v-else-if="isDone" class="pos-queue-card__done-flag">✅ {{ doneText }}</div>
      <div v-else-if="etaText" class="pos-queue-card__eta-flag">{{ etaText }}</div>
      <div v-else-if="showProxyStatus" class="pos-queue-card__waiting-flag">
        <span class="pos-queue-card__waiting-dot" aria-hidden="true" />今日委託接送，等待到場
      </div>
      <div
        v-else-if="showWaitingFlag"
        class="pos-queue-card__waiting-flag"
        :class="{ 'pos-queue-card__waiting-flag--ack': isAcknowledged }"
      >
        <span class="pos-queue-card__waiting-dot" aria-hidden="true" />{{ waitingText }}
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

.pos-queue-card__reveal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.pos-queue-card__cancel-btn {
  width: 84px;
  border: none;
  background: var(--color-danger);
  color: #fff;
  font-size: var(--text-sm, 13px);
  font-weight: 700;
  cursor: pointer;
}

.pos-queue-card__cancel-btn:disabled {
  cursor: default;
}

.pos-queue-card__cancel-btn:not(:disabled):hover {
  background: var(--color-danger-darker, #b91c1c);
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

.pos-queue-card__confirm-btn {
  margin-left: auto;
}

.pos-queue-card__eta-flag {
  margin-top: var(--space-3, 12px);
  font-size: var(--text-xs, 12px);
  color: var(--color-info-darker);
  font-weight: 600;
}

/* 已放學（done）：整卡淡灰降階，touch-action 還原（沒有 swipe 手勢） */
.pos-queue-card--done {
  box-shadow: none;
}

.pos-queue-card--done .pos-queue-card__body {
  background: var(--bg-color-soft);
  touch-action: auto;
}

.pos-queue-card--done .pos-queue-card__name {
  color: var(--text-secondary);
}

.pos-queue-card--done .pos-queue-card__source-tag {
  opacity: 0.65;
}

.pos-queue-card__done-flag {
  margin-top: var(--space-3, 12px);
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  color: var(--text-secondary);
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

/* 老師已確認（acknowledged）：等候標記轉藍，與 pending 的綠色第一階段做出區隔
   （對齊 view STATUS_TYPE_MAP：acknowledged=primary 系）。 */
.pos-queue-card__waiting-flag--ack {
  color: var(--color-info-darker);
}

.pos-queue-card__waiting-flag--ack .pos-queue-card__waiting-dot {
  background: var(--color-info);
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
