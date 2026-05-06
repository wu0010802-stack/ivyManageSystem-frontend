<script setup>
import { Camera, Delete } from '@element-plus/icons-vue'
import LazyImage from '@/components/common/LazyImage.vue'

defineProps({
  photos: { type: Array, required: true },
  uploading: { type: Boolean, default: false },
})

const emit = defineEmits(['upload', 'delete'])

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (file) emit('upload', file)
  e.target.value = ''
}
</script>

<template>
  <div class="photo-grid">
    <div v-for="p in photos" :key="p.id" class="photo-cell">
      <LazyImage
        :src="p.url"
        alt="聯絡簿照片"
        class="photo-img"
      />
      <button
        type="button"
        class="del-btn"
        :aria-label="`刪除照片 ${p.id}`"
        data-test="delete-btn"
        @click="emit('delete', p.id)"
      >
        <el-icon><Delete /></el-icon>
      </button>
    </div>

    <label
      class="upload-cell"
      :class="{ 'is-uploading': uploading }"
      data-test="upload-cell"
    >
      <input
        type="file"
        accept="image/*"
        :disabled="uploading"
        hidden
        @change="onFileChange"
      />
      <el-icon><Camera /></el-icon>
      <span>{{ uploading ? '上傳中…' : '上傳照片' }}</span>
    </label>
  </div>
</template>

<style scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.photo-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: var(--pt-hairline);
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.del-btn {
  position: absolute; top: 4px; right: 4px;
  background: rgba(0, 0, 0, 0.6); color: #fff; border: none;
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  -webkit-tap-highlight-color: transparent;
}

.del-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.upload-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  aspect-ratio: 1;
  border: 2px dashed var(--pt-text-faint);
  border-radius: var(--radius-md);
  cursor: pointer; gap: 4px;
  font-size: var(--text-xs); color: var(--pt-text-muted);
  transition: border-color var(--transition-base), background var(--transition-base);
  -webkit-tap-highlight-color: transparent;
}

.upload-cell:hover {
  border-color: var(--pt-text-muted);
  background: var(--pt-surface-mute);
}

.upload-cell.is-uploading {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
