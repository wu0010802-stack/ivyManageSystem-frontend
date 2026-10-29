<template>
  <!-- /schedule（排班）的路由入口；理由同 AttendanceReconcilePage。
       route props（scope／tab／sub／date）宣告在 attendanceRouteProps.schedulePageProps。 -->
  <ScheduleAttendanceView />
</template>

<script setup lang="ts">
import ScheduleAttendanceView from './ScheduleAttendanceView.vue'

defineOptions({ name: 'SchedulePage' })
</script>
