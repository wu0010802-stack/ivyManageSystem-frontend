<template>
  <div class="data-quality-view">
    <header class="header">
      <h2>資料品質報告</h2>
      <div class="counters">
        <el-tag type="danger">P0: {{ counts.P0 }}</el-tag>
        <el-tag type="warning">P1: {{ counts.P1 }}</el-tag>
        <el-tag type="info">P2: {{ counts.P2 }}</el-tag>
      </div>
      <el-button
        v-if="canWrite"
        type="primary"
        :loading="running"
        @click="onRunNow"
      >
        立即執行
      </el-button>
    </header>

    <div class="filters">
      <el-select
        v-model="filters.status"
        data-testid="status-filter"
        placeholder="狀態"
        clearable
        @change="reload"
      >
        <el-option label="開啟" value="open" />
        <el-option label="已確認" value="ack" />
        <el-option label="已修正" value="fixed" />
        <el-option label="忽略" value="ignored" />
      </el-select>

      <el-select
        v-model="filters.severity"
        placeholder="嚴重度"
        clearable
        @change="reload"
      >
        <el-option label="P0" value="P0" />
        <el-option label="P1" value="P1" />
        <el-option label="P2" value="P2" />
      </el-select>
    </div>

    <el-table :data="rows" v-loading="loading">
      <el-table-column label="時間" prop="detected_at" width="170" />
      <el-table-column label="嚴重度" prop="severity" width="80" />
      <el-table-column label="規則" prop="rule_code" />
      <el-table-column label="實體" width="150">
        <template #default="{ row }">
          {{ row.entity_type }} #{{ row.entity_id }}
        </template>
      </el-table-column>
      <el-table-column label="摘要" prop="summary" />
      <el-table-column label="狀態" prop="status" width="100" />
      <el-table-column v-if="canWrite" label="操作" width="240">
        <template #default="{ row }">
          <el-button v-if="row.status === 'open'" size="small" @click="onAck(row)">確認</el-button>
          <el-button v-if="row.status !== 'fixed'" size="small" type="success" @click="onResolve(row)">修正</el-button>
          <el-button v-if="row.status === 'open'" size="small" type="info" @click="onIgnore(row)">忽略</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="filters.page"
      v-model:page-size="filters.page_size"
      :total="total"
      :page-sizes="[20, 50, 100]"
      @current-change="reload"
      @size-change="reload"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  ackReport,
  ignoreReport,
  listReports,
  resolveReport,
  runNow,
} from '@/api/dataQuality'
import { hasPermission } from '@/utils/auth'

interface Filters {
  status: string
  severity: '' | 'P0' | 'P1' | 'P2'
  rule_code: string
  page: number
  page_size: number
}

const filters = reactive<Filters>({
  status: 'open',
  severity: '',
  rule_code: '',
  page: 1,
  page_size: 20,
})

interface ReportRow {
  id: number
  rule_code: string
  severity: 'P0' | 'P1' | 'P2'
  entity_type: string
  entity_id: string
  summary: string
  status: string
  detected_at: string
}

const rows = ref<ReportRow[]>([])
const total = ref(0)
const loading = ref(false)
const running = ref(false)

const canWrite = computed(() => hasPermission('DATA_QUALITY_WRITE'))

const counts = computed(() => {
  const c: Record<'P0' | 'P1' | 'P2', number> = { P0: 0, P1: 0, P2: 0 }
  rows.value.forEach((r) => {
    if (r.status === 'open' && c[r.severity] !== undefined) c[r.severity]++
  })
  return c
})

async function reload() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: filters.page,
      page_size: filters.page_size,
    }
    if (filters.status) params.status = filters.status
    if (filters.severity) params.severity = filters.severity
    if (filters.rule_code) params.rule_code = filters.rule_code
    const { data } = await listReports(params as never)
    const body = data as { items?: ReportRow[]; total?: number }
    rows.value = body.items || []
    total.value = body.total || 0
  } finally {
    loading.value = false
  }
}

async function onRunNow() {
  running.value = true
  try {
    const { data } = await runNow()
    const body = data as { detected?: number; new_open?: number }
    ElMessage.success(`已執行：偵測 ${body.detected ?? 0} 條，新開 ${body.new_open ?? 0} 條`)
    await reload()
  } finally {
    running.value = false
  }
}

async function _promptNote(title: string): Promise<string | null> {
  try {
    const res = await ElMessageBox.prompt(title, '備註', {
      confirmButtonText: '確定',
      cancelButtonText: '取消',
    })
    return (res as { value?: string }).value ?? ''
  } catch {
    return null
  }
}

async function onAck(row: ReportRow) {
  const note = await _promptNote('確認此條違規')
  if (note === null) return
  await ackReport(row.id, { note })
  await reload()
}

async function onResolve(row: ReportRow) {
  const note = await _promptNote('修正說明（必填）')
  if (!note) return
  await resolveReport(row.id, { note })
  await reload()
}

async function onIgnore(row: ReportRow) {
  const note = await _promptNote('忽略原因（必填）')
  if (!note) return
  await ignoreReport(row.id, { note })
  await reload()
}

onMounted(reload)
</script>

<style scoped>
.data-quality-view {
  padding: 16px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.counters {
  display: flex;
  gap: 8px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
