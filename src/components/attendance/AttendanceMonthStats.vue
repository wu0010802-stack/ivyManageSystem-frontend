<template>
  <section class="month-stats" aria-label="本月出勤統計">
    <div v-if="!displayState || displayState === 'ready' || displayState === 'stale'" class="month-stats__kpis">
      <!-- P1-3：語意=已有紀錄且無異常；expected workdays 未定義前不稱「全勤」 -->
      <el-statistic title="已有紀錄且無異常" :value="kpis.fullAttendance" />
      <el-statistic title="遲到人次" :value="kpis.lateCount" />
      <el-statistic title="缺卡人次" :value="kpis.missingCount" />
      <el-statistic
        title="待處理遲到／早退／缺卡"
        :value="kpis.pendingAnomalies"
        :value-style="kpis.pendingAnomalies > 0 ? { color: 'var(--el-color-danger)' } : undefined"
      />
    </div>
    <p v-else role="status">{{ displayState === 'loading' ? '出勤統計載入中…' : '出勤統計尚未載入成功' }}</p>
    <p v-if="displayState === 'stale'" class="month-stats__scope" role="status">統計為此月份上次成功載入的資料，尚未更新。</p>
    <p class="month-stats__scope">統計來自已匯入的出勤紀錄（遲到、缺卡以次數計，待處理以一人一天一筆計）；0 筆異常不代表打卡資料已齊全。</p>
  </section>
</template>

<script setup lang="ts">
/**
 * 出勤明細頁籤頂端的本月統計。
 *
 * 資料來自 /attendance/summary 與 /attendance/anomalies（已寫入的出勤紀錄），單位與班表核對的
 * 「待處理格」不同，所以只放在出勤明細，不和格子的待處理數並列。
 */
export interface AttendanceKpis {
  fullAttendance: number
  lateCount: number
  missingCount: number
  pendingAnomalies: number
}

defineProps<{
  kpis: AttendanceKpis
  displayState?: 'ready' | 'loading' | 'unavailable' | 'stale'
}>()
</script>

<style scoped>
.month-stats { display: grid; gap: var(--space-2); margin-bottom: var(--space-4); }
.month-stats p { margin: 0; }
.month-stats__kpis { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-8); }
.month-stats__scope { color: var(--el-text-color-secondary); font-size: var(--text-sm); }

@media (--to-sm) {
  .month-stats__kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-4); }
}
</style>
