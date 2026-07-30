<script setup lang="ts">
// A1-P2：從 ActivityPublicView 抽出的影片預覽 modal。
// 接受 youtubeId 優先（嵌入 iframe）否則 url（HTML5 video）。
import { ref } from 'vue'
import { useAccessibleDialog } from '@/composables/useAccessibleDialog'

const props = withDefaults(defineProps<{
  visible?: boolean
  title?: string
  url?: string
  youtubeId?: string | null
}>(), {
  visible: false,
  title: '',
  url: '',
  youtubeId: null,
})
const emit = defineEmits<{
  (e: 'close'): void
}>()
const dialogRef = ref<HTMLElement | null>(null)

const { onDialogKeydown } = useAccessibleDialog({
  open: () => props.visible,
  dialogRef,
  close: () => emit('close'),
})
</script>

<template>
  <div
    v-if="visible"
    class="modal-overlay is-visible"
    @click.self="$emit('close')"
  >
    <div
      ref="dialogRef"
      class="modal-panel modal-panel--video"
      role="dialog"
      aria-modal="true"
      aria-labelledby="videoModalTitle"
      tabindex="-1"
      @keydown="onDialogKeydown"
    >
      <h3 id="videoModalTitle" class="modal-title">{{ title }}</h3>
      <button type="button" class="modal-close tap-target" aria-label="關閉影片" @click="$emit('close')">
        <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
      </button>
      <div class="video-wrapper">
        <iframe
          v-if="youtubeId"
          :src="`https://www.youtube.com/embed/${youtubeId}?autoplay=1`"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          height="480"
        />
        <video v-else-if="url" :src="url" controls autoplay>
          您的瀏覽器不支援影片播放
        </video>
      </div>
    </div>
  </div>
</template>
<!-- CSS 由 parent ActivityPublicView 的 non-scoped <style> 區塊以
     `.public-activity-page` ancestor 提供（包含 modal-base 與 --video 變體）。 -->
