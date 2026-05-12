<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, EditPen, Refresh, DataAnalysis } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import {
  getBrackets,
  upsertBrackets,
  deleteBracket,
  calculateInsurance,
} from '@/api/insurance'

const canWrite = hasPermission('ACTIVITY_PAYMENT_APPROVE')

const currentYear = new Date().getFullYear()
const yearOptions = computed(() => {
  const list = []
  for (let y = currentYear + 1; y >= 2020; y--) list.push(y)
  return list
})

const requestedYear = ref(currentYear)
const effectiveYear = ref(null)
const brackets = ref([])
const loading = ref(false)

const editing = ref(false)
const editBuffer = ref([]) // 編輯態 deep copy
const reason = ref('')
const acknowledgeFinalized = ref(false)
const replaceExisting = ref(false)
const saving = ref(false)

const ZERO_ROW = () => ({
  id: null,
  amount: 0,
  labor_employee: 0,
  labor_employer: 0,
  health_employee: 0,
  health_employer: 0,
  pension: 0,
})

const fetchBrackets = async () => {
  loading.value = true
  try {
    const { data } = await getBrackets(requestedYear.value)
    brackets.value = data.brackets || []
    effectiveYear.value = data.effective_year
    if (
      data.effective_year &&
      data.effective_year !== requestedYear.value
    ) {
      ElMessage.info(
        `${requestedYear.value} 年尚未公告級距表，目前顯示 ${data.effective_year} 年資料`
      )
    }
  } catch (e) {
    ElMessage.error('級距表載入失敗')
  } finally {
    loading.value = false
  }
}

const startEdit = () => {
  if (!canWrite) return
  editBuffer.value = brackets.value.map((b) => ({ ...b }))
  reason.value = ''
  acknowledgeFinalized.value = false
  replaceExisting.value = false
  editing.value = true
}

const cancelEdit = () => {
  editing.value = false
  editBuffer.value = []
}

const addRowToEdit = () => {
  editBuffer.value.push(ZERO_ROW())
}

const removeRowFromEdit = (row) => {
  const i = editBuffer.value.indexOf(row)
  if (i >= 0) editBuffer.value.splice(i, 1)
}

const validateEditBuffer = () => {
  if (editBuffer.value.length === 0) {
    ElMessage.warning('至少需有一筆級距')
    return false
  }
  const seen = new Set()
  for (const [i, row] of editBuffer.value.entries()) {
    if (!row.amount || row.amount <= 0) {
      ElMessage.warning(`第 ${i + 1} 列：投保金額必須 > 0`)
      return false
    }
    if (seen.has(row.amount)) {
      ElMessage.warning(`第 ${i + 1} 列：投保金額 ${row.amount} 重複`)
      return false
    }
    seen.add(row.amount)
    for (const f of [
      'labor_employee',
      'labor_employer',
      'health_employee',
      'health_employer',
      'pension',
    ]) {
      if (row[f] == null || row[f] < 0) {
        ElMessage.warning(`第 ${i + 1} 列：${f} 必須 ≥ 0`)
        return false
      }
    }
  }
  if (reason.value.trim().length < 10) {
    ElMessage.warning('變更原因至少 10 字')
    return false
  }
  return true
}

const saveEdit = async () => {
  if (!validateEditBuffer()) return
  saving.value = true
  try {
    const payload = {
      effective_year: requestedYear.value,
      brackets: editBuffer.value.map((r) => ({
        amount: Number(r.amount),
        labor_employee: Number(r.labor_employee),
        labor_employer: Number(r.labor_employer),
        health_employee: Number(r.health_employee),
        health_employer: Number(r.health_employer),
        pension: Number(r.pension),
      })),
      replace_existing: replaceExisting.value,
      reason: reason.value.trim(),
      acknowledge_finalized_months: acknowledgeFinalized.value,
    }
    const { data } = await upsertBrackets(payload)
    ElMessage.success(
      `已寫入 ${data.upserted} 列；標記 stale 薪資 ${data.stale_marked} 筆`
    )
    editing.value = false
    await fetchBrackets()
  } catch (e) {
    const status = e?.response?.status
    const detail = e?.response?.data?.detail || '儲存失敗'
    if (status === 409) {
      try {
        await ElMessageBox.confirm(detail, '需二次確認', {
          confirmButtonText: '確認影響、繼續送出',
          cancelButtonText: '取消',
          type: 'warning',
        })
        acknowledgeFinalized.value = true
        await saveEdit() // 帶 ack 重送
        return
      } catch {
        // user cancel
      }
    } else if (status === 403) {
      ElMessage.error(detail)
    } else {
      ElMessage.error(detail)
    }
  } finally {
    saving.value = false
  }
}

