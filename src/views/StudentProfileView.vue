<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { rosterReturnLocation } from '@/utils/studentRosterNavigation'
import StudentDetailPanel from '@/components/student/StudentDetailPanel.vue'

const route = useRoute()

const studentId = computed(() => Number(route.params.id))
const fromContext = computed(() => String(route.query.from || ''))
const fromClassroomId = computed(() => {
  const v = Number(route.query.classroom_id)
  return Number.isFinite(v) ? v : null
})
const initialTab = computed(() => String(route.query.tab || ''))
</script>

<template>
  <div>
    <router-link v-if="fromContext === 'roster'" :to="rosterReturnLocation(route.query)" class="roster-return">‹ 返回學生名冊</router-link>
    <StudentDetailPanel
    :key="studentId"
    :student-id="studentId"
    mode="page"
    context="students"
    :initial-tab="initialTab"
    :from-context="fromContext"
    :from-classroom-id="fromClassroomId"
    />
  </div>
</template>

<style scoped>
.roster-return { display: inline-flex; align-items: center; min-height: var(--touch-target-min); color: var(--el-color-primary); margin-bottom: var(--space-2); }
</style>
