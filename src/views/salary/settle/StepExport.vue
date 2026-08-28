<template>
  <div>
    <el-alert
      v-if="settlement.status.value !== 'finalized'"
      type="warning"
      :closable="false"
      class="export-mb"
      :title="`尚有 ${unfinalizedCount} 筆未封存，轉帳名冊僅會包含已封存的紀錄`"
    />

    <el-card shadow="never" class="no-hover export-card">
      <h4 class="export-title">轉帳名冊（xlsx，僅含已封存紀錄）</h4>
      <div class="export-buttons">
        <el-button
          v-for="(label, type) in ROSTER_TYPE_LABELS"
          :key="type"
          type="primary"
          plain
          :loading="rosterLoading === type"
          :disabled="!canExportFullSalary || (rosterLoading !== null && rosterLoading !== type)"
          @click="exportRoster(type)"
        >
          {{ label }}名冊
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="no-hover export-card">
      <h4 class="export-title">薪資總表與快照</h4>
      <div class="export-buttons">
        <el-button :loading="excelLoading" :disabled="!canExportFullSalary" @click="exportAllExcel">匯出全部 Excel</el-button>
        <el-button :loading="pdfLoading" :disabled="!canExportFullSalary" @click="exportAllPdf">匯出全部 PDF</el-button>
        <el-button @click="showSnapshotDialog = true">月底快照</el-button>
      </div>
    </el-card>

    <el-result
      v-if="settlement.status.value === 'finalized' && hasExported"
      icon="success"
      title="本月結薪完成 ✓"
      :sub-title="`${q.year} 年 ${q.month} 月已全數封存並匯出轉帳名冊`"
    >
      <template #extra>
        <el-button type="primary" @click="$router.push('/salary')">回薪資管理</el-button>
      </template>
    </el-result>

    <SalarySnapshotDialog
      v-model="showSnapshotDialog"
      :year="q.year"
      :month="q.month"
      :can-write="canWriteSalary"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import SalarySnapshotDialog from '../SalarySnapshotDialog.vue'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { downloadFile } from '@/utils/download'
import type { SalarySettlement } from '@/composables/useSalarySettlement'

defineEmits<{ (e: 'next'): void }>()

const settlement = inject<SalarySettlement>('settlement')!
const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))
const canExportFullSalary = computed(
    () => hasPermission('SALARY_READ') && hasFullSalaryView(),
)
const unfinalizedCount = computed(
    () => settlement.records.value.length - settlement.finalizedCount.value,
)

const ROSTER_TYPE_LABELS = {
    base: '薪資本薪',
    festival: '節慶獎金',
    surplus: '超額獎金',
    art_teacher: '才藝老師',
} as const

const hasExported = ref(false)
const showSnapshotDialog = ref(false)

// 重型匯出（薪資全員 Excel/PDF、逐筆轉帳名冊）慢且原本無回饋，易誤判沒點到而重複點擊。
// 改 await + per-action loading：按鈕顯示忙碌、進行中防重送（並發另有 api dedupe 兜底）。
const rosterLoading = ref<keyof typeof ROSTER_TYPE_LABELS | null>(null)
const excelLoading = ref(false)
const pdfLoading = ref(false)

const exportRoster = async (type: keyof typeof ROSTER_TYPE_LABELS) => {
    if (!canExportFullSalary.value || rosterLoading.value) return
    rosterLoading.value = type
    const label = ROSTER_TYPE_LABELS[type]
    const filename = `${q.year}年${String(q.month).padStart(2, '0')}月_${label}轉帳名冊.xlsx`
    try {
        // 只有下載真的成功才標記完成；downloadFile 內部吞錯後仍 resolve，
        // 不可把「沒 throw」當成功，否則匯出失敗仍誤顯「本月結薪完成」。
        const ok = await downloadFile(`/salaries/${q.year}/${q.month}/transfer-roster?type=${type}`, filename)
        if (ok) hasExported.value = true
    } finally {
        rosterLoading.value = null
    }
}

const exportAllExcel = async () => {
    if (!canExportFullSalary.value || excelLoading.value) return
    excelLoading.value = true
    try {
        await downloadFile(
            `/salaries/export-all?year=${q.year}&month=${q.month}&format=xlsx`,
            `${q.year}年${q.month}月薪資總表.xlsx`,
        )
    } finally {
        excelLoading.value = false
    }
}

const exportAllPdf = async () => {
    if (!canExportFullSalary.value || pdfLoading.value) return
    pdfLoading.value = true
    try {
        await downloadFile(
            `/salaries/export-all?year=${q.year}&month=${q.month}&format=pdf`,
            `${q.year}年${q.month}月薪資總表.pdf`,
        )
    } finally {
        pdfLoading.value = false
    }
}
</script>

<style scoped>
.export-mb {
  margin-bottom: var(--space-4);
}

.export-card {
  margin-bottom: var(--space-4);
}

.export-title {
  margin: 0 0 var(--space-3);
}

.export-buttons {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
</style>
