<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchChildPhotos } from '../api/childPhotos'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

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

function openPreview(idx) { previewIdx.value = idx }
function closePreview() { previewIdx.value = null }
function prevImg() { if (previewIdx.value > 0) previewIdx.value-- }
function nextImg() { if (previewIdx.value < items.value.length - 1) previewIdx.value++ }

onMounted(load)
</script>

<template>
  <div class="photos-view">
    <header v-if="total > 0" class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">成長相簿</p>
      <h1 class="pt-page-hero-title">{{ total }} 張珍藏</h1>
      <p class="pt-page-hero-note">老師為您拍下的學校點滴</p>
    </header>

    <template v-if="loading">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" />
      </div>
    </template>

    <EmptyState
      v-else-if="items.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      title="尚無照片"
      description="老師上傳照片後會出現在這裡"
    />

    <div v-else class="grid pt-section-pad-x">
      <button
        v-for="(item, idx) in items"
        :key="item.id"
        type="button"
        class="thumb"
        :aria-label="`查看第 ${idx + 1} 張照片`"
        @click="openPreview(idx)"
      >
        <img :src="item.thumb_url || item.display_url || item.url" :alt="item.filename" loading="lazy" decoding="async" />
      </button>
    </div>

    <div
      v-if="previewIdx !== null"
      class="lightbox"
      role="dialog"
      aria-modal="true"
      @click.self="closePreview"
    >
      <button class="nav prev" :disabled="previewIdx === 0" aria-label="上一張" @click="prevImg">
        <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
      </button>
      <img :src="items[previewIdx].display_url || items[previewIdx].url" alt="放大照片" />
      <button class="nav next" :disabled="previewIdx === items.length - 1" aria-label="下一張" @click="nextImg">
        <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
      </button>
      <button class="close" type="button" aria-label="關閉" @click="closePreview">
        <span class="material-symbols-rounded" aria-hidden="true">close</span>
      </button>
      <div class="counter">{{ previewIdx + 1 }} / {{ items.length }}</div>
    </div>
  </div>
</template>

<style scoped>
.photos-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}
.skeleton-wrap { padding: 0 16px; }

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--pt-border-light, #ecf5f9);
  border-radius: 12px;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: transform 120ms ease;
}
.thumb:active { transform: scale(0.97); }
.thumb:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.lightbox img {
  max-width: 95vw;
  max-height: 88vh;
  object-fit: contain;
}
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border: none;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.nav:disabled { opacity: 0.25; cursor: not-allowed; }
.nav .material-symbols-rounded { font-size: 28px; }
.nav.prev { left: 12px; }
.nav.next { right: 12px; }

.close {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  right: 16px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.close .material-symbols-rounded { font-size: 22px; }

.counter {
  position: absolute;
  bottom: max(24px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .thumb { transition: none; }
}
</style>
