<script setup lang="ts">
/**
 * 管理端：臨時接送授權總覽 + 行政代核銷。
 * 對應後端 api/pickup_authorizations.py（沿用 GUARDIANS_READ/WRITE，未新增權限碼）。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import {
  listPickupAuthorizations,
  overridePickupAuthorization,
  verifyPickupAuthorization,
} from '@/api/pickupAuthorizations'

interface PickupAuth {
  id: number
  student_id: number
  student_name: string
  classroom_name: string
  person_name: string
  person_relation: string
  person_phone: string
  photo_url: string | null
  parent_name: string | null
  pickup_date: string
  status: string
  effective_status: string
  code_locked: boolean
  completed_at: string | null
  completed_via: string | null
  [key: string]: unknown
}

const canWrite = computed(() => hasPermission('GUARDIANS_WRITE'))

const items = ref<PickupAuth[]>([])
const loading = ref(false)

const dateFrom = ref('')
const dateTo = ref('')
const statusFilter = ref('')

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]
const STATUS_LABEL: Record<string, string> = {
  active: '進行中', completed: '已完成', cancelled: '已取消', expired: '已過期',
}
type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const STATUS_TAG: Record<string, ElTagType> = {
  active: 'warning', completed: 'success', cancelled: 'info', expired: 'danger',
}

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (dateFrom.value) params.date_from = dateFrom.value
    if (dateTo.value) params.date_to = dateTo.value
    if (statusFilter.value) params.status = statusFilter.value
    const { data } = await listPickupAuthorizations(params)
    items.value = (data as { items?: PickupAuth[] })?.items || []
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

// ── 代核銷 ────────────────────────────────────────────────────────────
const verifyTarget = ref<PickupAuth | null>(null)
const verifyDialogOpen = ref(false)
const codeInput = ref('')
const overrideMode = ref(false)
const overrideNote = ref('')
const verifying = ref(false)

function openVerify(item: PickupAuth) {
  verifyTarget.value = item
  codeInput.value = ''
  overrideMode.value = item.code_locked
  overrideNote.value = ''
  verifyDialogOpen.value = true
}

function closeVerify() {
  verifyDialogOpen.value = false
  verifyTarget.value = null
}

function extractErrorCode(e: unknown): string | undefined {
  const err = e as { response?: { data?: { detail?: { error_code?: string } } } }
  return err.response?.data?.detail?.error_code
}
function extractErrorDetail(e: unknown): string {
  const err = e as { response?: { data?: { detail?: { detail?: string } | string } } }
  const d = err.response?.data?.detail
  if (typeof d === 'string') return d
  return d?.detail || '操作失敗'
}

async function submitVerify() {
  const target = verifyTarget.value
  if (!target) return
  verifying.value = true
  try {
    await verifyPickupAuthorization(target.id, { code: codeInput.value })
    ElMessage.success('已完成核銷')
    closeVerify()
    fetchData()
  } catch (err) {
    if (extractErrorCode(err) === 'code_locked') {
      overrideMode.value = true
      ElMessage.warning('驗碼已鎖定，請人工核對證件後送出')
    } else {
      ElMessage.error(extractErrorDetail(err))
    }
  } finally {
    verifying.value = false
  }
}

async function submitOverride() {
  const target = verifyTarget.value
  if (!target || overrideNote.value.trim().length < 2) return
  try {
    await ElMessageBox.confirm(
      `確定人工核對 ${target.person_name}（${target.person_relation}）的證件後放行接送？`,
      '確認人工核銷',
      { confirmButtonText: '確定核銷', cancelButtonText: '返回', type: 'warning' },
    )
  } catch {
    return
  }
  verifying.value = true
  try {
    await overridePickupAuthorization(target.id, { note: overrideNote.value.trim() })
    ElMessage.success('已完成人工核銷')
    closeVerify()
    fetchData()
  } catch (err) {
    ElMessage.error(extractErrorDetail(err))
  } finally {
    verifying.value = false
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="pickup-auth-admin-view">
    <PageHeader :title="PAGE_TERMS.pickupAuthorizations" />

    <el-row :gutter="12" class="filter-row">
      <el-col :span="6">
        <el-date-picker
          v-model="dateFrom"
          type="date"
          placeholder="起日"
          value-format="YYYY-MM-DD"
          @change="fetchData"
        />
      </el-col>
      <el-col :span="6">
        <el-date-picker
          v-model="dateTo"
          type="date"
          placeholder="迄日"
          value-format="YYYY-MM-DD"
          @change="fetchData"
        />
      </el-col>
      <el-col :span="6">
        <el-select v-model="statusFilter" placeholder="狀態" @change="fetchData">
          <el-option
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
      </el-col>
    </el-row>

    <el-table :data="items" v-loading="loading" style="width: 100%">
      <el-table-column label="照片" width="70">
        <template #default="{ row }">
          <img v-if="row.photo_url" :src="row.photo_url" alt="接送人照片" class="thumb" />
        </template>
      </el-table-column>
      <el-table-column prop="student_name" label="學生" width="100" />
      <el-table-column prop="classroom_name" label="班級" width="100" />
      <el-table-column label="接送人" min-width="160">
        <template #default="{ row }">
          {{ row.person_name }}（{{ row.person_relation }}）· {{ row.person_phone }}
        </template>
      </el-table-column>
      <el-table-column prop="parent_name" label="授權家長" width="100" />
      <el-table-column prop="pickup_date" label="接送日" width="110" />
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.effective_status] || 'info'">
            {{ STATUS_LABEL[row.effective_status] || row.effective_status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="核銷方式" width="90">
        <template #default="{ row }">
          {{ row.completed_via === 'code' ? '驗碼' : row.completed_via === 'override' ? '人工核對' : '—' }}
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="90">
        <template #default="{ row }">
          <el-button
            v-if="row.effective_status === 'active'"
            type="primary"
            size="small"
            @click="openVerify(row)"
          >核銷</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span>今日無接送授權</span>
      </template>
    </el-table>

    <el-dialog v-model="verifyDialogOpen" title="接送核銷" width="480px">
      <template v-if="verifyTarget">
        <p class="verify-target-name">
          {{ verifyTarget.student_name }} · {{ verifyTarget.person_name }}（{{ verifyTarget.person_relation }}）
        </p>
        <img
          v-if="verifyTarget.photo_url"
          :src="verifyTarget.photo_url"
          alt="接送人照片"
          class="verify-photo"
        />

        <template v-if="!overrideMode">
          <el-input
            v-model="codeInput"
            maxlength="6"
            placeholder="請輸入接送人出示的 6 位取件碼"
            class="code-input"
          />
        </template>
        <template v-else>
          <el-input
            v-model="overrideNote"
            type="textarea"
            :rows="3"
            placeholder="請輸入核對證件的說明（至少 2 字，將寫入稽核紀錄）"
            class="override-note"
          />
        </template>
      </template>
      <template #footer>
        <el-button @click="closeVerify">取消</el-button>
        <el-button
          v-if="!overrideMode"
          type="primary"
          :disabled="codeInput.length !== 6"
          :loading="verifying"
          @click="submitVerify"
        >驗證核銷</el-button>
        <el-button
          v-else
          type="warning"
          :disabled="overrideNote.trim().length < 2"
          :loading="verifying"
          @click="submitOverride"
        >人工核銷</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pickup-auth-admin-view {
  padding: 16px;
}
.filter-row {
  margin-bottom: 12px;
}
.thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
}
.verify-target-name {
  font-weight: 600;
  margin-bottom: 8px;
}
.verify-photo {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
  margin-bottom: 12px;
}
.code-input, .override-note {
  margin-bottom: 4px;
}
</style>
