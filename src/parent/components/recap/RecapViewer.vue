<script setup lang="ts">
/**
 * 相簿回顧全螢幕輪播檢視器。
 *
 * 由 caller 以 v-if 掛載／卸載＝開啟／關閉（mount 即開啟），所以自動播放的
 * 生命週期、焦點進出都收在本元件內，caller 只需要處理 `close`。
 *
 * 互動契約（設計稿 docs/mockups/2026-09-16-parent-album-recap.html frame 2）：
 *  - 每張停留 DWELL_MS，頂部故事式分段進度條，播到最後一張停住不循環
 *  - 手動換張（按鈕／鍵盤／拖曳／膠卷／點鄰張）後不自動恢復播放：使用者
 *    接管了就不跟他搶，要恢復只能自己按播放鍵
 *  - prefers-reduced-motion 下預設暫停，進度條凍在 0%
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '@/utils/reducedMotion'
import M3Icon from '../m3/M3Icon.vue'
import type { PhotoRecap, RecapPhoto } from '../../api/childPhotos'
import { formatRecapDate, formatRecapRange, recapDisplaySrc, recapThumbSrc } from './recapFormat'

const props = defineProps<{ recap: PhotoRecap }>()
const emit = defineEmits<{ close: [] }>()

/** 每張停留時間。同時餵給換張計時器與進度條動畫，兩者不得各持一份。 */
const DWELL_MS = 3600
/** 放開手指後要換張的最小水平位移。 */
const SWIPE_THRESHOLD_PX = 40
/** 超過幾 px 才算「拖曳」而非「點擊」。 */
const DRAG_SLOP_PX = 4
/** 只讓前後各 N 張留在畫面上，更遠的藏起來省繪製。 */
const VISIBLE_NEIGHBORS = 2
/** 鄰張的景深：縮小 + 半透明，看得到但不搶焦點。 */
const NEIGHBOR_SCALE = 0.86
const NEIGHBOR_OPACITY = 0.45
/** 相鄰兩張的間距（相對自身寬度）：>100% 才會在中央大圖左右各露出一截。 */
const SLIDE_STEP_PERCENT = 106

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

const photos = computed<RecapPhoto[]>(() => props.recap.photos || [])
const index = ref(0)
/**
 * 進度條重播 token。Vue 會重用同一顆 DOM 節點，只換 class 不會讓 CSS
 * animation 重新起跑；拿它當 :key 強迫換節點，每次換張進度條都從 0 重畫。
 */
const runToken = ref(0)
const reducedMotion = prefersReducedMotion()

/**
 * 單張回顧沒有東西可以「播」：沒有下一張、進度條也不該停在 0% 等一個
 * 永遠不會來的換張。業主裁定「1 張也算回顧」，所以這是真實情境不是邊角。
 */
const canAutoplay = computed<boolean>(() => photos.value.length > 1)
/** 分段進度條超過這個張數就失去意義（40 段在 360px 手機上每段只剩 5.4px）。 */
const SEGMENTED_MAX = 20
const segmented = computed<boolean>(() => photos.value.length <= SEGMENTED_MAX)

const playing = ref(!reducedMotion && photos.value.length > 1)
/**
 * 自動播放已走到終點（或單張＝根本無從播起）。進度條靠它把最後一段填滿；
 * 沒有這個旗標的話最後一張的那段會永遠空著，看起來像卡住。
 */
const ended = ref(photos.value.length <= 1)
const dragX = ref(0)
const dragging = ref(false)

const rootRef = ref<HTMLElement | null>(null)
const filmRef = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setTimeout> | null = null
let dragStartX = 0
let dragMoved = false
/** 正在拖曳的那根手指。第二根手指（雙指縮放）不得覆寫拖曳起點。 */
let activePointerId: number | null = null
// 開啟前的焦點元素（通常是 RecapRail 上被點的那張卡），關閉時還原。
let previousActiveElement: Element | null = null

const atStart = computed<boolean>(() => index.value <= 0)
const atEnd = computed<boolean>(() => index.value >= photos.value.length - 1)

const rangeText = computed<string>(() => {
  const range = formatRecapRange(props.recap.range_start, props.recap.range_end)
  const count = `共 ${photos.value.length} 張`
  return range ? `${range} · ${count}` : count
})

