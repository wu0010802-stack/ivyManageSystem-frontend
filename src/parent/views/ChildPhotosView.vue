<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchChildPhotos } from '../api/childPhotos'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const items = ref([])
const total = ref(0)
const loading = ref(false)
const previewIdx = ref(null)

async function load() {
  if (!studentId.value) return
  loading.value = true
  try {
    const r = await fetchChildPhotos(studentId.value, { limit: 200 })
    items.value = r.data.items || []
    total.value = r.data.total || 0
  } catch (e) {
    toast.error(e?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

function goBack() { router.back() }
function openPreview(idx) { previewIdx.value = idx }
function closePreview() { previewIdx.value = null }
function prevImg() {
  if (previewIdx.value !== null && previewIdx.value > 0) previewIdx.value--
}
function nextImg() {
  if (previewIdx.value !== null && previewIdx.value < items.value.length - 1) previewIdx.value++
}

onMounted(load)
</script>

<template>
  <div class="child-photos-view">
    <header>
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>📷 照片牆</h2>
      <span class="count">共 {{ total }} 張</span>
    </header>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="items.length === 0" class="placeholder">尚無照片</div>
    <div v-else class="grid">
      <div
        v-for="(item, idx) in items"
        :key="item.id"
        class="thumb"
        @click="openPreview(idx)"
      >
        <img :src="item.thumb_url || item.display_url || item.url" :alt="item.filename" loading="lazy" />
      </div>
    </div>

    <div v-if="previewIdx !== null" class="lightbox" @click.self="closePreview">
      <button class="nav prev" @click="prevImg" :disabled="previewIdx === 0">‹</button>
      <img :src="items[previewIdx].display_url || items[previewIdx].url" />
      <button class="nav next" @click="nextImg" :disabled="previewIdx === items.length - 1">›</button>
      <button class="close" @click="closePreview">✕</button>
    </div>
  </div>
</template>

<style scoped>
.child-photos-view { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
header { display: flex; align-items: center; gap: 12px; }
header > h2 { margin: 0; font-size: 17px; color: #0d9053; }
.back-btn { background: none; border: none; font-size: 14px; color: #0d9053; }
.count { margin-left: auto; font-size: 13px; color: var(--text-secondary); }
.placeholder { padding: 32px; text-align: center; color: var(--text-tertiary); }
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--m3-surface-container-high, var(--pt-surface-mute));
  border-radius: 12px;
  cursor: pointer;
}
.thumb > img { width: 100%; height: 100%; object-fit: cover; }
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.lightbox > img { max-width: 95vw; max-height: 90vh; object-fit: contain; }
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255,255,255,0.2);
  color: #fff;
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: 24px;
  cursor: pointer;
}
.nav.prev { left: 12px; }
.nav.next { right: 12px; }
.nav:disabled { opacity: 0.3; cursor: not-allowed; }
.close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255,255,255,0.2);
  color: #fff;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
}
</style>
