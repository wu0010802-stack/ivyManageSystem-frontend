<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

/**
 * 聯絡簿「已讀」蓋章按鈕（純呈現層）。
 *
 * - 已讀與否（`isRead`）與送出中（`disabled`）完全由父層驅動；本元件只負責
 *   「點擊 → 印章由上落下蓋章 → 抬起淡出」這一段視覺，並 emit `click` 讓父層
 *   自己決定要打 API 還是假資料模擬。
 * - 動畫用 gsap timeline 編排（2026-09-08 起，使用者明確要求引入動畫庫換掉純
 *   CSS keyframes 版），且 gsap 走 `await import('gsap')` 懶載入：元件本身在
 *   parent-app eager chunk，但 gsap 只在進到聯絡簿詳情頁才下載（vite.config.js
 *   把它 pin 成獨立 `gsap` chunk）。
 * - 文字轉紅仍由 `isRead` 驅動（與 ack 成功與否解耦），但在印章落下前會先「壓住」
 *   轉紅（`showRead`），避免 API 很快回來時文字在印章還在半空中就先變色；印章
 *   接觸的瞬間之後才放行，ack 失敗則維持灰色可重點。
 * - `prefers-reduced-motion: reduce`：整段 gsap 動畫跳過，直接顯示終態
 *   （CSS transition 也一併關閉）。
 */

