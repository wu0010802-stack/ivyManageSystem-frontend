<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createEmployeeEducation, updateEmployeeEducation, deleteEmployeeEducation,
  createEmployeeCertificate, updateEmployeeCertificate, deleteEmployeeCertificate,
  createEmployeeContract, updateEmployeeContract, deleteEmployeeContract,
} from '@/api/employees'
import { DEGREE_OPTIONS, CONTRACT_TYPE_OPTIONS } from '@/constants/employee'
import EmptyState from '@/components/common/EmptyState.vue'
import type { ApiBody } from '@/api/_generated/typed'
import { expiryStatus } from '@/utils/expiry'

const props = defineProps<{
  employeeId: number
  educations: Record<string, unknown>[]
  certificates: Record<string, unknown>[]
  contracts: Record<string, unknown>[]
}>()
const emit = defineEmits<{ (e: 'reload', kind: 'education' | 'certificate' | 'contract'): void }>()

// ── 學歷 / 證照 / 合約 共用子對話框 ──────────────────
type SubDialogKind = 'education' | 'certificate' | 'contract' | null
const subDialog = reactive({
  visible: false,
  isEdit: false,
  kind: null as SubDialogKind,
  form: {} as Record<string, unknown>,
})
const subDialogTitle = computed(() => {
  const kindLabel: Record<string, string> = { education: '學歷', certificate: '證照', contract: '合約' }
  return `${subDialog.isEdit ? '編輯' : '新增'}${subDialog.kind ? (kindLabel[subDialog.kind] || '') : ''}`
})

const openEduCreate = () => {
  subDialog.kind = 'education'; subDialog.isEdit = false
  subDialog.form = {
    school_name: '', major: '', degree: '學士',
    graduation_date: '', is_highest: false, remark: '',
  }
  subDialog.visible = true
}
const openEduEdit = (row: Record<string, unknown>) => {
  subDialog.kind = 'education'; subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.visible = true
}
const openCertCreate = () => {
  subDialog.kind = 'certificate'; subDialog.isEdit = false
  subDialog.form = {
    certificate_name: '', issuer: '', certificate_number: '',
    issued_date: '', expiry_date: '', remark: '',
  }
  subDialog.visible = true
}
const openCertEdit = (row: Record<string, unknown>) => {
  subDialog.kind = 'certificate'; subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.visible = true
}
const openContractCreate = () => {
  subDialog.kind = 'contract'; subDialog.isEdit = false
  subDialog.form = {
    contract_type: '正式', start_date: '', end_date: '',
    salary_at_contract: null, remark: '',
  }
  subDialog.visible = true
}
const openContractEdit = (row: Record<string, unknown>) => {
  subDialog.kind = 'contract'; subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.visible = true
}

const submitSub = async () => {
  const id = props.employeeId
  if (!id) return
  const formData = subDialog.form
  const subId = formData.id as number
  try {
    if (subDialog.kind === 'education') {
      if (!formData.school_name) return ElMessage.warning('請輸入學校名稱')
      const edu = formData as unknown as ApiBody<'/employees/{employee_id}/educations', 'post'>
      if (subDialog.isEdit) await updateEmployeeEducation(id, subId, edu as unknown as ApiBody<'/employees/{employee_id}/educations/{edu_id}', 'put'>)
      else await createEmployeeEducation(id, edu)
      emit('reload', 'education')
    } else if (subDialog.kind === 'certificate') {
      if (!formData.certificate_name) return ElMessage.warning('請輸入證照名稱')
      const cert = formData as unknown as ApiBody<'/employees/{employee_id}/certificates', 'post'>
      if (subDialog.isEdit) await updateEmployeeCertificate(id, subId, cert as unknown as ApiBody<'/employees/{employee_id}/certificates/{cert_id}', 'put'>)
      else await createEmployeeCertificate(id, cert)
      emit('reload', 'certificate')
    } else if (subDialog.kind === 'contract') {
      if (!formData.contract_type) return ElMessage.warning('請選擇合約類型')
      if (!formData.start_date) return ElMessage.warning('請選擇合約起始日')
      const contract = formData as unknown as ApiBody<'/employees/{employee_id}/contracts', 'post'>
      if (subDialog.isEdit) await updateEmployeeContract(id, subId, contract as unknown as ApiBody<'/employees/{employee_id}/contracts/{contract_id}', 'put'>)
      else await createEmployeeContract(id, contract)
      emit('reload', 'contract')
    }
    subDialog.visible = false
    ElMessage.success('儲存成功')
  } catch (err) {
    const e = err as { response?: { data?: { detail?: string } }; message?: string }
    ElMessage.error('儲存失敗：' + (e.response?.data?.detail || e.message))
  }
}

