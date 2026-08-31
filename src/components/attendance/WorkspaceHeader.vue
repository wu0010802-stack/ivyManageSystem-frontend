<template>
  <div class="workspace-header">
    <div class="workspace-header__nav">
      <el-button aria-label="上個月" :icon="ArrowLeft" circle size="small" @click="prevMonth" />
      <el-select
        :model-value="year"
        style="width: 100px"
        aria-label="年份"
        @update:model-value="(v: number) => emit('update:year', Number(v))"
      >
        <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
      </el-select>
      <el-select
        :model-value="month"
        style="width: 90px"
        aria-label="月份"
        @update:model-value="(v: number) => emit('update:month', Number(v))"
      >
        <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
      </el-select>
      <el-button aria-label="下個月" :icon="ArrowRight" circle size="small" @click="nextMonth" />
    </div>

    <div class="workspace-header__kpis">
      <!-- P1-3：語意=已有紀錄且無異常；expected workdays 未定義前不稱「全勤」 -->
      <el-statistic title="已有紀錄且無異常" :value="kpis.fullAttendance" />
      <el-statistic title="遲到人次" :value="kpis.lateCount" />
      <el-statistic title="缺卡人次" :value="kpis.missingCount" />
      <el-statistic
        title="待處理異常"
        :value="kpis.pendingAnomalies"
        :value-style="kpis.pendingAnomalies > 0 ? { color: 'var(--el-color-danger)' } : undefined"
      />
    </div>

    <div class="workspace-header__actions">
      <el-button :icon="Monitor" @click="openKiosk">電子打卡</el-button>
      <el-button v-if="canWrite" @click="emit('import')">匯入</el-button>
      <el-button type="primary" @click="emit('export')">匯出月報</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Monitor } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

interface Kpis {
  fullAttendance: number
  lateCount: number
  missingCount: number
  pendingAnomalies: number
}

const props = defineProps<{
  year: number
  month: number
  kpis: Kpis
}>()

const emit = defineEmits<{
  (e: 'update:year', v: number): void
  (e: 'update:month', v: number): void
  (e: 'import'): void
  (e: 'export'): void
}>()

const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))

const router = useRouter()

// 電子打卡台為免登入、全屏、無側邊導航的獨立 kiosk 頁；新分頁開啟以免中斷後台操作
function openKiosk() {
  window.open(router.resolve({ name: 'kiosk-punch' }).href, '_blank')
}

const now = new Date()
const yearOptions = computed(() => {
  const base = props.year || now.getFullYear()
  return [base - 2, base - 1, base, base + 1, base + 2]
})

function prevMonth() {
  if (props.month === 1) {
    emit('update:year', props.year - 1)
    emit('update:month', 12)
  } else {
    emit('update:month', props.month - 1)
  }
}

function nextMonth() {
  if (props.month === 12) {
    emit('update:year', props.year + 1)
    emit('update:month', 1)
  } else {
    emit('update:month', props.month + 1)
  }
}
</script>

<style scoped>
.workspace-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-color);
}

.workspace-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.workspace-header__kpis {
  display: flex;
  gap: var(--space-6);
  flex: 1;
  justify-content: center;
}

.workspace-header__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}
</style>
