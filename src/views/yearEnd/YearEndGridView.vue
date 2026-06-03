<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getYearEndGrid, buildSettlements, manualPatchSettlement } from '@/api/yearEnd'
import { money } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import api from '@/api/index'

// Derive row type from the typed API wrapper — no hand-written `any`.
type GridRow = Awaited<ReturnType<typeof getYearEndGrid>>['data'][number]

const SPECIAL_BONUS_LABELS: Record<string, string> = {
  APPRAISAL_HALF_BONUS_FIRST: '考核上',
  APPRAISAL_HALF_BONUS_SECOND: '考核下',
  SEMESTER_DIVIDEND_FIRST: '紅利上',
  SEMESTER_DIVIDEND_SECOND: '紅利下',
  AFTER_CLASS_AWARD: '才藝鼓勵',
  TEACHING_EXTRA: '教課獎勵',
  EXCESS_ENROLLMENT: '超額',
  FESTIVAL_DIFF: '節慶差額',
  CUSTOM: '其他',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SUPERVISOR_SIGNED: '主管已簽',
  ACCOUNTING_SIGNED: '會計已簽',
  FINALIZED: '已核定',
}

type ElTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

const STATUS_TAG_TYPE: Record<string, ElTagType> = {
  DRAFT: 'info',
  SUPERVISOR_SIGNED: 'warning',
  ACCOUNTING_SIGNED: 'primary',
  FINALIZED: 'success',
}

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const rows = ref<GridRow[]>([])
const loading = ref(false)

const canWrite = computed(() => hasPermission('YEAR_END_WRITE'))

// ---- 重新試算 dialog ----
const buildDialogVisible = ref(false)

// ---- 手改 dialog ----
const editVisible = ref(false)
const editingRow = ref<GridRow | null>(null)
const editForm = reactive({
  deduction_disciplinary: null as number | null,
  excess_amount: null as number | null,
  hire_months_override: null as number | null,
})

// ---- Derived columns ----
const bonusColumns = computed(() => {
  // Union all special_bonuses keys across rows, ordered by SPECIAL_BONUS_LABELS key order.
  const labelKeys = Object.keys(SPECIAL_BONUS_LABELS)
  const seenKeys = new Set<string>()
  for (const row of rows.value) {
    for (const k of Object.keys(row.special_bonuses)) {
      seenKeys.add(k)
    }
  }
  // Sort by label order first, then unknowns appended.
  const ordered = labelKeys.filter((k) => seenKeys.has(k))
  for (const k of seenKeys) {
    if (!ordered.includes(k)) ordered.push(k)
  }
  return ordered.map((key) => ({ key, label: SPECIAL_BONUS_LABELS[key] ?? key }))
})

const baseUrl = computed(() => api.defaults.baseURL || '/api')

async function loadGrid() {
  loading.value = true
  try {
    const res = await getYearEndGrid(cycleId)
    rows.value = res.data
  } catch {
    ElMessage.error('總表載入失敗')
  } finally {
    loading.value = false
  }
}

async function onBuild() {
  try {
    const res = await buildSettlements(cycleId, { included_resigned_employee_ids: [] })
    const { built, skipped_finalized, unmatched_count, fallback_classes } = res.data
    await loadGrid()
    ElMessage.success(`已試算 ${built} 筆，略過已簽 ${skipped_finalized} 筆`)
    // 附帶提醒：資料缺口（任一 > 0 才顯示）
    const gapParts: string[] = []
    if (unmatched_count > 0) {
      gapParts.push(`${unmatched_count} 筆才藝報名未配對班級，未計入鼓勵獎金`)
    }
    if (fallback_classes > 0) {
      gapParts.push(`${fallback_classes} 班學號未回填，沿用手填舊生率`)
    }
    if (gapParts.length > 0) {
      ElMessage.warning(gapParts.join('；'))
    }
  } catch {
    ElMessage.error('試算失敗')
  } finally {
    buildDialogVisible.value = false
  }
}

function openEdit(row: GridRow) {
  editingRow.value = row
  editForm.deduction_disciplinary = null
  editForm.excess_amount = null
  editForm.hire_months_override = null
  editVisible.value = true
}

async function submitEdit() {
  if (!editingRow.value) return
  const payload: {
    deduction_disciplinary?: number
    excess_amount?: number
    hire_months_override?: number
  } = {}
  if (editForm.deduction_disciplinary !== null) {
    payload.deduction_disciplinary = editForm.deduction_disciplinary
  }
  if (editForm.excess_amount !== null) {
    payload.excess_amount = editForm.excess_amount
  }
  if (editForm.hire_months_override !== null) {
    payload.hire_months_override = editForm.hire_months_override
  }
  try {
    await manualPatchSettlement(editingRow.value.settlement_id, payload)
    await loadGrid()
    ElMessage.success('已更新')
    editVisible.value = false
  } catch {
    ElMessage.error('更新失敗，請確認結算單狀態')
  }
}

function openDetail(row: GridRow) {
  router.push(`/year_end/cycles/${cycleId}/settlements/${row.settlement_id}`)
}

defineExpose({
  rows, loading, bonusColumns, canWrite,
  loadGrid, onBuild, openEdit, submitEdit,
  buildDialogVisible, editVisible, editingRow, editForm,
})

onMounted(loadGrid)
</script>

