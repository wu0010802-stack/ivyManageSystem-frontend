<template>
  <div class="attendance-workspace">
    <WorkspaceHeader
      :year="query.year"
      :month="query.month"
      :kpis="kpis"
      @update:year="(v) => { query.year = v }"
      @update:month="(v) => { query.month = v }"
      @import="onImport"
      @export="onExport"
    />

    <!-- 桌機三欄 -->
    <div v-if="isDesktop" class="workspace-cols">
      <div class="col-roster">
        <!-- FE-3: 名冊 -->
      </div>
      <div class="col-anomaly">
        <!-- FE-4/5: 異常佇列 -->
      </div>
      <div class="col-detail">
        <!-- FE-6: 明細 -->
      </div>
    </div>

    <!-- 行動三 tab -->
    <el-tabs v-else class="workspace-tabs">
      <el-tab-pane label="名冊">
        <div class="col-roster"><!-- FE-3 --></div>
      </el-tab-pane>
      <el-tab-pane label="異常">
        <div class="col-anomaly"><!-- FE-4/5 --></div>
      </el-tab-pane>
      <el-tab-pane label="明細">
        <div class="col-detail"><!-- FE-6 --></div>
      </el-tab-pane>
    </el-tabs>

    <!-- TODO FE-7: 匯入 dialog（importOpen 控制） -->
  </div>
</template>

<script setup lang="ts">
import { reactive, toRef, onMounted, provide, computed } from 'vue'
import { useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'
import { useIsMobile } from '@/composables/useIsMobile'
import { downloadFile } from '@/utils/download'
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'

const now = new Date()
const query = reactive({ year: now.getFullYear(), month: now.getMonth() + 1 })

const ws = useAttendanceWorkspace(toRef(query, 'year'), toRef(query, 'month'))
const kpis = computed(() => ws.kpis.value)

const { isMobile } = useIsMobile()
const isDesktop = computed(() => !isMobile.value)

onMounted(() => ws.refresh())

provide('attendanceWs', ws)

// TODO FE-7: 匯入 dialog
// const importOpen = ref(false)
function onImport() {
  // TODO FE-7
}

async function onExport() {
  await downloadFile(
    `/exports/attendance?year=${query.year}&month=${query.month}`,
    `考勤月報_${query.year}_${String(query.month).padStart(2, '0')}.xlsx`,
  )
}
</script>

<style scoped>
.attendance-workspace {
  padding: var(--space-4);
}

.workspace-cols {
  display: grid;
  grid-template-columns: 240px 280px 1fr;
  gap: var(--space-3);
  align-items: start;
}

.col-roster,
.col-anomaly,
.col-detail {
  min-height: 200px;
}

.workspace-tabs {
  margin-top: var(--space-3);
}
</style>
