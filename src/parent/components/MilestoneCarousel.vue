<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  acknowledgeMilestone,
  fetchChildMilestones,
  reactToMilestone,
} from '../api/childMilestones'
import { toast } from '../utils/toast'
import MilestoneCard from './MilestoneCard.vue'
import SkeletonBlock from './SkeletonBlock.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

interface MilestoneItem {
  id: number
  icon?: string
  title?: string
  achieved_on?: string
  occurred_at?: string
  summary?: string
  description?: string
  parent_reaction?: string | null
  [key: string]: unknown
}

const props = defineProps<{
  studentId: number
}>()

const milestones = ref<MilestoneItem[]>([])
const loading = ref<boolean>(false)

async function load(): Promise<void> {
  if (!props.studentId) {
    milestones.value = []
    return
  }
  loading.value = true
  try {
    const r = await fetchChildMilestones(props.studentId, { limit: 10 })
    milestones.value = r.data.items || []
  } finally {
    loading.value = false
  }
}

async function onReact(milestone: MilestoneItem, reaction: string): Promise<void> {
  try {
    const r = await reactToMilestone(props.studentId, milestone.id, reaction)
    const idx = milestones.value.findIndex((m) => m.id === milestone.id)
    if (idx >= 0) milestones.value[idx] = r.data as MilestoneItem
  } catch (e: unknown) {
    toast.error((e as { displayMessage?: string })?.displayMessage || '回應失敗，請重試')
  }
}

/**
 * 「我看到了」。後端是 first-ack-wins（同學生兩位家長並發也只寫一次），
 * 回傳最新的 milestone，直接以回傳值取代本地那筆即可。
 */
async function onAcknowledge(milestone: MilestoneItem): Promise<void> {
  try {
    const r = await acknowledgeMilestone(props.studentId, milestone.id)
    const idx = milestones.value.findIndex((m) => m.id === milestone.id)
    if (idx >= 0) milestones.value[idx] = r.data as MilestoneItem
  } catch (e: unknown) {
    toast.error((e as { displayMessage?: string })?.displayMessage || '確認失敗，請重試')
  }
}

onMounted(load)
watch(() => props.studentId, load)
</script>

<template>
  <SkeletonBlock v-if="loading" variant="row" :count="1" />
  <!--
    刻意不用共用的 @/components/common/EmptyState：它 import
    @element-plus/icons-vue，而本元件被 rollup 打包進 parent-app chunk，
    等於讓家長端 entry 靜態橋接 admin-core（實測 parent 首屏 gz
    227.9KB → 492.0KB，check-entry-chunks gate 直接擋下 build）。
    lazy route（如 ContactBookView）有自己的 chunk 所以用它沒問題。
  -->
  <div v-else-if="milestones.length === 0" class="empty">
    <KawaiiStar :size="32" decorative />
    <p class="empty-title">還沒有里程碑</p>
    <p class="empty-desc">老師記錄下孩子的成長時刻後會出現在這裡</p>
  </div>
  <div v-else class="carousel">
    <MilestoneCard
      v-for="m in milestones"
      :key="m.id"
      :milestone="m"
      @react="(reaction) => onReact(m, reaction)"
      @acknowledge="onAcknowledge(m)"
    />
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 4px 0 12px;
  -webkit-overflow-scrolling: touch;
}
.carousel > * { scroll-snap-align: start; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 16px;
  text-align: center;
  color: var(--pt-text-muted, #6b5e54);
}
.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--pt-text-strong, #392a1c);
}
.empty-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
</style>
