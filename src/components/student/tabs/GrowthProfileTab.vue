<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MilestonesTab from './MilestonesTab.vue'
import TimelineTab from './TimelineTab.vue'
import PhotoGalleryTab from './PhotoGalleryTab.vue'
import GrowthReportTab from './GrowthReportTab.vue'

const props = defineProps({
  studentId: { type: Number, required: true },
  syncUrl: { type: Boolean, default: true },
})

const SUB_TABS = [
  { name: 'milestones', label: '里程碑' },
  { name: 'timeline', label: '時間軸' },
  { name: 'photo_gallery', label: '照片牆' },
  { name: 'growth_report', label: '成長報告' },
]

const route = useRoute()
const router = useRouter()

const initial = String(route.query.sub || '')
const activeSub = ref(
  SUB_TABS.find((t) => t.name === initial)?.name || 'milestones',
)

watch(activeSub, (val) => {
  if (!props.syncUrl) return
  const currentQuery = route.query
  if (currentQuery.sub === val) return
  router.replace({ query: { ...currentQuery, sub: val } })
})

watch(
  () => route.query.sub,
  (val) => {
    const next = SUB_TABS.find((t) => t.name === val)
    if (next && next.name !== activeSub.value) activeSub.value = next.name
  },
)
</script>

<template>
  <div class="growth-profile-tab">
    <el-tabs v-model="activeSub" type="card" class="sub-tabs">
      <el-tab-pane
        v-for="t in SUB_TABS"
        :key="t.name"
        :label="t.label"
        :name="t.name"
        lazy
      >
        <MilestonesTab v-if="t.name === 'milestones'" :student-id="studentId" />
        <TimelineTab v-else-if="t.name === 'timeline'" :student-id="studentId" />
        <PhotoGalleryTab v-else-if="t.name === 'photo_gallery'" :student-id="studentId" />
        <GrowthReportTab v-else-if="t.name === 'growth_report'" :student-id="studentId" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.growth-profile-tab {
  display: flex;
  flex-direction: column;
}
.sub-tabs {
  margin-top: 4px;
}
</style>
