<script setup>
import { onMounted, ref, watch } from 'vue'
import { fetchChildMilestones, reactToMilestone } from '../api/childMilestones'
import MilestoneCard from './MilestoneCard.vue'

const props = defineProps({
  studentId: { type: Number, required: true },
})

const milestones = ref([])
const loading = ref(false)

async function load() {
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

async function onReact(milestone, reaction) {
  try {
    const r = await reactToMilestone(props.studentId, milestone.id, reaction)
    const idx = milestones.value.findIndex((m) => m.id === milestone.id)
    if (idx >= 0) milestones.value[idx] = r.data
  } catch {
    // silent fail (UI keeps old state)
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
.loading, .empty { padding: 24px; color: #9ca3af; text-align: center; font-size: 14px; }
</style>
