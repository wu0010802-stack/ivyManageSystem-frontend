<script setup lang="ts">
/**
 * 首頁頂部問候列：logo＋今天日期＋早安／午安／晚安插畫＋公告鈴鐺。
 *
 * 2026-10-08 首頁改版（方向 A＋C）：孩子的近照、姓名、班級移到每張孩子
 * 狀態卡（ChildTodayCard）上，多寶家庭不必切換就能看到每個孩子——這裡只留
 * 「今天是哪天、早安、有沒有新公告」這種全家共用的資訊。照片輪播隨之退場
 * （狀態卡頭像改取最新一張）。
 *
 * 歷史：2026-08-16 hero 改為孩子照片＋姓名為主；2026-08-17 頂部 sticky bar
 * 移除後 logo 併入問候列（見 ParentLayout.vue isHomeRoute 分支）；2026-09-08
 * 右上角加通知鈴鐺（unreadAnnouncements > 0 時掛紅點），點擊 emit
 * `open-announcements` 交給父層導頁——本元件不直接依賴 vue-router。天氣本身
 * 仍無資料來源，只顯示問候語與太陽／月亮插畫。
 */
import { computed, ref } from 'vue'
import GreetingSunIllustration from '../illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '../illustrations/GreetingMoonIllustration.vue'
import BrandMark from '@/components/brand/BrandMark.vue'

withDefaults(defineProps<{
  unreadAnnouncements?: number
}>(), {
  unreadAnnouncements: 0,
})

const emit = defineEmits<{
  'open-announcements': []
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

/** 「M/D 星期X」；星期一律用中文全形字，不用英文縮寫（沿用既有決策）。 */
const dateMeta = computed(() => {
  const d = new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()} 星期${wd}`
})
</script>

<template>
  <header class="hh-head">
    <BrandMark variant="mini" :size="32" class="hh-logo" />
    <div class="hh-copy">
      <p class="hh-meta">{{ dateMeta }}</p>
      <h1 class="hh-greet">{{ greetingText }}</h1>
    </div>
    <GreetingMoonIllustration v-if="isEvening" class="hh-art" />
    <GreetingSunIllustration v-else class="hh-art" />
    <button
      type="button"
      class="hh-bell"
      data-testid="hh-bell"
      aria-label="校園公告通知"
      @click="emit('open-announcements')"
    >
      <span class="material-symbols-rounded" aria-hidden="true">notifications</span>
      <span v-if="unreadAnnouncements > 0" class="hh-bell-dot" data-testid="hh-bell-dot" aria-hidden="true" />
    </button>
  </header>
</template>

<style scoped>
.hh-head {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-5, 20px) var(--space-4, 16px) 0;
}
.hh-logo { flex-shrink: 0; }
.hh-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.hh-meta {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.hh-greet { margin: 0; font-size: 24px; font-weight: 900; line-height: 1.15; }
.hh-art { width: 52px; height: auto; flex-shrink: 0; }

.hh-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--m3-surface-container-low, #f3f4ef);
  color: var(--pt-text-strong);
  box-shadow: var(--pt-shadow-card);
  cursor: pointer;
}
.hh-bell .material-symbols-rounded { font-size: 22px; }
.hh-bell-dot {
  position: absolute;
  top: 8px;
  right: 9px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral-500, #ff8b8b);
  box-shadow: 0 0 0 2px var(--m3-surface-container-low, #f3f4ef);
}
</style>