const segFillStyle = computed<Record<string, string>>(() => ({
  animationDuration: `${DWELL_MS}ms`,
}))

function isFar(i: number): boolean {
  return Math.abs(i - index.value) > VISIBLE_NEIGHBORS
}

function slideStyle(i: number): Record<string, string> {
  const offset = i - index.value
  const distance = Math.abs(offset)
  const scale = offset === 0 ? 1 : NEIGHBOR_SCALE
  const opacity = offset === 0 ? 1 : distance === 1 ? NEIGHBOR_OPACITY : 0
  return {
    transform: `translate(calc(${offset * SLIDE_STEP_PERCENT}% + ${dragX.value}px), -50%) scale(${scale})`,
    opacity: String(opacity),
    zIndex: String(10 - distance),
  }
}

function slideAlt(i: number): string {
  return i === index.value ? `回顧照片 ${i + 1}，共 ${photos.value.length} 張` : ''
}

/* ---------- 自動播放 ---------- */

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/** 排下一次自動換張。到最後一張就把自己關掉——回顧是有頭有尾的，不循環。 */
function scheduleNext(): void {
  clearTimer()
  if (!playing.value) return
  if (atEnd.value) {
    ended.value = true
    playing.value = false
    return
  }
  timer = setTimeout(() => {
    index.value += 1
    runToken.value += 1
    scheduleNext()
  }, DWELL_MS)
}

watch(playing, scheduleNext)

/**
 * 使用者主動換到第 i 張。自動播放的換張不走這裡（它直接推進 index），
 * 所以這個函式可以無條件停掉播放——使用者接管了就不跟他搶。
 */
function go(i: number): void {
  if (i < 0 || i >= photos.value.length || i === index.value) return
  playing.value = false
  ended.value = false
  index.value = i
  runToken.value += 1
}

function step(delta: number): void {
  go(index.value + delta)
}

function togglePlay(): void {
  // 單張沒有播放這個概念，連狀態都不要翻（否則點中央會空翻 is-paused）
  if (!canAutoplay.value) return
  if (playing.value) {
    playing.value = false
    return
  }
  // 停在最後一張時再按播放＝從頭重播，否則按了畫面不會有任何反應
  if (atEnd.value) index.value = 0
  ended.value = false
  runToken.value += 1
  playing.value = true
}

/** 進度條每一段的狀態。ended 讓最後一段在播完後填滿，而不是空著像卡住。 */
function segClass(i: number): Record<string, boolean> {
  return {
    done: i < index.value || (i === index.value && ended.value),
    live: i === index.value && !ended.value,
  }
}

function close(): void {
  emit('close')
}

/* ---------- 鍵盤 ---------- */

/** Tab 循環鎖在檢視器內：底下的照片牆還在 DOM 裡，不鎖會 Tab 出去。 */
function trapTab(e: KeyboardEvent): void {
  const root = rootRef.value
  if (!root) return
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (nodes.length === 0) {
    e.preventDefault()
    return
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = typeof document !== 'undefined' ? document.activeElement : null
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    step(1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    step(-1)
  } else if (e.key === 'Tab') {
    trapTab(e)
  } else if (e.key === ' ') {
    // 焦點在按鈕上時 Space 是「按下那顆按鈕」，不能被播放／暫停攔走
    if ((e.target as HTMLElement | null)?.closest?.('button')) return
    e.preventDefault()
    togglePlay()
  }
}

/* ---------- 拖曳 ---------- */

function resetDrag(): void {
  activePointerId = null
  dragging.value = false
  dragX.value = 0
  dragMoved = false
}

function onPointerDown(e: PointerEvent): void {
  // 已經有一根手指在拖就不換人：第二根手指（雙指縮放）覆寫起點的話，
  // 張開手指會被算成一次大位移而跳到別張照片
  if (activePointerId !== null) return
  if ((e.target as HTMLElement | null)?.closest?.('button')) return
  activePointerId = e.pointerId
  dragging.value = true
  dragMoved = false
  dragStartX = e.clientX
  dragX.value = 0
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || e.pointerId !== activePointerId) return
  const dx = e.clientX - dragStartX
  if (!dragMoved && Math.abs(dx) > DRAG_SLOP_PX) {
    dragMoved = true
    // 拖曳＝使用者接管，先停掉自動播放再說
    playing.value = false
  }
  dragX.value = dx
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value || e.pointerId !== activePointerId) return
  const dx = dragX.value
  const moved = dragMoved
  const target = e.target as HTMLElement | null
  resetDrag()

  if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
    step(dx < 0 ? 1 : -1)
    return
  }
  if (moved) return

  // 沒位移＝點擊：點左右鄰張直接跳過去，點中央大圖切換播放／暫停
  const hit = target?.closest?.('[data-slide-index]')
  const hitIndex = hit ? Number(hit.getAttribute('data-slide-index')) : -1
  if (hitIndex >= 0 && hitIndex !== index.value) go(hitIndex)
  else togglePlay()
}

