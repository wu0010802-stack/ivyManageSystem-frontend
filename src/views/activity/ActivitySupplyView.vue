<template>
  <div class="activity-supplies">
    <!-- 標題交給外層「才藝設定與品項」頁的 h2 與 tab 標籤，此處不再重複（2026-07-31 整併） -->
    <AdminListToolbar
      v-model:search="supplySearch"
      search-placeholder="搜尋用品名稱"
      :total="supplyTotal"
      :shown="supplyShown"
    >
      <template #actions>
        <AcademicTermSelector />
        <AdminCreateButton v-if="canWrite" @click="openCreate">新增用品</AdminCreateButton>
      </template>
    </AdminListToolbar>

    <el-table :data="filteredSupplies" v-loading="loading" border>
      <template #empty>
        <EmptyState v-if="loadError" variant="error" title="用品資料載入失敗" :description="loadError">
          <template #action><el-button type="primary" @click="fetchSupplies">重試</el-button></template>
        </EmptyState>
        <EmptyState
          v-else-if="supplySearch"
          variant="inline"
          title="沒有符合搜尋的用品"
          :description="`找不到名稱含「${supplySearch}」的用品。`"
        />
        <EmptyState
          v-else-if="!loading"
          variant="inline"
          title="這學期還沒有用品"
          description="新增後，家長報名時就能一起選購（例如美術材料包）。"
        >
          <template v-if="canWrite" #action>
            <AdminCreateButton @click="openCreate">新增用品</AdminCreateButton>
          </template>
        </EmptyState>
      </template>
      <el-table-column label="用品名稱" prop="name" min-width="160" />
      <el-table-column label="價格（元）" prop="price" width="110" align="right">
        <template #default="{ row }">${{ row.price?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="已訂套數" prop="ordered_count" width="100" align="right">
        <template #default="{ row }">
          <el-link
            v-if="(row.ordered_count ?? 0) > 0"
            type="primary"
            data-testid="ordered-count-link"
            title="查看訂購名單"
            @click="openOrderers(row)"
          >{{ row.ordered_count }}</el-link>
          <span v-else class="count-zero">0</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" link type="danger" @click="handleDelete(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      :title="editingId ? '編輯用品' : '新增用品'"
      :dirty="formDirty"
      :loading="saving"
      :submit-text="editingId ? '儲存' : '新增用品'"
      @submit="handleSave"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="用品名稱" prop="name">
          <el-input v-model="form.name" maxlength="100" placeholder="例：美術材料包" />
        </el-form-item>
        <el-form-item label="價格（元）" prop="price">
          <el-input-number v-model="form.price" :min="0" :max="999999" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <p v-if="editingId" class="form-note">改價格只影響之後的新報名；已報名的金額不會跟著變。</p>
      </el-form>
    </FormDialog>

    <el-dialog
      v-model="orderersVisible"
      :title="`訂購名單 — ${orderersSupplyName}`"
      width="640px"
      destroy-on-close
    >
      <div class="orderers-meta">
        <span>共 <b>{{ orderersTotal }}</b> 筆有效報名</span>
        <el-tag type="info" size="small">已拒絕（軟刪）的報名不計入</el-tag>
      </div>
      <el-table :data="orderers" v-loading="orderersLoading" border max-height="420">
        <el-table-column label="學生姓名" prop="student_name" min-width="100" />
        <el-table-column label="班級" min-width="110">
          <template #default="{ row }">{{ formatOrdererClass(row) }}</template>
        </el-table-column>
        <el-table-column label="報名課程" prop="course_names" min-width="160" show-overflow-tooltip />
        <el-table-column label="繳費狀態" width="100">
          <template #default="{ row }">
            <el-tag :type="paymentTagType(row.payment_status)" size="small">
              {{ paymentStatusLabel(row.payment_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="報名日期" width="110">
          <template #default="{ row }">{{ (row.created_at ?? '').slice(0, 10) }}</template>
        </el-table-column>
      </el-table>
      <div v-if="orderersTotal > orderers.length" class="orderers-truncated">
        僅顯示前 {{ orderers.length }} 筆，完整名單請至報名管理查詢。
      </div>
      <template #footer>
        <el-button @click="orderersVisible = false">關閉</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getSupplies, createSupply, updateSupply, deleteSupply, getRegistrations } from '@/api/activity'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import { useClientTableFilter } from '@/composables'
import { useFormDirty } from '@/composables/useFormDirty'
import { required } from '@/validators/rules'
import type { FormInstance, FormRules } from 'element-plus'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import { PAYMENT_STATUS_TAG_TYPE, PAYMENT_STATUS_LABEL } from '@/constants/activity'

// ordered_count＝被有效報名選用的筆數（後端與停用 guard 同口徑，rejected 不計）
interface Supply { id: number; name: string; price: number; ordered_count: number }
// 訂購名單列：GET /registrations?supply_id= 回傳項目中本 dialog 用到的欄位
interface OrdererRow {
  student_name?: string | null
  grade_name?: string | null
  class_name?: string | null
  course_names?: string
  payment_status?: string
  created_at?: string | null
}
type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

const termStore = useAcademicTermStore()

// 對齊 ActivityRegistrationView 慣例：READ-only 使用者隱藏 mutation 入口（後端守衛 ACTIVITY_WRITE）
const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))

const supplies = ref<Supply[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = ref<{ name: string; price: number }>({ name: '', price: 0 })
const { isDirty: formDirty, snapshot: snapshotForm } = useFormDirty(form)
const formRef = ref<FormInstance>()
const formDialogRef = ref<InstanceType<typeof FormDialog>>()
const formRules: FormRules = {
  name: [required('用品名稱')],
  price: [required('價格', { kind: 'select', trigger: 'change' })],
}
// 非空＝最近一次載入失敗；空表格據此顯示「載入失敗＋重試」而不是「還沒有用品」
const loadError = ref('')

const {
  searchQuery: supplySearch,
  filtered: filteredSupplies,
  total: supplyTotal,
  shown: supplyShown,
} = useClientTableFilter<Supply>({
  source: () => supplies.value,
  searchFields: (r) => [r.name],
})

// 訂購名單 dialog：點「已訂套數」即查即用，不快取（後端 limit 上限 200）
const REGISTRATIONS_PAGE_MAX = 200
const orderersVisible = ref(false)
const orderersLoading = ref(false)
const orderersSupplyName = ref('')
const orderers = ref<OrdererRow[]>([])
const orderersTotal = ref(0)

// F5：切換學期競態守衛。每次載入遞增序號，回應落地前比對序號；快速切學期時較慢的
// 舊請求後回不得覆寫較新請求的結果（否則頁面顯示新學期但資料屬舊學期）。
let fetchSeq = 0
async function fetchSupplies() {
  const seq = ++fetchSeq
  loading.value = true
  loadError.value = ''
  try {
    const res = await getSupplies({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    if (seq !== fetchSeq) return // 過期回應：已有更新的載入，丟棄不覆寫
    supplies.value = (res.data as { supplies: Supply[] }).supplies
  } catch (e) {
    if (seq !== fetchSeq) return
    // F4：載入失敗須清空清單，否則切學期失敗時畫面留著上一學期的資料且編輯/停用
    // 按鈕仍可操作（學期選擇器顯示新學期但資料屬舊學期），易誤改到舊學期資料。
    supplies.value = []
    loadError.value = friendlyError('載入用品資料失敗', e)
    ElMessage.error(loadError.value)
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

watch(() => [termStore.school_year, termStore.semester], () => fetchSupplies())

function openCreate() {
  editingId.value = null
  form.value = { name: '', price: 0 }
  snapshotForm()
  dialogVisible.value = true
}

function openEdit(row: Supply) {
  editingId.value = row.id
  form.value = { name: row.name, price: row.price }
  snapshotForm()
  dialogVisible.value = true
}

async function handleSave() {
  const valid = formRef.value?.validate ? await formRef.value.validate().catch(() => false) : true
  if (!valid) {
    formDialogRef.value?.scrollToFirstError()
    return
  }
  if (!form.value.name.trim() || form.value.price == null) {
    return ElMessage.warning('請填寫用品名稱和價格')
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateSupply(editingId.value, form.value)
      ElMessage.success('用品更新成功')
    } else {
      // 帶上 selector 選定學期：否則後端缺省成當前學期，非當前學期新增會「消失」
      // 並污染當前學期資料（與 fetchSupplies 同樣以 termStore 查詢對齊）
      await createSupply({
        ...form.value,
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
      ElMessage.success('用品新增成功')
    }
    dialogVisible.value = false
    fetchSupplies()
  } catch (e) {
    ElMessage.error(friendlyError(editingId.value ? '更新用品失敗' : '新增用品失敗', e))
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Supply) {
  // 後端不允許停用仍被有效報名選用的用品（否則家長改報名會被卡住），先在前端講清楚、不白按
  const ordered = row.ordered_count ?? 0
  if (ordered > 0) {
    await ElMessageBox.alert(
      `「${row.name}」目前有 ${ordered} 筆報名選了這項用品，要先到訂購名單把這些報名的用品移除或改選，才能停用。`,
      '暫時不能停用',
      { type: 'warning', confirmButtonText: '知道了' },
    ).catch(() => {})
    return
  }
  try {
    await ElMessageBox.confirm(`停用後家長報名時就看不到「${row.name}」。確定要停用嗎？`, '確認停用', {
      type: 'warning',
      confirmButtonText: '確定停用',
      confirmButtonClass: 'el-button--danger',
    })
    await deleteSupply(row.id)
    ElMessage.success('用品已停用')
    fetchSupplies()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(friendlyError('停用用品失敗', e))
  }
}

async function openOrderers(row: Supply) {
  orderersSupplyName.value = row.name
  orderers.value = []
  orderersTotal.value = 0
  orderersVisible.value = true
  orderersLoading.value = true
  try {
    // 帶上 selector 選定學期與 fetchSupplies 對齊；口徑與 ordered_count 一致
    //（include_inactive 預設 false＝只列有效報名，rejected 不計）
    const res = await getRegistrations({
      supply_id: row.id,
      school_year: termStore.school_year,
      semester: termStore.semester,
      limit: REGISTRATIONS_PAGE_MAX,
    })
    const data = res.data as { items: OrdererRow[]; total: number }
    orderers.value = data.items
    orderersTotal.value = data.total
  } catch (e) {
    ElMessage.error(friendlyError('載入訂購名單失敗', e))
  } finally {
    orderersLoading.value = false
  }
}

function formatOrdererClass(row: OrdererRow): string {
  return [row.grade_name, row.class_name].filter(Boolean).join('・') || '—'
}

function paymentTagType(status?: string): ElTagType {
  return ((PAYMENT_STATUS_TAG_TYPE as Record<string, string>)[status ?? ''] || 'info') as ElTagType
}

function paymentStatusLabel(status?: string): string {
  return (PAYMENT_STATUS_LABEL as Record<string, string>)[status ?? ''] || '未繳費'
}

onMounted(fetchSupplies)
</script>

<style scoped>
.activity-supplies { padding: 16px; }
.form-note { margin: 0 0 0 90px; font-size: 12px; color: var(--text-tertiary); }
.count-zero { color: var(--text-tertiary); }
.orderers-meta { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); color: var(--text-secondary); flex-wrap: wrap; }
.orderers-truncated { margin-top: var(--space-2); font-size: 12px; color: var(--text-tertiary); }
</style>
