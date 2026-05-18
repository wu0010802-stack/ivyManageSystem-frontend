<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { fetchChildMilestones, reactToMilestone } from '../api/childMilestones'
import { toast } from '../utils/toast'
import MilestoneCard from './MilestoneCard.vue'

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

onMounted(load)
watch(() => props.studentId, load)
</script>

<template>
  <div v-if="loading" class="loading">載入中…</div>
  <div v-else-if="milestones.length === 0" class="empty">尚無里程碑</div>
  <div v-else class="carousel">
    <MilestoneCard
      v-for="m in milestones"
      :key="m.id"
      :milestone="m"
      @react="(reaction) => onReact(m, reaction)"
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
.loading, .empty { padding: 24px; color: var(--text-tertiary); text-align: center; font-size: 14px; }
</style>