const props = withDefaults(defineProps<{
  isRead: boolean
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{ click: [] }>()

type Gsap = typeof import('gsap')['gsap']

/** 印章接觸瞬間噴出的墨點方向（px，相對按鈕中心；多數往上噴、少數往兩側） */
const SPECK_DIRS = [
  { x: -30, y: -12 },
  { x: -18, y: -26 },
  { x: -4, y: -30 },
  { x: 10, y: -28 },
  { x: 24, y: -20 },
  { x: 32, y: -6 },
]
/** 印章從按鈕上方多遠的地方開始落下 */
const DROP_FROM_PX = -88
/** 整段動畫若 gsap 載入失敗／timeline 沒跑完（測試環境無 rAF），保底重置狀態 */
const SAFETY_RESET_MS = 1400

const uid = useId()
const gradWood = `${uid}-wood`
const gradBase = `${uid}-base`
const gradFace = `${uid}-face`

const rootEl = ref<HTMLButtonElement | null>(null)
const toolEl = ref<SVGSVGElement | null>(null)
const shadowEl = ref<HTMLElement | null>(null)
const ringEl = ref<HTMLElement | null>(null)
const flashEl = ref<HTMLElement | null>(null)
const speckEls = ref<HTMLElement[]>([])

const stamping = ref(false)
const impacted = ref(false)
let safetyTimer: ReturnType<typeof setTimeout> | null = null
let activeTimeline: ReturnType<Gsap['timeline']> | null = null

/** 動畫進行中且印章尚未接觸前，先壓住「已讀」轉紅；其餘時間完全跟著 isRead。 */
const showRead = computed(() => props.isRead && (!stamping.value || impacted.value))
const isDisabled = computed(() => props.disabled || props.isRead)

let gsapRef: Gsap | null = null
let gsapLoading: Promise<Gsap | null> | null = null
function loadGsap(): Promise<Gsap | null> {
  if (gsapRef) return Promise.resolve(gsapRef)
  if (!gsapLoading) {
    gsapLoading = import('gsap')
      .then((m) => { gsapRef = m.gsap; return gsapRef })
      .catch(() => null)
  }
  return gsapLoading
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function finish() {
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
  const g = gsapRef
  if (g) {
    const targets = [rootEl.value, toolEl.value, shadowEl.value, ringEl.value, flashEl.value, ...speckEls.value]
      .filter((el): el is HTMLElement | SVGSVGElement => !!el)
    g.set(targets, { clearProps: 'all' })
  }
  activeTimeline = null
  stamping.value = false
  impacted.value = false
}

async function playStamp() {
  const root = rootEl.value
  const tool = toolEl.value
  const shadow = shadowEl.value
  const ring = ringEl.value
  const flash = flashEl.value
  const specks = speckEls.value
  if (!root || !tool || !shadow || !ring || !flash) return

  const g = await loadGsap()
  // gsap 載入失敗（或等待期間元件已卸載）→ 略過動畫，狀態由 safety timer 收尾
  if (!g || !stamping.value) return

  activeTimeline?.kill()
  const tl = g.timeline({ onComplete: finish })
  activeTimeline = tl

  tl
    // 起始姿勢：印章在按鈕上方、微傾、略大（近景透視），全部隱形
    .set(tool, { y: DROP_FROM_PX, rotation: -12, scale: 1.12, opacity: 0, transformOrigin: '50% 100%' })
    .set(root, { transformOrigin: '50% 100%' })
    .set(shadow, { scale: 0.3, opacity: 0, transformOrigin: '50% 50%' })
    .set(ring, { scale: 0.45, opacity: 0, transformOrigin: '50% 50%' })
    .set(flash, { opacity: 0 })
    .set(specks, { x: 0, y: 0, scale: 0, opacity: 0 })
    // ① 落下（0 → 360ms）：power3.in 模擬重力加速，落地前轉正、縮回原尺寸；
    //    地面陰影同步由小變大、由淡變深，強化「越來越近」的感受
    .to(tool, { opacity: 1, duration: 0.08, ease: 'none' }, 0)
    .to(tool, { y: 0, rotation: 0, scale: 1, duration: 0.36, ease: 'power3.in' }, 0)
    .to(shadow, { scale: 1, opacity: 0.38, duration: 0.36, ease: 'power3.in' }, 0)
    // ② 衝擊（360ms）：印章壓扁再彈回、整顆按鈕被砸得往下沉一點（微位移＋縱向
    //    壓扁，以底邊為支點）再彈回、左右震一下、按鈕內閃過一層淡紅「出墨」、
    //    衝擊波往外擴散、墨點噴濺
    .add('impact', 0.36)
    .call(() => { impacted.value = true }, undefined, 'impact')
    .to(tool, { scaleY: 0.82, scaleX: 1.1, duration: 0.07, ease: 'power2.out' }, 'impact')
    .to(tool, { scaleY: 1, scaleX: 1, duration: 0.24, ease: 'elastic.out(1, 0.45)' }, 'impact+=0.07')
    .to(root, { y: 3, scaleY: 0.94, duration: 0.06, ease: 'power2.out' }, 'impact')
    .to(root, { y: 0, scaleY: 1, duration: 0.3, ease: 'back.out(2.5)' }, 'impact+=0.06')
    .fromTo(root, { x: 0 }, { x: 2, duration: 0.035, repeat: 3, yoyo: true, ease: 'none' }, 'impact')
    .to(flash, { opacity: 1, duration: 0.05, ease: 'none' }, 'impact')
    .to(flash, { opacity: 0, duration: 0.45, ease: 'power2.out' }, 'impact+=0.08')
    .to(ring, { opacity: 0.6, duration: 0.04, ease: 'none' }, 'impact')
    .to(ring, { scale: 1.75, opacity: 0, duration: 0.36, ease: 'power2.out' }, 'impact+=0.02')
    .to(specks, { opacity: 1, scale: 1, duration: 0.05, stagger: 0.012, ease: 'none' }, 'impact')
    .to(specks, {
      x: (i: number) => SPECK_DIRS[i]?.x ?? 0,
      y: (i: number) => SPECK_DIRS[i]?.y ?? 0,
      opacity: 0,
      scale: 0.35,
      duration: 0.38,
      ease: 'power2.out',
    }, 'impact+=0.03')
    // ③ 抬起（約 560 → 820ms）：印章往上收、微微傾斜、淡出，陰影跟著收掉；
    //    畫面上只留下轉紅的「已讀」
    .to(tool, { y: -32, rotation: 7, opacity: 0, duration: 0.26, ease: 'power2.in' }, 'impact+=0.2')
    .to(shadow, { scale: 0.4, opacity: 0, duration: 0.22, ease: 'power2.out' }, 'impact+=0.2')
}

function onClick() {
  if (isDisabled.value || stamping.value) return
  emit('click')
  if (prefersReducedMotion()) return

  stamping.value = true
  impacted.value = false
  if (safetyTimer) clearTimeout(safetyTimer)
  safetyTimer = setTimeout(finish, SAFETY_RESET_MS)
  void playStamp()
}

onMounted(() => {
  // 進頁就預載 gsap，讓第一次點擊不會卡在下載 chunk
  if (!prefersReducedMotion()) void loadGsap()
})

onBeforeUnmount(() => {
  if (safetyTimer) clearTimeout(safetyTimer)
  activeTimeline?.kill()
  activeTimeline = null
})
</script>

<template>
  <button
    ref="rootEl"
    type="button"
    class="stamp-target"
    :class="{ 'is-read': showRead, 'is-stamping': stamping }"
    :disabled="isDisabled"
    :aria-pressed="isRead"
    aria-label="標記這則聯絡簿為已讀"
    @click="onClick"
  >
    <span ref="flashEl" class="stamp-flash" aria-hidden="true"></span>
    <span class="stamp-outline-text">已讀</span>

    <!-- 蓋章瞬間的衝擊波與墨點（僅動畫期間可見） -->
    <span ref="ringEl" class="stamp-ring" aria-hidden="true"></span>
    <span
      v-for="(_, i) in SPECK_DIRS"
      :key="i"
      ref="speckEls"
      class="stamp-speck"
      aria-hidden="true"
    ></span>

    <!-- 印章落點的地面陰影 -->
    <span ref="shadowEl" class="stamp-shadow" aria-hidden="true"></span>

    <!-- 印章本體：木頭握把 + 紅色底座 + 深紅橡皮印面（側面視角） -->
    <svg
      ref="toolEl"
      class="stamp-tool"
      viewBox="0 0 72 66"
      width="72"
      height="66"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient :id="gradWood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e6b57c" />
          <stop offset="0.55" stop-color="#b97b46" />
          <stop offset="1" stop-color="#7f4a2a" />
        </linearGradient>
        <linearGradient :id="gradBase" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e46a6a" />
          <stop offset="0.5" stop-color="#c33f3f" />
          <stop offset="1" stop-color="#8a2626" />
        </linearGradient>
        <linearGradient :id="gradFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8f2a2a" />
          <stop offset="1" stop-color="#561414" />
        </linearGradient>
      </defs>
      <!-- 握把 -->
      <rect x="26" y="1" width="20" height="26" rx="9" :fill="`url(#${gradWood})`" />
      <rect x="30" y="4" width="4" height="18" rx="2" fill="#fff" opacity="0.28" />
      <!-- 握把套環與頸部 -->
      <rect x="22" y="24" width="28" height="7" rx="3" fill="#6b4126" />
      <rect x="31" y="30" width="10" height="7" fill="#5a3620" />
      <!-- 底座 -->
      <rect x="8" y="36" width="56" height="16" rx="5" :fill="`url(#${gradBase})`" />
      <rect x="12" y="38" width="48" height="4" rx="2" fill="#fff" opacity="0.18" />
      <!-- 橡皮印面 -->
      <rect x="4" y="50" width="64" height="14" rx="4" :fill="`url(#${gradFace})`" />
      <rect x="4" y="61" width="64" height="4" rx="2" fill="#3a0d0d" />
    </svg>
  </button>
</template>

<style scoped>
/* `.stamp-target` class 名為既有測試的查詢錨點（contactBook.test.js /
 * parent-offline-network-fallback.test.ts 皆 `find('.stamp-target')`），勿改名。 */
.stamp-target {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  height: 36px;
  padding: 0 18px;
  border-radius: 8px;
  border: 2px solid var(--pt-text-faint, #9aa5ab);
  background: transparent;
  cursor: pointer;
  isolation: isolate;
  transition: border-color 200ms ease;
}
.stamp-target:disabled { cursor: default; }
.stamp-target:not(:disabled):not(.is-stamping):active .stamp-outline-text { transform: scale(0.94); }
.stamp-target.is-read {
  border-color: var(--coral-600, #e96b6b);
  cursor: default;
}

.stamp-outline-text {
  position: relative;
  z-index: 1;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--pt-text-faint, #9aa5ab);
  transition: color 200ms ease, transform 120ms ease;
}
/* 蓋完章後文字只變色，位置維持水平置中不動（使用者明確不要歪斜／位移） */
.stamp-target.is-read .stamp-outline-text {
  color: var(--coral-600, #e96b6b);
}

/* 蓋章瞬間按鈕內閃過的一層淡紅「出墨」 */
.stamp-flash {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--coral-100, #ffe3e0);
  opacity: 0;
  pointer-events: none;
}

/* 衝擊波：跟按鈕同樣是圓角矩形（radius 略大於按鈕的 8px，放大後仍呈圓角），
 * 像按鈕外框被震出去的殘影往外擴散，跟方形按鈕搭配才不突兀 */
.stamp-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 84px;
  height: 44px;
  margin: -22px 0 0 -42px;
  border-radius: 12px;
  border: 2px solid var(--coral-500, #ff8b8b);
  opacity: 0;
  pointer-events: none;
  z-index: 2;
}

/* 墨點 */
.stamp-speck {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: var(--coral-600, #e96b6b);
  opacity: 0;
  pointer-events: none;
  z-index: 2;
}

/* 地面陰影：落在按鈕正中央、隨印章逼近而變大變深 */
.stamp-shadow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72px;
  height: 14px;
  margin: -7px 0 0 -36px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(20, 10, 10, 0.55) 0%, rgba(20, 10, 10, 0) 70%);
  opacity: 0;
  pointer-events: none;
  z-index: 2;
}

/* 印章本體：印面底部對齊按鈕垂直中心偏下，蓋下時剛好壓住「已讀」文字 */
.stamp-tool {
  position: absolute;
  left: 50%;
  bottom: 4px;
  margin-left: -36px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
  filter: drop-shadow(0 6px 6px rgba(40, 10, 10, 0.28));
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  .stamp-target,
  .stamp-outline-text { transition: none; }
  .stamp-target:not(:disabled):active .stamp-outline-text { transform: none; }
  .stamp-tool { will-change: auto; }
}
</style>