/**
 * 系統把指標收走了（垂直捲動接手、來電、系統手勢）。這不是使用者放開手指，
 * 不能進 swipe／點擊判定——`.v-stage` 是 touch-action: pan-y，垂直滑動本來
 * 就會走到這裡，當成點擊的話家長在 LIFF 裡捲個畫面就會無故暫停或開始播放。
 */
function onPointerCancel(e: PointerEvent): void {
  if (e.pointerId !== activePointerId) return
  resetDrag()
}

/* ---------- 生命週期 ---------- */

/**
 * 換一個回顧（同一個元件實例被餵新 props）時整組狀態歸零。
 * 目前 caller 會先卸載再掛載所以走不到，但少了這段，日後加「看下一個回顧」
 * 就會停在上一個 index，新回顧較短時直接越界成一片空白。
 */
watch(
  () => props.recap,
  () => {
    clearTimer()
    resetDrag()
    index.value = 0
    runToken.value += 1
    ended.value = photos.value.length <= 1
    playing.value = !reducedMotion && photos.value.length > 1
    // playing 前後同值時上面那個 watcher 不會觸發，這裡補排一次
    scheduleNext()
  },
)

// 換張時把膠卷列的當前張捲進視野，否則長回顧翻到後段會看不到白框在哪
watch(index, async () => {
  await nextTick()
  const current = filmRef.value?.querySelector<HTMLElement>('[data-recap-film-current="true"]')
  current?.scrollIntoView?.({
    block: 'nearest',
    inline: 'center',
    behavior: reducedMotion ? 'auto' : 'smooth',
  })
})

onMounted(() => {
  // 開啟前的焦點（通常是 RecapRail 上被點的那張卡）先記下來，卸載時還原
  previousActiveElement = typeof document !== 'undefined' ? document.activeElement : null
  // template ref 在 onMounted 時已就緒，focus 與計時器都同步起跑：延到
  // microtask 才 schedule 的話，「mount 完立刻推進時間」會抓不到計時器
  rootRef.value?.focus?.()
  scheduleNext()
})

onBeforeUnmount(() => {
  clearTimer()
  const target = previousActiveElement as HTMLElement | null
  previousActiveElement = null
  if (target && typeof target.focus === 'function') target.focus()
})
</script>