<template>
  <div class="year-end-grid-view">
    <!-- Top toolbar -->
    <header class="toolbar">
      <h2 class="title">年終總表（週期 {{ cycleId }}）</h2>
      <div class="actions">
        <el-button
          v-if="canWrite"
          type="primary"
          data-test="build-button"
          @click="buildDialogVisible = true"
        >
          ↻ 重新試算
        </el-button>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/summary.xlsx`"
          target="_blank"
          class="export-link"
        >
          <el-button>總表 Excel</el-button>
        </a>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/summary.pdf`"
          target="_blank"
          class="export-link"
        >
          <el-button>總表 PDF</el-button>
        </a>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/transfer_roster.xlsx`"
          target="_blank"
          class="export-link"
        >
          <el-button>轉帳名冊 Excel</el-button>
        </a>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/transfer_roster.pdf`"
          target="_blank"
          class="export-link"
        >
          <el-button>轉帳名冊 PDF</el-button>
        </a>
      </div>
    </header>

    <!-- Grid table -->
    <el-table
      v-loading="loading"
      :data="rows"
      border
      stripe
      max-height="640"
      data-test="grid-table"
    >
      <!-- 固定欄：姓名 -->
      <el-table-column
        prop="employee_name"
        label="姓名"
        width="120"
        fixed="left"
      />

      <!-- 主結算 -->
      <el-table-column label="主結算" width="120" align="right">
        <template #default="{ row }">
          {{ money(row.payable_amount) }}
        </template>
      </el-table-column>

      <!-- 動態獎金欄 -->
      <el-table-column
        v-for="col in bonusColumns"
        :key="col.key"
        :label="col.label"
        width="110"
        align="right"
        :class-name="col.key === 'EXCESS_ENROLLMENT' || col.key === 'CUSTOM' ? 'yellow-col' : ''"
      >
        <template #header>
          <span
            :class="col.key === 'EXCESS_ENROLLMENT' || col.key === 'CUSTOM' ? 'yellow-header' : ''"
          >{{ col.label }}</span>
        </template>
        <template #default="{ row }">
          <span
            :class="col.key === 'EXCESS_ENROLLMENT' || col.key === 'CUSTOM' ? 'yellow-cell' : ''"
          >
            {{ money(row.special_bonuses[col.key] ?? 0) }}
          </span>
        </template>
      </el-table-column>

      <!-- 合計 -->
      <el-table-column label="合計" width="130" align="right">
        <template #default="{ row }">
          <strong class="total-amount">{{ money(row.total_amount) }}</strong>
        </template>
      </el-table-column>

      <!-- 狀態 -->
      <el-table-column label="狀態" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG_TYPE[row.status] || 'info'" size="small">
            {{ STATUS_LABELS[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'DRAFT' && canWrite"
            size="small"
            data-test="edit-button"
            @click="openEdit(row)"
          >
            手改
          </el-button>
          <a
            :href="`${baseUrl}/year_end/cycles/${cycleId}/settlements/${row.settlement_id}/slip.pdf`"
            target="_blank"
            class="slip-link"
          >
            <el-button size="small">明細條</el-button>
          </a>
          <el-button
            size="small"
            data-test="detail-button"
            @click="openDetail(row)"
          >
            展開
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 重新試算 dialog -->
    <el-dialog
      v-model="buildDialogVisible"
      title="重新試算"
      width="480px"
      data-test="build-dialog"
    >
      <p>將為所有在職員工試算年終結算單（idempotent）。</p>
      <p class="build-note">注意：已完成簽核（非 DRAFT）的結算不會被覆寫。</p>
      <p class="build-note">若需納入離職員工，請聯絡系統管理員透過 API 指定 <code>included_resigned_employee_ids</code>。</p>
      <template #footer>
        <el-button @click="buildDialogVisible = false">取消</el-button>
        <el-button type="primary" data-test="build-confirm-button" @click="onBuild">確認試算</el-button>
      </template>
    </el-dialog>

    <!-- 手改 dialog -->
    <el-dialog
      v-model="editVisible"
      :title="`手動調整 — ${editingRow?.employee_name ?? ''}`"
      width="420px"
      data-test="edit-dialog"
    >
      <el-form label-width="130px" label-position="right">
        <el-form-item label="獎懲扣項（≤0）">
          <el-input-number
            v-model="editForm.deduction_disciplinary"
            :max="0"
            :step="100"
            controls-position="right"
            style="width: 200px"
            placeholder="留空=不覆寫"
            :value-on-clear="null"
            data-test="input-deduction"
          />
        </el-form-item>
        <el-form-item label="超額獎金（≥0）">
          <el-input-number
            v-model="editForm.excess_amount"
            :min="0"
            :step="100"
            controls-position="right"
            style="width: 200px"
            placeholder="留空=不覆寫"
            :value-on-clear="null"
            data-test="input-excess"
          />
        </el-form-item>
        <el-form-item label="到職月數覆寫">
          <el-input-number
            v-model="editForm.hire_months_override"
            :min="0"
            :max="12"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 200px"
            placeholder="留空=不覆寫"
            :value-on-clear="null"
            data-test="input-hire-months"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" data-test="edit-submit-button" @click="submitEdit">確認更新</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.year-end-grid-view {
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.title {
  margin: 0;
  font-size: 18px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}
.export-link,
.slip-link {
  text-decoration: none;
}
.total-amount {
  color: #409eff;
  font-weight: 600;
}
.yellow-header {
  background: #fefce8;
  padding: 2px 4px;
  border-radius: 3px;
}
.yellow-cell {
  background: #fefce8;
  display: block;
}
.build-note {
  color: #909399;
  font-size: 13px;
  margin: 4px 0;
}
</style>