const confirmDeleteSub = (kind: string, row: Record<string, unknown>) => {
  ElMessageBox.confirm('確定刪除此筆記錄？', '警告', { type: 'warning' }).then(async () => {
    const id = props.employeeId
    try {
      if (kind === 'education') { await deleteEmployeeEducation(id, row.id as number); emit('reload', 'education') }
      else if (kind === 'certificate') { await deleteEmployeeCertificate(id, row.id as number); emit('reload', 'certificate') }
      else if (kind === 'contract') { await deleteEmployeeContract(id, row.id as number); emit('reload', 'contract') }
      ElMessage.success('已刪除')
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      ElMessage.error('刪除失敗：' + (e.response?.data?.detail || e.message))
    }
  }).catch(() => {})
}

interface EduForm { school_name?: string; major?: string; degree?: string; graduation_date?: string | null; is_highest?: boolean; remark?: string }
interface CertForm { certificate_name?: string; issuer?: string; certificate_number?: string; issued_date?: string | null; expiry_date?: string | null; remark?: string }
interface ContractForm { contract_type?: string; start_date?: string | null; end_date?: string | null; salary_at_contract?: number | null; remark?: string }
const subEduForm = computed(() => subDialog.form as unknown as EduForm)
const subCertForm = computed(() => subDialog.form as unknown as CertForm)
const subContractForm = computed(() => subDialog.form as unknown as ContractForm)

// 證照到期日 / 合約結束日共用的到期標籤：expired/expiring 才回傳 tag 資訊，
// ok 時回 null（畫面只顯示純日期文字）；none（無日期）不經此函式，由既有「永久」「未定」tag 處理。
function credentialExpiryTag(dateStr: unknown): { type: 'danger' | 'warning'; label: string } | null {
  const status = expiryStatus(typeof dateStr === 'string' ? dateStr : null)
  if (status.kind === 'expired') return { type: 'danger', label: '已逾期' }
  if (status.kind === 'expiring') return { type: 'warning', label: `${status.days} 天後到期` }
  return null
}
</script>