const removeOne = async (row) => {
  if (!canWrite) return
  let userReason = ''
  try {
    const res = await ElMessageBox.prompt(
      `將刪除 ${effectiveYear.value} 年、投保金額 ${row.amount} 的級距列。請填寫刪除原因（≥10 字）。`,
      '刪除級距',
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning',
        inputValidator: (v) => (v && v.trim().length >= 10) || '原因至少 10 字',
      }
    )
    userReason = (res.value || '').trim()
  } catch {
    return
  }
  await callDelete(row.id, userReason, false)
}

const callDelete = async (bracketId, userReason, ack) => {
  try {
    const { data } = await deleteBracket(bracketId, {
      reason: userReason,
      acknowledge_finalized_months: ack,
    })
    ElMessage.success(`已刪除；標記 stale ${data.stale_marked} 筆`)
    await fetchBrackets()
  } catch (e) {
    const status = e?.response?.status
    const detail = e?.response?.data?.detail || '刪除失敗'
    if (status === 409) {
      try {
        await ElMessageBox.confirm(detail, '需二次確認', {
          confirmButtonText: '確認影響、繼續刪除',
          cancelButtonText: '取消',
          type: 'warning',
        })
        await callDelete(bracketId, userReason, true)
      } catch {
        // user cancel
      }
    } else {
      ElMessage.error(detail)
    }
  }
}

// ===== 試算 =====
const calcDialogVisible = ref(false)
const calcForm = reactive({ salary: 30000, dependents: 0 })
const calcResult = ref(null)
const calculating = ref(false)

const runCalculate = async () => {
  calculating.value = true
  try {
    const { data } = await calculateInsurance(calcForm.salary, calcForm.dependents)
    calcResult.value = data
  } catch (e) {
    ElMessage.error('試算失敗')
  } finally {
    calculating.value = false
  }
}

onMounted(fetchBrackets)

const isCloningFromFallback = computed(
  () =>
    editing.value &&
    effectiveYear.value != null &&
    effectiveYear.value !== requestedYear.value
)
</script>

