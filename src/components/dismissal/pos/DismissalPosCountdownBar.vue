<script setup lang="ts">
/**
 * 5 秒倒數進度條（T-008）：純視覺，不知道倒數完成後實際要做什麼（那是
 * useDismissalPosQueue 的責任，此元件只負責畫出「還剩多少時間」）。
 *
 * 動畫作法比照 mockup（docs/mockups/2026-08-20-dismissal-pos-queue.html）：
 * fill 以 transform-origin: left 的 scaleX 從「目前進度」→ 0（比 width 動畫更
 * 流暢，不觸發 layout）。掛載後用雙層 requestAnimationFrame 才加上觸發 transition
 * 的狀態（比照 mockup 同款雙層 rAF 寫法，單層在部分瀏覽器有 style-recalc 時機
 * 風險，可能導致 transition 沒真的播放、直接跳到終值）。
 *
 * 途中掛載（如頁面重整時倒數已過一半）：初始視覺 scaleX 依「剩餘時間 / 總時間」
 * 算出的比例接續渲染，而不是每次都從滿版重新跑——scaleX 比例與 transition
 * 時長（transitionDuration）用同一份 remainingMs() 計算，兩者永遠對齊。
 *
 * reduced-motion 降級策略（記錄於 acceptance_criteria 要求）：選擇「僅變色
 * 不做寬度動畫」——fill 全程維持滿版，只在到期時用 JS timer 把顏色從
 * 「倒數中」切成「已完成」，不做任何位移/漸變（比照 DismissalCallCard 既有
 * @media (prefers-reduced-motion: reduce) 慣例：拿掉 transition，但邏輯/完成
 * 時機不變）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from '@/utils/reducedMotion'

const DEFAULT_DURATION_MS = 5000

const props = withDefaults(
  defineProps<{
    /** 倒數總長度（毫秒）。 */
    durationMs?: number
    /** 倒數起始時間（Date.now() 毫秒）。 */
    startedAt: number
  }>(),
  { durationMs: DEFAULT_DURATION_MS },
)

const reducedMotion = ref(false)
/** 一般模式：是否已觸發 shrink transition（雙 rAF 後轉 true）。 */
const shrinking = ref(false)
/** reduced-motion 模式：是否仍在倒數中（true=倒數中色，false=完成色）。 */
const counting = ref(true)

let timer: ReturnType<typeof setTimeout> | null = null
let rafOuter: number | null = null
let rafInner: number | null = null

/** 剩餘毫秒數，上下界皆 clamp 在 [0, durationMs]——避免時鐘誤差（startedAt 落在未來）讓 transition 時長超過 durationMs。 */
function remainingMs(): number {
  const elapsed = Date.now() - props.startedAt
  return Math.min(props.durationMs, Math.max(0, props.durationMs - elapsed))
}

// 掛載當下算一次即可：durationMs/startedAt 語意上是「這次倒數」的起點，
// 呼叫端要開始新倒數應該用新的 :key 讓元件重新掛載（見下方 template 註解）。
const remaining = remainingMs()
/** 初始視覺進度比例：途中掛載（remaining < durationMs）時，fill 從這個比例接續往 0 收縮，而不是每次都從滿版重跑。 */
const initialRatio = props.durationMs > 0 ? remaining / props.durationMs : 0

const fillStyle = computed(() => {
  if (reducedMotion.value) return {}
  return {
    transform: `scaleX(${shrinking.value ? 0 : initialRatio})`,
    transitionDuration: `${shrinking.value ? remaining : 0}ms`,
  }
})

onMounted(() => {
  reducedMotion.value = prefersReducedMotion()

  if (reducedMotion.value) {
    // 無過場動畫：fill 維持滿版，到期用 timer 直接切換完成色，不做任何動畫
    timer = setTimeout(() => {
      counting.value = false
    }, remaining)
    return
  }

  // 雙層 rAF 才觸發 transition（比照 mockup），確保瀏覽器先畫出 initialRatio 起始態
  rafOuter = requestAnimationFrame(() => {
    rafInner = requestAnimationFrame(() => {
      shrinking.value = true
    })
  })
})

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
  if (rafOuter !== null) cancelAnimationFrame(rafOuter)
  if (rafInner !== null) cancelAnimationFrame(rafInner)
})
</script>

<template>
  <!-- 呼叫端如需開始「新一輪」倒數，請對本元件綁定會隨新倒數變動的 :key
       （如 item.id），讓元件重新掛載——startedAt/durationMs 變更不會讓既有
       實例重新起算（純視覺元件刻意不監聽 props 變動重啟動畫，避免與雙 rAF
       觸發時機互相打架）。 -->
  <div class="pos-countdown-bar__track" aria-hidden="true">
    <div
      class="pos-countdown-bar__fill"
      :class="{ 'is-reduced': reducedMotion, 'is-done': reducedMotion && !counting }"
      :style="fillStyle"
    />
  </div>
</template>

<style scoped>
.pos-countdown-bar__track {
  margin-top: var(--space-3, 12px);
  height: 6px;
  border-radius: var(--radius-full, 9999px);
  background: var(--neutral-100);
  overflow: hidden;
}

.pos-countdown-bar__fill {
  height: 100%;
  width: 100%;
  background: var(--brand-primary);
  border-radius: var(--radius-full, 9999px);
  transform-origin: left;
  transition-property: transform;
  transition-timing-function: linear;
}

/* reduced-motion：全程滿版不位移，只變色表達「倒數中 → 已完成」。 */
.pos-countdown-bar__fill.is-reduced {
  transition: none;
}

.pos-countdown-bar__fill.is-done {
  background: var(--neutral-400);
}

@media (prefers-reduced-motion: reduce) {
  .pos-countdown-bar__fill {
    transition: none;
  }
}
</style>
