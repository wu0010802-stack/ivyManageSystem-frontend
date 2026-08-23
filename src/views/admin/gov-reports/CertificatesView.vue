<template>
  <div class="page">
    <PageHeader
      :title="PAGE_TERMS.govCertificates"
      subtitle="查詢已開立的在學證明；開立入口在學生資料頁"
    >
      <template #actions>
        <el-button v-if="canBatchIssue" type="primary" @click="batchDialogVisible = true">
          批次開立
        </el-button>
      </template>
      <template #filters>
        <el-form :model="filters" inline @submit.prevent="load">
          <el-form-item label="學生">
            <el-select
              v-model="filters.student_id"
              filterable
              clearable
              placeholder="全部學生"
              style="width: 200px"
            >
              <el-option
                v-for="s in students"
                :key="s.id"
                :label="s.name"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="開立期間">
            <el-date-picker
              v-model="filters.range"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="起日"
              end-placeholder="迄日"
            />
          </el-form-item>
          <el-button type="primary" @click="load">查詢</el-button>
        </el-form>
      </template>
    </PageHeader>

    <el-table :data="rows" v-loading="loading">
      <template #empty>
        <el-empty description="查無開立紀錄" />
      </template>
      <el-table-column prop="serial" label="字號" min-width="140" />
      <el-table-column label="學生" min-width="120">
        <template #default="{ row }">{{ studentName(row.student_id) }}</template>
      </el-table-column>
      <el-table-column prop="issue_date" label="開立日期" width="120" />
      <el-table-column prop="purpose" label="用途" min-width="160" />
      <el-table-column prop="copies" label="份數" width="80" />
    </el-table>

    <p v-if="rows.length >= HISTORY_LIMIT" class="limit-hint">
      後端單次最多回傳 {{ HISTORY_LIMIT }} 筆，請縮小期間範圍以查看更早的紀錄。
    </p>

    <CertificateBatchDialog v-model="batchDialogVisible" @generated="load" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

import { listCertificateHistory } from '@/api/govMoe'
import { getStudents } from '@/api/students'
import PageHeader from '@/components/common/PageHeader.vue'
import CertificateBatchDialog from '@/components/gov-reports/CertificateBatchDialog.vue'
import { getErrorMessage } from '@/utils/errorHandler'
import { hasPermission } from '@/utils/auth'
import { PAGE_TERMS } from '@/constants/moduleTerms'

// 比照單筆開立入口 StudentEnrollmentCertButton 的權限守衛
const canBatchIssue = computed(() => hasPermission('GOV_REPORTS_EXPORT'))
const batchDialogVisible = ref(false)

// 後端 list_history 以 .limit(200) 截斷且無分頁，達上限時需提示使用者縮小範圍
const HISTORY_LIMIT = 200
// /students 預設 limit=50、上限 500；不帶會只拿到前 50 位，姓名對照表因此缺人
const STUDENT_FETCH_LIMIT = 500

const filters = ref<{ student_id: number | null; range: string[] }>({
  student_id: null,
  range: [],
})
const rows = ref<{ student_id: number }[]>([])
const students = ref<{ id: number; name: string }[]>([])
const loading = ref(false)

// 後端 CertificateOut 只回 student_id，姓名靠前端對照表補上
const studentName = (id: number) =>
  students.value.find((s) => s.id === id)?.name ?? `#${id}`

async function loadStudents() {
  try {
    const { data } = await getStudents({ limit: STUDENT_FETCH_LIMIT })
    students.value = (data.items ?? []) as { id: number; name: string }[]
  } catch {
    // 對照表失敗只影響姓名顯示（退回 #ID），不阻斷主要查詢
    students.value = []
  }
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, string | number> = {}
    if (filters.value.student_id) params.student_id = filters.value.student_id
    if (filters.value.range?.[0]) params.since = filters.value.range[0]
    if (filters.value.range?.[1]) params.until = filters.value.range[1]
    const { data } = await listCertificateHistory(params)
    rows.value = data
  } catch (err: unknown) {
    rows.value = []
    ElMessage.error(getErrorMessage(err, '查詢開立紀錄失敗'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStudents()
  load()
})
</script>

<style scoped>
.page { padding: 16px; }
.limit-hint {
  margin-top: 12px;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}
</style>