<template>
  <div class="insurance-brackets-panel">
    <div class="panel-head">
      <div class="head-left">
        <h3 style="margin: 0 12px 0 0;">勞健保級距表</h3>
        <el-select
          v-model="requestedYear"
          style="width: 140px;"
          :disabled="editing"
          @change="fetchBrackets"
        >
          <el-option
            v-for="y in yearOptions"
            :key="y"
            :label="`${y} 年`"
            :value="y"
          />
        </el-select>
        <el-tag
          v-if="effectiveYear && effectiveYear !== requestedYear"
          type="warning"
          style="margin-left: 8px;"
        >
          顯示 {{ effectiveYear }} 年
        </el-tag>
        <span class="row-count">共 {{ brackets.length }} 筆</span>
      </div>
      <div class="head-right">
        <el-tooltip content="保費試算" placement="top">
          <el-button :icon="DataAnalysis" @click="calcDialogVisible = true">
            保費試算
          </el-button>
        </el-tooltip>
        <el-button :icon="Refresh" :disabled="editing" @click="fetchBrackets">
          重新整理
        </el-button>
        <el-button
          v-if="!editing"
          type="primary"
          :icon="EditPen"
          :disabled="!canWrite"
          @click="startEdit"
        >
          {{ brackets.length ? '編輯級距' : '新增級距' }}
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!canWrite"
      type="info"
      :closable="false"
      style="margin-bottom: 12px;"
      title="僅檢視模式"
      description="勞健保級距異動影響全員保費，需具備『金流簽核』權限（ACTIVITY_PAYMENT_APPROVE）。"
    />

    <!-- 檢視模式 -->
    <el-table
      v-if="!editing"
      v-loading="loading"
      :data="brackets"
      stripe
      border
      size="default"
      empty-text="該年度尚無資料"
    >
      <el-table-column prop="amount" label="投保金額" width="120" align="right" />
      <el-table-column label="勞保員工" width="110" align="right">
        <template #default="{ row }">{{ row.labor_employee }}</template>
      </el-table-column>
      <el-table-column label="勞保雇主" width="110" align="right">
        <template #default="{ row }">{{ row.labor_employer }}</template>
      </el-table-column>
      <el-table-column label="健保員工" width="110" align="right">
        <template #default="{ row }">{{ row.health_employee }}</template>
      </el-table-column>
      <el-table-column label="健保雇主" width="110" align="right">
        <template #default="{ row }">{{ row.health_employer }}</template>
      </el-table-column>
      <el-table-column label="勞退雇主" width="110" align="right">
        <template #default="{ row }">{{ row.pension }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="danger"
            :icon="Delete"
            :disabled="!canWrite"
            @click="removeOne(row)"
          >
            刪除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 編輯模式 -->
    <div v-else class="edit-block">
      <el-alert
        v-if="isCloningFromFallback"
        type="warning"
        :closable="false"
        :title="`將以 ${effectiveYear} 年為範本，寫入 ${requestedYear} 年`"
        style="margin-bottom: 12px;"
      >
        <template #default>
          {{ requestedYear }} 年尚未有級距表，目前列表來自 {{ effectiveYear }} 年。
          儲存時會寫入 {{ requestedYear }} 年（不影響 {{ effectiveYear }} 年原資料）。
          若只是想瀏覽歷史，請先切回 {{ effectiveYear }} 年再編輯。
        </template>
      </el-alert>
      <el-alert
        v-else
        type="warning"
        :closable="false"
        title="編輯中"
        style="margin-bottom: 12px;"
      >
        <template #default>
          將整批寫入 {{ requestedYear }} 年。寫入時會把該年度所有「未封存」薪資標記為
          stale（需重算）；若該年已有封存月份，後端會以 409 要求二次確認。
        </template>
      </el-alert>

      <el-table
        :data="editBuffer"
        border
        size="default"
        empty-text="尚未新增任何級距，請點下方「新增一列」"
      >
        <el-table-column label="投保金額" width="130">
          <template #default="{ row }">
            <el-input-number
              v-model="row.amount"
              :min="1"
              :step="100"
              controls-position="right"
              style="width: 100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="勞保員工" width="120">
          <template #default="{ row }">
            <el-input-number
              v-model="row.labor_employee"
              :min="0"
              controls-position="right"
              style="width: 100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="勞保雇主" width="120">
          <template #default="{ row }">
            <el-input-number
              v-model="row.labor_employer"
              :min="0"
              controls-position="right"
              style="width: 100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="健保員工" width="120">
          <template #default="{ row }">
            <el-input-number
              v-model="row.health_employee"
              :min="0"
              controls-position="right"
              style="width: 100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="健保雇主" width="120">
          <template #default="{ row }">
            <el-input-number
              v-model="row.health_employer"
              :min="0"
              controls-position="right"
              style="width: 100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="勞退雇主" width="120">
          <template #default="{ row }">
            <el-input-number
              v-model="row.pension"
              :min="0"
              controls-position="right"
              style="width: 100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="" width="80" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              :icon="Delete"
              @click="removeRowFromEdit(row)"
            />
          </template>
        </el-table-column>
      </el-table>

      <div style="margin: 12px 0;">
        <el-button :icon="Plus" @click="addRowToEdit">新增一列</el-button>
      </div>

      <el-form label-width="120px" class="edit-form">
        <el-form-item label="變更原因" required>
          <el-input
            v-model="reason"
            type="textarea"
            :rows="2"
            placeholder="≥ 10 字，會落 audit log（例：依勞動部 115/01/01 公告調整投保級距）"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="整張表重設">
          <el-switch v-model="replaceExisting" />
          <span class="hint">
            開啟：先刪除該年度所有列再寫入（適合年度整張表重整）；
            關閉：以 (年度, 投保金額) UPSERT。
          </span>
        </el-form-item>
      </el-form>

      <div class="edit-actions">
        <el-button @click="cancelEdit" :disabled="saving">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">
          儲存（{{ editBuffer.length }} 列）
        </el-button>
      </div>
    </div>

    <!-- 試算 dialog -->
    <el-dialog v-model="calcDialogVisible" title="保費試算" width="520px">
      <el-form label-width="100px" @submit.prevent="runCalculate">
        <el-form-item label="投保薪資">
          <el-input-number
            v-model="calcForm.salary"
            :min="0"
            :step="100"
            controls-position="right"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="眷屬人數">
          <el-input-number
            v-model="calcForm.dependents"
            :min="0"
            :max="20"
            controls-position="right"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="calculating" @click="runCalculate">
            試算
          </el-button>
        </el-form-item>
      </el-form>
      <div v-if="calcResult" class="calc-result">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="實際投保">
            {{ calcResult.insured_amount }}
          </el-descriptions-item>
          <el-descriptions-item label="勞保（員工）">
            {{ calcResult.labor_employee }}
          </el-descriptions-item>
          <el-descriptions-item label="勞保（雇主）">
            {{ calcResult.labor_employer }}
          </el-descriptions-item>
          <el-descriptions-item label="健保（員工）">
            {{ calcResult.health_employee }}
          </el-descriptions-item>
          <el-descriptions-item label="健保（雇主）">
            {{ calcResult.health_employer }}
          </el-descriptions-item>
          <el-descriptions-item label="勞退（雇主）">
            {{ calcResult.pension_employer }}
          </el-descriptions-item>
          <el-descriptions-item label="員工合計">
            {{ calcResult.total_employee }}
          </el-descriptions-item>
          <el-descriptions-item label="雇主合計">
            {{ calcResult.total_employer }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.insurance-brackets-panel {
  padding: 4px 0;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 4px;
}
.head-right {
  display: flex;
  gap: 8px;
}
.row-count {
  color: var(--el-text-color-secondary);
  margin-left: 12px;
  font-size: 13px;
}
.edit-block {
  background: var(--el-fill-color-lighter);
  padding: 16px;
  border-radius: 8px;
}
.edit-form {
  margin-top: 16px;
}
.edit-form .hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 12px;
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.calc-result {
  margin-top: 12px;
}
</style>
