<script setup>
import { onMounted, ref, watch } from 'vue'
import { fetchChildTimeline } from '../api/childTimeline'
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
    // 用 timeline endpoint 過濾 types=milestone（家長端 milestones 專用 endpoint 留 P4）
    const r = await fetchChildTimeline(props.studentId, { types: 'milestone', limit: 10 })
    milestones.value = r.data.items || []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.studentId, load)
</script>

<template>
  <div v-if="loading" class="loading">載入中…</div>
  <div v-else-if="milestones.length === 0" class="empty">尚無里程碑</div>
  <div v-else class="carousel">
    <MilestoneCard v-for="m in milestones" :key="m.id" :milestone="m" />
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
