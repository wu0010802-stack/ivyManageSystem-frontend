<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import { todayTaipeiISO } from '@/utils/format'
const AttendanceWorkspaceView = defineAsyncComponent(() => import('./AttendanceWorkspaceView.vue'))
const ScheduleView = defineAsyncComponent(() => import('../ScheduleView.vue'))
const route = useRoute()
const router = useRouter()
const canAttendance = computed(() => hasPermission('ATTENDANCE_READ'))
const canSchedule = computed(() => hasPermission('SCHEDULE'))
const showSchedule = computed(() => canSchedule.value && (route.path === '/schedule' || !canAttendance.value))
const selectedDate = computed(() => {
  const value = route.query.date
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)) ? value : todayTaipeiISO()
})
function open(path: string) { void router.push({ path, query: { ...route.query, date: selectedDate.value } }) }
function updateDate(date: string) { if (date !== selectedDate.value) void router.replace({ query: { ...route.query, date } }) }
function openReconciliation(date: string) { void router.push({ path: '/attendance', query: { ...route.query, date } }) }
</script>

<template>
  <section class="attendance-hub" aria-label="排班與出勤">
    <nav class="attendance-hub__tabs" aria-label="排班與出勤檢視">
      <button v-if="canAttendance" type="button" :aria-current="!showSchedule ? 'page' : undefined" @click="open('/attendance')">出勤核對</button>
      <button v-if="canSchedule" type="button" :aria-current="showSchedule ? 'page' : undefined" @click="open('/schedule')">班表</button>
    </nav>
    <ScheduleView v-if="showSchedule" :initial-date="selectedDate" @date-change="updateDate" @reconcile="openReconciliation" />
    <AttendanceWorkspaceView v-else-if="canAttendance" :initial-date="selectedDate" :default-reconcile="canSchedule" @date-change="updateDate" />
    <p v-else role="status">目前沒有排班或出勤檢視權限。</p>
  </section>
</template>

<style scoped>
.attendance-hub__tabs { display: flex; gap: var(--space-2); padding: var(--space-3) var(--space-4) 0; border-bottom: 1px solid var(--el-border-color-light); }
.attendance-hub__tabs button { min-height: var(--touch-target-min); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--el-text-color-regular); padding: var(--space-2) var(--space-4); cursor: pointer; font: inherit; }
.attendance-hub__tabs button[aria-current] { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; }
.attendance-hub__tabs button:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
</style>