<template>
  <div
    ref="rootRef"
    class="recap-viewer"
    :class="{ 'is-paused': !playing }"
    data-test="recap-viewer"
    role="dialog"
    aria-modal="true"
    :aria-label="`${recap.label}的照片回顧`"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <div class="v-head">
      <!-- 故事式分段進度條：一段一張 -->
      <div v-if="segmented" class="v-segs" data-test="recap-progress" aria-hidden="true">
        <span
          v-for="(photo, i) in photos"
          :key="photo.id"
          class="s"
          :class="segClass(i)"
          data-test="recap-seg"
        >
          <i :key="runToken" :style="segFillStyle" />
        </span>
      </div>
      <!--
        張數多到分段看不出來時改成單一條「距離下一張還有多久」：
        第幾張的資訊照片下緣的 caption 已經有了，不必硬塞進進度條。
      -->
      <div v-else class="v-segs" data-test="recap-progress" aria-hidden="true">
        <span class="s" :class="{ done: ended, live: !ended }" data-test="recap-seg-single">
          <i :key="runToken" :style="segFillStyle" />
        </span>
      </div>

      <!--
        換張對螢幕閱讀器的唯一線索。自動播放中設 off，不然每 3.6 秒就轟炸一次。
      -->
      <p class="sr-only" :aria-live="playing ? 'off' : 'polite'" data-test="recap-live-region">
        第 {{ index + 1 }} 張，共 {{ photos.length }} 張
      </p>

      <div class="v-meta">
        <div class="v-meta-text">
          <!-- 常駐的「這是哪一個回顧」標籤，捲不掉 -->
          <span class="v-badge" data-test="recap-badge">
            <span class="dot" aria-hidden="true" />{{ recap.label }}
          </span>
          <p class="v-range" data-test="recap-range">{{ rangeText }}</p>
        </div>
        <div class="v-actions">
          <button
            v-if="canAutoplay"
            type="button"
            class="icon-btn"
            data-test="recap-playpause"
            :aria-label="playing ? '暫停自動播放' : '開始自動播放'"
            @click="togglePlay"
          >
            <M3Icon :name="playing ? 'pause' : 'play_arrow'" :size="20" filled />
          </button>
          <button
            type="button"
            class="icon-btn"
            data-test="recap-close"
            aria-label="關閉回顧"
            @click="close"
          >
            <M3Icon name="close" :size="20" />
          </button>
        </div>
      </div>
    </div>

    <div
      class="v-stage"
      :class="{ 'is-dragging': dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <button
        type="button"
        class="v-nav prev"
        data-test="recap-prev"
        :disabled="atStart"
        aria-label="上一張"
        @click="step(-1)"
      >
        <M3Icon name="chevron_left" :size="24" />
      </button>

      <div class="v-track">
        <div
          v-for="(photo, i) in photos"
          :key="photo.id"
          class="slide"
          :class="{ 'is-current': i === index, 'is-far': isFar(i) }"
          :style="slideStyle(i)"
          :data-slide-index="i"
          data-test="recap-slide"
          :aria-hidden="i === index ? undefined : 'true'"
        >
          <img
            class="img"
            :src="recapDisplaySrc(photo)"
            :alt="slideAlt(i)"
            loading="lazy"
            decoding="async"
          >
          <div class="cap">
            <span>{{ formatRecapDate(photo.photo_date) }}</span>
            <span>{{ i + 1 }} / {{ photos.length }}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="v-nav next"
        data-test="recap-next"
        :disabled="atEnd"
        aria-label="下一張"
        @click="step(1)"
      >
        <M3Icon name="chevron_right" :size="24" />
      </button>
    </div>

    <div class="v-foot">
      <div ref="filmRef" class="filmstrip">
        <button
          v-for="(photo, i) in photos"
          :key="photo.id"
          type="button"
          class="f"
          :class="{ 'is-current': i === index }"
          :data-recap-film-current="i === index ? 'true' : undefined"
          :aria-current="i === index ? 'true' : undefined"
          :aria-label="`第 ${i + 1} 張`"
          data-test="recap-film-item"
          @click="go(i)"
        >
          <img :src="recapThumbSrc(photo)" alt="" loading="lazy" decoding="async">
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 沉浸式看照片的底色刻意是近不透明中性黑：任何 surface token 都偏亮／偏綠，
 * 會把照片的白平衡帶走。與 ChildPhotosView 既有 lightbox 同值，兩個全螢幕
 * 照片層看起來才是同一個東西。
 */
.recap-viewer {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 100);
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.94);
  color: var(--pt-on-accent);
  animation: recap-viewer-in var(--motion-page) var(--motion-emphasized);
}
.recap-viewer:focus {
  outline: none;
}
@keyframes recap-viewer-in {
  from {
    opacity: 0;
    transform: scale(1.04);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ===== 頂部：進度條 + 歸屬標籤 + 動作 ===== */
.v-head {
  flex: none;
  padding: max(14px, env(safe-area-inset-top)) 14px 0;
}

.v-segs {
  display: flex;
  gap: 3px;
}
.v-segs .s {
  flex: 1;
  height: 2.5px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.26);
  overflow: hidden;
}
.v-segs .s > i {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 2px;
  background: var(--pt-on-accent);
}
.v-segs .s.done > i {
  width: 100%;
}
.v-segs .s.live > i {
  animation-name: recap-seg-fill;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
/* 暫停時進度條凍在原處（含 reduced-motion 的預設暫停＝凍在 0%） */
.recap-viewer.is-paused .v-segs .s.live > i {
  animation-play-state: paused;
}
@keyframes recap-seg-fill {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}

.v-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
}
.v-meta-text {
  min-width: 0;
}
.v-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--pt-accent-leaf-container);
  color: var(--pt-accent-leaf-on);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.v-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}
