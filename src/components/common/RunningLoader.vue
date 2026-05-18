<script setup>
import { computed } from 'vue'

/**
 * 全螢幕 loading overlay：暗色半透明背景 + 跑步小朋友 GIF 由左至右循環。
 *
 * 用法：
 *   <RunningLoader :active="isLoading" label="載入中…" :variant="1" />
 *
 * variant 1 = 男童側跑（預設） / 2 = 紅衣小孩 / 3 = 馬尾女孩側跑。
 * 想換圖直接改 variant 數字即可。
 */

const props = defineProps({
  active: { type: Boolean, default: false },
  label: { type: String, default: '載入中…' },
  // 1 | 2 | 3，對應 public/images/loading-runner-{n}.gif
  variant: { type: Number, default: 1 },
  // 跑完一趟（左→右）的秒數
  speed: { type: Number, default: 3.5 },
  // backdrop 不透明度（0.7~0.8 之間視覺最舒適）
  opacity: { type: Number, default: 0.78 },
})

const GIF_SOURCES = {
  1: '/images/loading-runner-1.gif',
  2: '/images/loading-runner-2.gif',
  3: '/images/loading-runner-3.gif',
}

const gifSrc = computed(() => GIF_SOURCES[props.variant] || GIF_SOURCES[1])

const backdropStyle = computed(() => ({
  background: `rgba(15, 23, 42, ${props.opacity})`,
}))

const spriteStyle = computed(() => ({
  animationDuration: `${props.speed}s`,
}))
</script>

<template>
  <Transition name="rl-fade">
    <div
      v-if="active"
      class="running-loader"
      :style="backdropStyle"
      role="status"
      :aria-label="label || '載入中'"
      aria-live="polite"
    >
      <div class="running-loader__track">
        <img
          :src="gifSrc"
          class="running-loader__sprite"
          :style="spriteStyle"
          alt=""
          aria-hidden="true"
        />
      </div>
      <p v-if="label" class="running-loader__label">{{ label }}</p>
    </div>
  </Transition>
</template>

<style scoped>
.running-loader {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  /* backdrop 顏色透過 inline style 注入，方便外部覆寫 */
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.running-loader__track {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
  pointer-events: none;
}

.running-loader__sprite {
  position: absolute;
  top: 0;
  left: 0;
  height: 150px;
  width: auto;
  transform: translate3d(-220px, 0, 0);
  animation: rl-run linear infinite;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35));
}

@keyframes rl-run {
  from {
    transform: translate3d(-220px, 0, 0);
  }
  to {
    transform: translate3d(100vw, 0, 0);
  }
}

.running-loader__label {
  margin: 0;
  color: #f8fafc;
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  animation: rl-label-pulse 1.6s ease-in-out infinite;
}

@keyframes rl-label-pulse {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}

.rl-fade-enter-active,
.rl-fade-leave-active {
  transition: opacity 240ms ease;
}
.rl-fade-enter-from,
.rl-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .running-loader__sprite {
    animation: none;
    left: 50%;
    transform: translate3d(-50%, 0, 0);
  }
  .running-loader__label {
    animation: none;
    opacity: 0.9;
  }
}
</style>
