<script setup>
defineProps({ photos: { type: Array, required: true } })
defineEmits(['upload', 'delete'])
</script>

<template>
  <div class="photo-grid-placeholder">
    <!-- Round 3 將擴充為 LazyImage grid + 上傳/刪除 -->
    <div v-for="p in photos" :key="p.id" class="photo-cell">
      <img :src="p.url" alt="" />
      <button @click="$emit('delete', p.id)">×</button>
    </div>
    <label class="upload-cell">
      <input
        type="file"
        accept="image/*"
        hidden
        @change="(e) => e.target.files?.[0] && $emit('upload', e.target.files[0])"
      />
      上傳照片
    </label>
  </div>
</template>