.v-range {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--pt-on-accent);
  opacity: 0.68;
  font-variant-numeric: tabular-nums;
}

.v-actions {
  display: flex;
  gap: 4px;
  flex: none;
}
/* 44px 觸控目標（設計稿畫 36px，DESIGN.md 的 --touch-target-min 是硬底線） */
.icon-btn {
  width: var(--touch-target-min, 44px);
  height: var(--touch-target-min, 44px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: var(--pt-on-accent);
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: background var(--motion-quick) ease;
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.24);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--pt-on-accent);
  outline-offset: 2px;
}

/* ===== 舞台：中央大圖 + 左右鄰張 peek ===== */
.v-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  /* 橫向留給輪播、縱向交還瀏覽器 */
  touch-action: pan-y;
  overflow: hidden;
}
.v-track {
  position: absolute;
  inset: 0;
}
.slide {
  position: absolute;
  top: 50%;
  left: 14%;
  width: 72%;
  aspect-ratio: 3 / 4;
  max-height: 76%;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 40px -14px rgba(0, 0, 0, 0.8);
  transition:
    transform var(--motion-base) var(--motion-emphasized),
    opacity var(--motion-base) var(--motion-emphasized);
  will-change: transform, opacity;
}
/* 拖曳中要跟手，不能有過場緩動 */
.v-stage.is-dragging .slide {
  transition: none;
}
.slide.is-far {
  visibility: hidden;
}
.slide .img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.slide .cap {
  position: absolute;
  inset: auto 0 0 0;
  padding: 22px 14px 12px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  font-size: 12px;
  font-weight: 600;
  color: var(--pt-on-accent);
  font-variant-numeric: tabular-nums;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.slide:not(.is-current) .cap {
  opacity: 0;
}

.v-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: var(--touch-target-min, 44px);
  height: var(--touch-target-min, 44px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.13);
  color: var(--pt-on-accent);
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 3;
}
.v-nav:disabled {
  opacity: 0.22;
  cursor: not-allowed;
}
.v-nav:focus-visible {
  outline: 2px solid var(--pt-on-accent);
  outline-offset: 2px;
}
.v-nav.prev {
  left: 6px;
}
.v-nav.next {
  right: 6px;
}

/* ===== 底部膠卷 ===== */
.v-foot {
  flex: none;
  padding: 10px 0 max(14px, env(safe-area-inset-bottom));
}
.filmstrip {
  display: flex;
  /* 間距由按鈕的 3px 透明 padding 給，讓 44px 觸控目標彼此相接不留死角 */
  gap: 0;
  padding: 0 11px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.filmstrip::-webkit-scrollbar {
  display: none;
}
.filmstrip .f {
  flex: none;
  width: var(--touch-target-min, 44px);
  height: var(--touch-target-min, 44px);
  border: 0;
  padding: 3px;
  background: none;
  cursor: pointer;
  opacity: 0.4;
  transition: opacity var(--motion-quick) ease;
}
.filmstrip .f.is-current {
  opacity: 1;
}
.filmstrip .f img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 9px;
  outline: 2px solid transparent;
  outline-offset: 1px;
  transition: outline-color var(--motion-quick) ease;
}
.filmstrip .f.is-current img {
  outline-color: var(--pt-on-accent);
}
.filmstrip .f:focus-visible img {
  outline-color: var(--m3-primary);
}

@media (prefers-reduced-motion: reduce) {
  .recap-viewer {
    animation: none;
  }
  .slide,
  .icon-btn,
  .filmstrip .f,
  .filmstrip .f img {
    transition: none;
  }
}
</style>
