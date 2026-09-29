<script setup lang="ts">
import { ref } from 'vue'
import { Delete } from '@element-plus/icons-vue'

// el-image / el-image-viewer 交給 unplugin ElementPlusResolver 自動引入（連同樣式）；
// 在 script 顯式 import 會繞過 resolver，viewer 的 CSS 不會載入，放大檢視整個跑版。
withDefaults(defineProps<{
  items?: Record<string, unknown>[]
  /** 顯示每張縮圖右上角的刪除鈕（呼叫端依 PORTFOLIO_WRITE 決定） */
  deletable?: boolean
}>(), {
  items: () => [],
  deletable: false,
})

const emit = defineEmits<{
  delete: [item: Record<string, unknown>]
}>()

const previewVisible = ref(false)
const previewIndex = ref(0)

function openPreview(idx: number) {
  previewIndex.value = idx
  previewVisible.value = true
}

defineExpose({ previewVisible, openPreview })
</script>

<template>
  <div class="attachment-gallery">
    <div
      v-for="(item, idx) in items"
      :key="item.id as PropertyKey"
      class="thumb"
    >
      <button
        type="button"
        class="thumb-open"
        :aria-label="`放大檢視第 ${idx + 1} 張照片`"
        @click="openPreview(idx)"
      >
        <el-image
          :src="(item.thumb_url || item.display_url || item.url) as string | undefined"
          fit="cover"
          lazy
        />
        <span class="meta">
          <span class="date">{{ (item.created_at as string | undefined)?.slice(0, 10) }}</span>
        </span>
      </button>
      <button
        v-if="deletable"
        type="button"
        class="thumb-delete"
        :aria-label="`刪除第 ${idx + 1} 張照片`"
        title="刪除"
        @click="emit('delete', item)"
      >
        <el-icon :size="14"><Delete /></el-icon>
      </button>
    </div>

    <el-image-viewer
      v-if="previewVisible"
      :url-list="items.map((it) => (it.display_url || it.url) as string)"
      :initial-index="previewIndex"
      teleported
      @close="previewVisible = false"
    />
  </div>
</template>

<style scoped>
.attachment-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
.thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}
.thumb-open {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
.thumb-open:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.thumb :deep(.el-image) { width: 100%; height: 100%; }
.thumb .meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.6));
  color: #fff;
  padding: 4px 6px;
  font-size: 12px;
  text-align: left;
}
.thumb-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease, background-color 120ms ease;
}
.thumb:hover .thumb-delete,
.thumb-delete:focus-visible { opacity: 1; }
.thumb-delete:hover { background: var(--el-color-danger); }
.thumb-delete:focus-visible {
  outline: 2px solid var(--el-color-danger);
  outline-offset: 1px;
}
/* 觸控裝置沒有 hover，刪除鈕常駐 */
@media (hover: none) {
  .thumb-delete { opacity: 1; }
}
</style>
