<template>
  <div class="student-fee-view">
    <div class="page-header">
      <h2>學費管理</h2>
    </div>

    <el-tabs v-model="activeTab" type="card">
      <!-- ================================================================
           Tab 1：費用項目設定
      ================================================================ -->
      <el-tab-pane label="費用項目設定" name="items">
        <div class="toolbar">
          <div class="filters">
            <el-input
              v-model="itemFilter.period"
              placeholder="學期篩選（如 2025-1）"
              clearable
              style="width: 180px"
              @change="fetchItems"
            />
            <el-select v-model="itemFilter.is_active" placeholder="狀態" clearable style="width: 110px" @change="fetchItems">
              <el-option label="啟用中" :value="true" />
              <el-option label="已停用" :value="false" />
            </el-select>
          </div>
          <el-button type="primary" @click="openCreateItem">
            <el-icon><Plus /></el-icon> 新增項目
          </el-button>
        </div>

        <el-table :data="feeItems" v-loading="itemsLoading" border>
          <el-table-column label="名稱" prop="name" min-width="120" />
          <el-table-column label="金額（元）" prop="amount" width="110" align="right">
            <template #default="{ row }">{{ row.amount.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="適用班級" min-width="100">
            <template #default="{ row }">{{ row.classroom_name || '全校' }}</template>
          </el-table-column>
          <el-table-column label="學期" prop="period" width="90" />
          <el-table-column label="狀態" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? '啟用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" align="center" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEditItem(row)">編輯</el-button>
              <el-button size="small" type="success" @click="openGenerate(row)">批次產生記錄</el-button>
              <el-button size="small" type="danger" @click="handleDeleteItem(row)" :loading="deleteItemLoading">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ================================================================
           Tab 2：繳費記錄
      ================================================================ -->
      <el-tab-pane label="繳費記錄" name="records">
        <div class="toolbar">
          <div class="filters">
            <el-input
              v-model="recordFilter.period"
              placeholder="學期（如 2025-1）"
              clearable
              style="width: 150px"
              @change="() => { recordPage.value = 1; fetchRecords() }"
            />
            <el-input
              v-model="recordFilter.classroom_name"
              placeholder="班級名稱"
              clearable
              style="width: 130px"
              @change="() => { recordPage.value = 1; fetchRecords() }"
            />
            <el-select v-model="recordFilter.status" placeholder="繳費狀態" clearable style="width: 120px" @change="() => { recordPage.value = 1; fetchRecords() }">
              <el-option label="未繳" value="unpaid" />
              <el-option label="已繳" value="paid" />
            </el-select>
            <el-button @click="() => { recordPage.value = 1; fetchRecords() }">搜尋</el-button>
          </div>
        </div>

        <el-table :data="feeRecords" v-loading="recordsLoading" border>
          <el-table-column label="學生" prop="student_name" min-width="80" />
          <el-table-column label="班級" prop="classroom_name" min-width="80" />
          <el-table-column label="費用項目" prop="fee_item_name" min-width="110" />
          <el-table-column label="學期" prop="period" width="85" />
          <el-table-column label="應繳（元）" width="100" align="right">
            <template #default="{ row }">{{ row.amount_due.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="已繳（元）" width="100" align="right">
            <template #default="{ row }">{{ row.amount_paid.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="狀態" width="75" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'paid' ? 'success' : 'warning'" size="small">
                {{ row.status === 'paid' ? '已繳' : '未繳' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="繳費日期" width="105">
            <template #default="{ row }">{{ row.payment_date || '—' }}</template>
          </el-table-column>
          <el-table-column label="繳費方式" width="90">
            <template #default="{ row }">{{ row.payment_method || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'unpaid'"
                size="small"
                type="primary"
                @click="openPayDialog(row)"
              >登記繳費</el-button>
              <span v-else class="paid-label">已完成</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分頁 -->
        <el-pagination
          v-model:current-page="recordPage"
          v-model:page-size="recordPageSize"
          :total="recordTotal"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[20, 50, 100]"
          style="margin-top: 12px; justify-content: flex-end"
          @size-change="fetchRecords"
          @current-change="fetchRecords"
        />

        <!-- 統計摘要 -->
        <div class="summary-bar" v-if="summary">
          <el-tag type="info" size="large">總筆數：{{ summary.total_count }}</el-tag>
          <el-tag type="default" size="large">總應繳：{{ summary.total_due.toLocaleString() }} 元</el-tag>
          <el-tag type="success" size="large">已繳：{{ summary.total_paid.toLocaleString() }} 元（{{ summary.paid_count }} 人）</el-tag>
          <el-tag type="warning" size="large">未繳：{{ summary.total_unpaid.toLocaleString() }} 元（{{ summary.unpaid_count }} 人）</el-tag>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- ================================================================
         Dialog：新增/編輯費用項目
    ================================================================ -->
    <el-dialog
      v-model="itemDialogVisible"
      :title="editingItem ? '編輯費用項目' : '新增費用項目'"
      width="480px"
      destroy-on-close
    >
      <el-form :model="itemForm" :rules="itemRules" ref="itemFormRef" label-width="90px">
        <el-form-item label="費用名稱" prop="name">
          <el-input v-model="itemForm.name" placeholder="如：學費、雜費、材料費" />
        </el-form-item>
        <el-form-item label="金額（元）" prop="amount">
          <el-input-number v-model="itemForm.amount" :min="0" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="適用班級" prop="classroom_id">
          <el-select v-model="itemForm.classroom_id" placeholder="全校（不選=全校）" clearable style="width: 100%">
            <el-option
              v-for="cls in classrooms"
              :key="cls.id"
              :label="cls.name"
              :value="cls.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="學期" prop="period">
          <el-input v-model="itemForm.period" placeholder="如：2025-1" />
        </el-form-item>
        <el-form-item label="狀態" prop="is_active">
          <el-switch v-model="itemForm.is_active" active-text="啟用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitItem">確定</el-button>
      </template>
    </el-dialog>

    <!-- ================================================================
         Dialog：批次產生記錄
    ================================================================ -->
    <el-dialog v-model="generateDialogVisible" title="批次產生費用記錄" width="400px" destroy-on-close>
      <div v-if="generatingItem">
        <p>費用項目：<strong>{{ generatingItem.name }}</strong>（{{ generatingItem.period }}）</p>
        <p>金額：<strong>{{ generatingItem.amount.toLocaleString() }} 元</strong></p>
        <el-form label-width="90px">
          <el-form-item label="指定班級">
            <el-select v-model="generateClassroomId" placeholder="全校（不選=全部適用學生）" clearable style="width: 100%">
              <el-option
                v-for="cls in classrooms"
                :key="cls.id"
                :label="cls.name"
                :value="cls.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <p class="hint">已存在記錄的學生將自動跳過，不會重複建立。</p>
      </div>
      <template #footer>
        <el-button @click="generateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitGenerate">產生記錄</el-button>
      </template>
    </el-dialog>

    <!-- ================================================================
         Dialog：登記繳費
    ================================================================ -->
    <el-dialog v-model="payDialogVisible" title="登記繳費" width="400px" destroy-on-close>
      <div v-if="payingRecord">
        <p>學生：<strong>{{ payingRecord.student_name }}</strong>（{{ payingRecord.classroom_name }}）</p>
        <p>費用項目：{{ payingRecord.fee_item_name }} — 應繳 <strong>{{ payingRecord.amount_due.toLocaleString() }} 元</strong></p>
        <el-form :model="payForm" :rules="payRules" ref="payFormRef" label-width="90px">
          <el-form-item label="繳費日期" prop="payment_date">
            <el-date-picker v-model="payForm.payment_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item label="繳費金額" prop="amount_paid">
            <el-input-number v-model="payForm.amount_paid" :min="0" :precision="0" style="width: 100%" />
          </el-form-item>
          <el-form-item label="繳費方式" prop="payment_method">
            <el-select v-model="payForm.payment_method" style="width: 100%">
              <el-option label="現金" value="現金" />
              <el-option label="轉帳" value="轉帳" />
              <el-option label="其他" value="其他" />
            </el-select>
          </el-form-item>
          <el-form-item label="備註">
            <el-input v-model="payForm.notes" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="payDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPay">確認繳費</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getFeeItems, createFeeItem, updateFeeItem, deleteFeeItem,
  generateFeeRecords, getFeeRecords, payFeeRecord, getFeeSummary,
} from '@/api/fees'
import { useClassroomStore } from '@/stores/classroom'

// ─── Tab 狀態 ────────────────────────────────────────────────────────────────
const activeTab = ref('items')

// ─── 費用項目 ─────────────────────────────────────────────────────────────────
const feeItems = ref([])
const itemsLoading = ref(false)
const itemFilter = ref({ period: '', is_active: null })

async function fetchItems() {
  itemsLoading.value = true
  try {
    const params = {}
    if (itemFilter.value.period) params.period = itemFilter.value.period
    if (itemFilter.value.is_active !== null && itemFilter.value.is_active !== undefined) {
      params.is_active = itemFilter.value.is_active
    }
    feeItems.value = await getFeeItems(params)
  } catch {
    ElMessage.error('載入費用項目失敗')
  } finally {
    itemsLoading.value = false
  }
}

// ─── 班級列表（供下拉選單） ───────────────────────────────────────────────────
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

// ─── 新增/編輯費用項目 ────────────────────────────────────────────────────────
const itemDialogVisible = ref(false)
const editingItem = ref(null)
const saving = ref(false)
const deleteItemLoading = ref(false)
const itemFormRef = ref(null)
const itemForm = ref({
  name: '',
  amount: 0,
  classroom_id: null,
  period: '',
  is_active: true,
})
const itemRules = {
  name: [{ required: true, message: '請輸入費用名稱', trigger: 'blur' }],
  amount: [{ required: true, message: '請輸入金額', trigger: 'blur' }],
  period: [{ required: true, message: '請輸入學期（如 2025-1）', trigger: 'blur' }],
}

function openCreateItem() {
  editingItem.value = null
  itemForm.value = { name: '', amount: 0, classroom_id: null, period: '', is_active: true }
  itemDialogVisible.value = true
}

function openEditItem(row) {
  editingItem.value = row
  itemForm.value = {
    name: row.name,
    amount: row.amount,
    classroom_id: row.classroom_id || null,
    period: row.period,
    is_active: row.is_active,
  }
  itemDialogVisible.value = true
}

async function submitItem() {
  const valid = await itemFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editingItem.value) {
      await updateFeeItem(editingItem.value.id, itemForm.value)
      ElMessage.success('費用項目已更新')
    } else {
      await createFeeItem(itemForm.value)
      ElMessage.success('費用項目已新增')
    }
    itemDialogVisible.value = false
    fetchItems()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDeleteItem(row) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.name}」費用項目嗎？若有關聯記錄將無法刪除。`,
      '刪除確認',
      { type: 'warning' },
    )
  } catch {
    return
  }
  deleteItemLoading.value = true
  try {
    await deleteFeeItem(row.id)
    ElMessage.success('已刪除')
    fetchItems()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '刪除失敗')
  } finally {
    deleteItemLoading.value = false
  }
}

// ─── 批次產生記錄 ─────────────────────────────────────────────────────────────
const generateDialogVisible = ref(false)
const generatingItem = ref(null)
const generateClassroomId = ref(null)

function openGenerate(row) {
  generatingItem.value = row
  generateClassroomId.value = null
  generateDialogVisible.value = true
}

async function submitGenerate() {
  saving.value = true
  try {
    const result = await generateFeeRecords({
      fee_item_id: generatingItem.value.id,
      classroom_id: generateClassroomId.value || null,
    })
    ElMessage.success(`已產生 ${result.created} 筆記錄，跳過 ${result.skipped} 筆（已存在）`)
    generateDialogVisible.value = false
    if (activeTab.value === 'records') fetchRecords()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '產生記錄失敗')
  } finally {
    saving.value = false
  }
}

// ─── 繳費記錄 ─────────────────────────────────────────────────────────────────
const feeRecords = ref([])
const recordsLoading = ref(false)
const recordFilter = ref({ period: '', classroom_name: '', status: '' })
const recordPage = ref(1)
const recordPageSize = ref(50)
const recordTotal = ref(0)
const summary = ref(null)

function _buildRecordParams() {
  const params = { page: recordPage.value, page_size: recordPageSize.value }
  if (recordFilter.value.period) params.period = recordFilter.value.period
  if (recordFilter.value.classroom_name) params.classroom_name = recordFilter.value.classroom_name
  if (recordFilter.value.status) params.status = recordFilter.value.status
  return params
}

async function fetchRecords() {
  recordsLoading.value = true
  try {
    const params = _buildRecordParams()
    const [res, sum] = await Promise.all([
      getFeeRecords(params),
      getFeeSummary(params),
    ])
    feeRecords.value = res.items
    recordTotal.value = res.total
    summary.value = sum
  } catch {
    ElMessage.error('載入費用記錄失敗')
  } finally {
    recordsLoading.value = false
  }
}

// ─── 登記繳費 ─────────────────────────────────────────────────────────────────
const payDialogVisible = ref(false)
const payingRecord = ref(null)
const payFormRef = ref(null)
const payForm = ref({
  payment_date: '',
  amount_paid: 0,
  payment_method: '現金',
  notes: '',
})
const payRules = {
  payment_date: [{ required: true, message: '請選擇繳費日期', trigger: 'change' }],
  payment_method: [{ required: true, message: '請選擇繳費方式', trigger: 'change' }],
}

function openPayDialog(row) {
  payingRecord.value = row
  payForm.value = {
    payment_date: new Date().toISOString().slice(0, 10),
    amount_paid: row.amount_due,
    payment_method: '現金',
    notes: '',
  }
  payDialogVisible.value = true
}

async function submitPay() {
  const valid = await payFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await payFeeRecord(payingRecord.value.id, payForm.value)
    ElMessage.success('繳費登記成功')
    payDialogVisible.value = false
    fetchRecords()
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail || '登記繳費失敗')
  } finally {
    saving.value = false
  }
}

// ─── 切換 Tab 時自動載入 ──────────────────────────────────────────────────────
watch(activeTab, (val) => {
  if (val === 'records') fetchRecords()
})

onMounted(() => {
  fetchItems()
  classroomStore.fetchClassrooms()
})
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-5);
}

.page-header {
  margin-bottom: var(--space-4);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: var(--space-3);
}

.filters {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.summary-bar {
  margin-top: var(--space-4);
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hint {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  margin-top: var(--space-2);
}

.paid-label {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}
</style>
