<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
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
  <StudentDetailPanel
    :student-id="studentId"
    mode="page"
    context="students"
    :initial-tab="initialTab"
    :from-context="fromContext"
    :from-classroom-id="fromClassroomId"
  />
</template>
