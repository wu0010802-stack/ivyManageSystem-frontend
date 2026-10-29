<template>
  <!-- /attendance（出勤核對）的路由入口。route props（tab／view／date／emp／filter／scope）宣告在
       attendanceRouteProps.attendancePageProps，經 attrs 透傳給 ScheduleAttendanceView。
       為什麼要有這層：/attendance 與 /schedule 共用同一個大元件，RouterView 在兩條路由之間導覽時
       若元件型別相同會「重用實例、只換 props」，而該元件的頁籤清單與權限在 setup 時決定；
       各自一層薄殼讓兩條路由是不同元件型別，切頁一定重新掛載。 -->
  <ScheduleAttendanceView />
</template>

<script setup lang="ts">
import ScheduleAttendanceView from './ScheduleAttendanceView.vue'

defineOptions({ name: 'AttendanceReconcilePage' })
</script>
