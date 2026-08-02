<script setup lang="ts">
// 海報放大檢視：原圖是 2500px 級的 A4 直式印刷稿，但報名頁左欄只有 ~526px 寬
// （約 2.4 倍降採樣），海報上的小字被縮到 17px 以下，家長會覺得「畫質不夠」。
// 這支彈窗讓家長把原圖撐到視窗高度來看，不動原圖也不改頁面版面。
//
// 殼照抄 VideoModal（沉浸式：面板透明、標題與關閉鈕浮到圖框外、深色 overlay），
// 而非 DmPreviewModal 那種白底 header 面板——海報就是要盡量大，面板 padding
// 與 header 會吃掉可視高度。
import { ref, watch } from 'vue'
import { useAccessibleDialog } from '@/composables/useAccessibleDialog'

const props = withDefaults(defineProps<{
  visible?: boolean
  title?: string
  src?: string
  downloadName?: string
  canShare?: boolean
}>(), {
  visible: false,
  title: '',
  src: '',
  downloadName: 'poster.jpg',
  canShare: false,
})
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'share'): void
}>()
const dialogRef = ref<HTMLElement | null>(null)

// 二段縮放：手機上「整張 fit 螢幕寬」跟頁面裡的海報幾乎一樣大（實測 1.06 倍），
// 等於沒放大。要看清印刷小字必須讓圖超出螢幕再捲動，但一開圖就是局部會讓人困惑，
// 所以照一般看圖工具的慣例做兩段——先整張，點一下放大到兩倍再自由捲動。
const zoomed = ref(false)
function toggleZoom() {
  zoomed.value = !zoomed.value
}
// 每次重新開啟都回到「整張」，不要沿用上次關閉時的放大狀態
watch(() => props.visible, (v) => {
  if (!v) zoomed.value = false
})

const { onDialogKeydown } = useAccessibleDialog({
  open: () => props.visible,
  dialogRef,
  close: () => emit('close'),
})
</script>

<template>
  <div
    v-if="visible"
    class="modal-overlay modal-overlay--poster is-visible"
    @click.self="$emit('close')"
  >
    <div
      ref="dialogRef"
      class="modal-panel modal-panel--poster"
      role="dialog"
      aria-modal="true"
      aria-labelledby="posterLightboxTitle"
      tabindex="-1"
      @keydown="onDialogKeydown"
    >
      <h3 id="posterLightboxTitle" class="modal-title">{{ title }}</h3>
      <button
        type="button"
        class="modal-close tap-target"
        aria-label="關閉海報"
        @click="$emit('close')"
      >
        <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
      </button>
      <img
        class="poster-full"
        :class="{ 'is-zoomed': zoomed }"
        :src="src"
        :alt="`${title || '活動'} 海報（放大檢視）`"
        role="button"
        tabindex="0"
        :aria-label="zoomed ? '縮小海報' : '再放大海報'"
        @click="toggleZoom"
        @keydown.enter.prevent="toggleZoom"
        @keydown.space.prevent="toggleZoom"
      />
      <div class="poster-full-actions">
        <button
          type="button"
          class="poster-action tap-target"
          :aria-label="zoomed ? '縮小海報' : '再放大海報'"
          @click="toggleZoom"
        >
          <svg class="icon" aria-hidden="true"><use href="#i-search" /></svg>
          {{ zoomed ? '縮小' : '再放大' }}
        </button>
        <a
          class="poster-action tap-target"
          :href="src"
          :download="downloadName"
          target="_blank"
          rel="noopener"
          aria-label="下載海報原圖"
        >
          <svg class="icon" aria-hidden="true"><use href="#i-download" /></svg>
          下載原圖
        </a>
        <button
          v-if="canShare"
          type="button"
          class="poster-action tap-target"
          aria-label="分享海報給家人"
          @click="$emit('share')"
        >
          <svg class="icon" aria-hidden="true"><use href="#i-share" /></svg>
          分享
        </button>
      </div>
    </div>
  </div>
</template>
<!-- CSS 由 parent ActivityPublicView 的 non-scoped <style> 區塊以
     `.public-activity-page` ancestor 提供（modal-base 與 --poster 變體）。 -->