<template>
  <div class="cred-block">
    <!-- 學歷 -->
    <div class="cred-header">
      <h4>學歷</h4>
      <el-button type="primary" size="small" @click="openEduCreate">
        <el-icon><Plus /></el-icon> 新增學歷
      </el-button>
    </div>
    <el-table :data="educations" border size="small">
      <el-table-column prop="school_name" label="學校" min-width="140" />
      <el-table-column prop="major" label="科系" min-width="120" />
      <el-table-column prop="degree" label="學位" width="90" />
      <el-table-column prop="graduation_date" label="畢業日期" width="130" />
      <el-table-column label="最高學歷" width="90">
        <template #default="scope">
          <el-tag v-if="scope.row.is_highest" type="success" size="small">最高</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="備註" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="scope">
          <el-button link size="small" type="primary" @click="openEduEdit(scope.row)">編輯</el-button>
          <el-button link size="small" type="danger" @click="confirmDeleteSub('education', scope.row)">刪除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState title="尚無學歷資料" description="點擊上方「新增學歷」開始建立" />
      </template>
    </el-table>

    <!-- 證照 -->
    <div class="cred-header">
      <h4>證照</h4>
      <el-button type="primary" size="small" @click="openCertCreate">
        <el-icon><Plus /></el-icon> 新增證照
      </el-button>
    </div>
    <el-table :data="certificates" border size="small">
      <el-table-column prop="certificate_name" label="證照名稱" min-width="160" />
      <el-table-column prop="issuer" label="頒發機構" min-width="140" />
      <el-table-column prop="certificate_number" label="證照編號" min-width="140" />
      <el-table-column prop="issued_date" label="取得日期" width="130" />
      <el-table-column label="到期日" width="130">
        <template #default="scope">
          <template v-if="scope.row.expiry_date">
            <el-tag v-if="credentialExpiryTag(scope.row.expiry_date)?.type === 'danger'" size="small" type="danger">已逾期</el-tag>
            <el-tag v-else-if="credentialExpiryTag(scope.row.expiry_date)" size="small" type="warning">
              {{ credentialExpiryTag(scope.row.expiry_date)?.label }}
            </el-tag>
            <span v-else>{{ scope.row.expiry_date }}</span>
          </template>
          <el-tag v-else size="small" type="info">永久</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="備註" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="scope">
          <el-button link size="small" type="primary" @click="openCertEdit(scope.row)">編輯</el-button>
          <el-button link size="small" type="danger" @click="confirmDeleteSub('certificate', scope.row)">刪除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState title="尚無證照資料" description="點擊上方「新增證照」開始建立" />
      </template>
    </el-table>

    <!-- 合約 -->
    <div class="cred-header">
      <h4>合約</h4>
      <el-button type="primary" size="small" @click="openContractCreate">
        <el-icon><Plus /></el-icon> 新增合約
      </el-button>
    </div>
    <el-table :data="contracts" border size="small">
      <el-table-column prop="contract_type" label="類型" width="90" />
      <el-table-column prop="start_date" label="起始日" width="130" />
      <el-table-column label="結束日" width="130">
        <template #default="scope">
          <template v-if="scope.row.end_date">
            <el-tag v-if="credentialExpiryTag(scope.row.end_date)?.type === 'danger'" size="small" type="danger">已逾期</el-tag>
            <el-tag v-else-if="credentialExpiryTag(scope.row.end_date)" size="small" type="warning">
              {{ credentialExpiryTag(scope.row.end_date)?.label }}
            </el-tag>
            <span v-else>{{ scope.row.end_date }}</span>
          </template>
          <el-tag v-else size="small" type="info">未定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="簽約薪資" width="120">
        <template #default="scope">
          <span v-if="scope.row.salary_at_contract != null">{{ Number(scope.row.salary_at_contract).toLocaleString() }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="備註" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="scope">
          <el-button link size="small" type="primary" @click="openContractEdit(scope.row)">編輯</el-button>
          <el-button link size="small" type="danger" @click="confirmDeleteSub('contract', scope.row)">刪除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState title="尚無合約資料" description="點擊上方「新增合約」開始建立" />
      </template>
    </el-table>

    <!-- 學歷 / 證照 / 合約 共用子對話框 -->
    <el-dialog
      v-model="subDialog.visible"
      :title="subDialogTitle"
      width="560px"
      append-to-body
    >
      <!-- 學歷 -->
      <el-form v-if="subDialog.kind === 'education'" label-width="110px">
        <el-form-item label="學校名稱" required>
          <el-input v-model="subEduForm.school_name" />
        </el-form-item>
        <el-form-item label="科系">
          <el-input v-model="subEduForm.major" />
        </el-form-item>
        <el-form-item label="學位" required>
          <el-select v-model="subEduForm.degree" style="width:100%">
            <el-option v-for="d in DEGREE_OPTIONS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="畢業日期">
          <el-date-picker
            v-model="subEduForm.graduation_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
          />
        </el-form-item>
        <el-form-item label="最高學歷">
          <el-switch v-model="subEduForm.is_highest" />
          <span style="margin-left:10px;font-size:12px;color:var(--text-tertiary)">
            標記後，該員工其他學歷的「最高」會自動取消
          </span>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="subEduForm.remark" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>

      <!-- 證照 -->
      <el-form v-else-if="subDialog.kind === 'certificate'" label-width="110px">
        <el-form-item label="證照名稱" required>
          <el-input v-model="subCertForm.certificate_name" />
        </el-form-item>
        <el-form-item label="頒發機構">
          <el-input v-model="subCertForm.issuer" />
        </el-form-item>
        <el-form-item label="證照編號">
          <el-input v-model="subCertForm.certificate_number" />
        </el-form-item>
        <el-form-item label="取得日期">
          <el-date-picker
            v-model="subCertForm.issued_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
          />
        </el-form-item>
        <el-form-item label="到期日">
          <el-date-picker
            v-model="subCertForm.expiry_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
            placeholder="空值表示永久有效"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="subCertForm.remark" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>

      <!-- 合約 -->
      <el-form v-else-if="subDialog.kind === 'contract'" label-width="110px">
        <el-form-item label="合約類型" required>
          <el-select v-model="subContractForm.contract_type" style="width:100%">
            <el-option v-for="t in CONTRACT_TYPE_OPTIONS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始日" required>
          <el-date-picker
            v-model="subContractForm.start_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%"
          />
        </el-form-item>
        <el-form-item label="結束日">
          <el-date-picker
            v-model="subContractForm.end_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
            placeholder="空值表示未定"
          />
        </el-form-item>
        <el-form-item label="簽約薪資">
          <el-input-number
            v-model="subContractForm.salary_at_contract"
            :min="0" style="width:100%"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="subContractForm.remark" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="subDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitSub">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cred-header { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; }
.cred-header h4 { margin: 0; font-size: 14px; }
.cred-block > .cred-header:first-child { margin-top: 0; }
</style>
