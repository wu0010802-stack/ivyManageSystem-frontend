<script setup lang="ts">
import { ref } from 'vue'
import { ElImage, ElImageViewer } from 'element-plus'

withDefaults(defineProps<{
  items?: Record<string, unknown>[]
}>(), {
  items: () => [],
})

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
      @click="openPreview(idx)"
    >
      <el-image
        :src="(item.thumb_url || item.display_url || item.url) as string | undefined"
        fit="cover"
        lazy
      />
      <div class="meta">
        <span class="date">{{ (item.created_at as string | undefined)?.slice(0, 10) }}</span>
      </div>
    </div>

    <el-image-viewer
      v-if="previewVisible"
      :url-list="items.map((it) => (it.display_url || it.url) as string)"
      :initial-index="previewIndex"
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
  cursor: pointer;
  background: var(--el-fill-color-light);
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
}
</style>
