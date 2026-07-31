<script setup lang="ts">
// Task 8：從 VideoModal 照抄殼（overlay/close/useAccessibleDialog 用法一致），
// 內容區改為課程 DM 頁圖清單 + 原始檔為 PDF 時的下載列。
// 注意：title/close 改走 .modal-header 包裹（比照 ContactInquiryModal／
// SuccessSummaryModal 的一般 modal 結構），非 VideoModal 那種無 header、
// 靠 --video 變體浮到面板外的沉浸式殼——那是配合全幅黑底影片的特例，
// DM 頁圖是一般內容，需要標準 header（padding + border-bottom + 右上角關閉鈕）。
import { ref } from 'vue'
import { useAccessibleDialog } from '@/composables/useAccessibleDialog'

const props = withDefaults(defineProps<{
  visible?: boolean
  title?: string
  pages?: string[]
  pdfUrl?: string | null
}>(), {
  visible: false,
  title: '',
  pages: () => [],
  pdfUrl: null,
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
      class="modal-panel modal-panel--dm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dmModalTitle"
      tabindex="-1"
      @keydown="onDialogKeydown"
    >
      <div class="modal-header">
        <h3 id="dmModalTitle" class="modal-title">{{ title }}</h3>
        <button type="button" class="modal-close tap-target" aria-label="關閉課程簡介" @click="$emit('close')">
          <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </div>
      <div class="modal-body dm-pages">
        <img
          v-for="(p, i) in pages"
          :key="p"
          :src="p"
          :alt="`${title || '課程'} 簡介第 ${i + 1} 頁`"
          loading="lazy"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
      </div>
      <div v-if="pdfUrl" class="dm-download-row">
        <a :href="pdfUrl" target="_blank" rel="noopener" class="dm-download-link">下載 PDF</a>
      </div>
    </div>
  </div>
</template>
<!-- CSS 由 parent ActivityPublicView 的 non-scoped <style> 區塊以
     `.public-activity-page` ancestor 提供（包含 modal-base 與 --dm 變體）。 -->
