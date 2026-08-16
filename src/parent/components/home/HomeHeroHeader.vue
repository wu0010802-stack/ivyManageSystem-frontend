<script setup lang="ts">
/**
 * 首頁頂部 hero：問候語 chip（早中晚＋插畫）＋孩子近期照片輪播、姓名、
 * 日期／星期／班級。取代原本份量最輕的問候語列（.today-head）。
 *
 * 2026-08-16 首頁改版：見該次對話的 Artifact 預覽稿。舊決策（2026-05-16／
 * 2026-08-14，見 tests/unit/parent/views/TodayView.test.js 註解）是把問候語
 * 份量壓到最低、避免搶走「今日聯絡簿」卡的視覺主角地位；這次改版是使用者
 * 明確要求的新方向，此 hero 改為孩子識別（照片＋姓名）為主、天氣問候語為輔，
 * 「今日聯絡簿」卡仍完整保留、緊接在後——沒有被拿掉，只是不再是第一眼。
 *
 * 照片輪播：只用 /parent/photos 真實回傳的照片，抓不到（無照片／API 失敗）
 * 一律降級成預設頭像 icon，不捏造照片。天氣本身（溫度／天氣現象）目前無資料
 * 來源，只保留「早安／午安／晚安」＋太陽或月亮插畫，暫不顯示氣溫或天氣現象
 * （待確認是否要接氣象 API，見預覽稿的「想跟您確認」）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchChildPhotos } from '../../api/childPhotos'
import GreetingSunIllustration from '../illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '../illustrations/GreetingMoonIllustration.vue'

const props = defineProps<{
  studentId: number | null
  name: string
  classroomName?: string | null
}>()

type GreetingPeriod = 'morning' | 'noon' | 'evening'
const GREETING_TEXT: Record<GreetingPeriod, string> = { morning: '早安', noon: '午安', evening: '晚安' }

function greetingPeriod(): GreetingPeriod {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'noon'
  return 'evening'
}

const period = ref<GreetingPeriod>(greetingPeriod())
const greetingText = computed(() => GREETING_TEXT[period.value])
const isEvening = computed(() => period.value === 'evening')

/** 日期／星期／班級一行；星期一律用中文全形字，不用英文縮寫（沿用既有決策）。 */
const dateMeta = computed(() => {
  const d = new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const parts = [`${d.getMonth() + 1}/${d.getDate()}`, `星期${wd}`]
  if (props.classroomName) parts.push(props.classroomName)
  return parts.join(' · ')
})

// ---- 孩子近期照片：隨機輪播；無資料/失敗一律降級，不擋頁面其他區塊 ----
interface PhotoItem {
  id: number | string
  thumb_url?: string
  url?: string
}

const photos = ref<PhotoItem[]>([])
const photoIdx = ref(0)
let rotateTimer: ReturnType<typeof setInterval> | null = null

function stopRotate(): void {
  if (rotateTimer) {
    clearInterval(rotateTimer)
    rotateTimer = null
  }
}

function pickDifferentIndex(current: number, length: number): number {
  if (length < 2) return current
  let next = current
  while (next === current) next = Math.floor(Math.random() * length)
  return next
}

function startRotate(): void {
  stopRotate()
  if (photos.value.length < 2) return
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  rotateTimer = setInterval(() => {
    photoIdx.value = pickDifferentIndex(photoIdx.value, photos.value.length)
  }, 4000)
}

function cyclePhoto(): void {
  photoIdx.value = pickDifferentIndex(photoIdx.value, photos.value.length)
}

async function loadPhotos(studentId: number | null): Promise<void> {
  photos.value = []
  photoIdx.value = 0
  if (!studentId) return
  try {
    const res = await fetchChildPhotos(studentId, { limit: 6 })
    const items = (res.data.items || []) as PhotoItem[] // TODO(ts-strict): waiting on backend response_model
    photos.value = items.filter((p) => p.thumb_url || p.url)
  } catch {
    photos.value = [] // 讀取失敗降級成預設頭像，不擋首頁其他區塊
  }
}

watch(
  () => props.studentId,
  async (sid) => {
    stopRotate()
    await loadPhotos(sid)
    startRotate()
  },
  { immediate: true },
)

onBeforeUnmount(() => stopRotate())

const currentPhotoUrl = computed(() => {
  const p = photos.value[photoIdx.value]
  return p ? p.thumb_url || p.url || '' : ''
})
</script>

<template>
  <section class="hh-head">
    <div class="hh-top">
      <div class="hh-greet-chip">
        <GreetingMoonIllustration v-if="isEvening" class="hh-greet-art" />
        <GreetingSunIllustration v-else class="hh-greet-art" />
        <span class="hh-greet-text">{{ greetingText }}</span>
      </div>

      <button
        type="button"
        class="hh-photo"
        :disabled="photos.length < 2"
        :aria-label="photos.length > 1 ? `${name}的近期照片，點擊看下一張` : `${name}的照片`"
        @click="cyclePhoto"
      >
        <span class="hh-photo-frame">
          <img v-if="currentPhotoUrl" :src="currentPhotoUrl" alt="" class="hh-photo-img" />
          <span v-else class="material-symbols-rounded hh-photo-fallback" aria-hidden="true">child_care</span>
        </span>
        <span v-if="photos.length > 1" class="hh-photo-dots" aria-hidden="true">
          <span
            v-for="(p, i) in photos"
            :key="p.id"
            class="hh-dot"
            :class="{ 'is-active': i === photoIdx }"
          />
        </span>
      </button>
    </div>

    <h2 class="hh-name">{{ name }}</h2>
    <p class="hh-meta">{{ dateMeta }}</p>
  </section>
</template>

<style scoped>
.hh-head { padding: var(--space-6, 24px) var(--space-4, 16px) 0; display: flex; flex-direction: column; gap: 10px; }
.hh-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.hh-greet-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px 6px 6px;
  border-radius: 999px;
  background: var(--m3-surface-container-low, #f3f4ef);
  box-shadow: var(--pt-shadow-card);
}
.hh-greet-art { width: 34px; height: auto; flex-shrink: 0; }
.hh-greet-text { font-size: var(--text-sm, 13px); font-weight: 700; color: var(--pt-text-strong); }

.hh-photo { display: flex; flex-direction: column; align-items: center; gap: 6px; border: none; background: transparent; padding: 0; cursor: pointer; }
.hh-photo:disabled { cursor: default; }
.hh-photo-frame {
  position: relative;
  width: 56px; height: 56px;
  border-radius: 50%;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: var(--pt-accent-leaf-container, #d8f1de);
  color: var(--pt-accent-leaf-on, #1c5232);
  box-shadow: 0 0 0 3px var(--pt-app-bg, #f7f6ef), var(--pt-shadow-card);
}
.hh-photo-img { width: 100%; height: 100%; object-fit: cover; }
.hh-photo-fallback { font-size: 28px; }
.hh-photo-dots { display: flex; gap: 4px; }
.hh-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--pt-border-strong, #c0c9bf); transition: background-color 160ms ease, transform 160ms ease; }
.hh-dot.is-active { background: var(--brand-primary, #0d9053); transform: scale(1.25); }

.hh-name { margin: 2px 0 0; font-size: 24px; font-weight: 900; color: var(--pt-text-strong); line-height: 1.15; }
.hh-meta { margin: 0; font-size: var(--text-sm, 13px); font-weight: 600; color: var(--pt-text-muted); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  .hh-dot { transition: none; }
}
</style>
