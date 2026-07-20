<script setup lang="ts">
import { computed, ref, toRef, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { ArrowLeft, User } from '@element-plus/icons-vue'
import { useEmployeeDetail } from '@/composables/useEmployeeDetail'
import { getEmployeeStatus, standardSalaryFor, isMissingSalary } from '@/utils/employeeDisplay'
import { expiryStatus } from '@/utils/expiry'
import { getPositionSalary } from '@/api/config'
import { hasPermission } from '@/utils/auth'
import { useEmployeeStore } from '@/stores/employee'
import { useIsMobile } from '@/composables/useIsMobile'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import BasicSection from '@/components/employee/detail/BasicSection.vue'
import JobSection from '@/components/employee/detail/JobSection.vue'
import SalarySection from '@/components/employee/detail/SalarySection.vue'
import CredentialsSection from '@/components/employee/detail/CredentialsSection.vue'
import AttendanceSection from '@/components/employee/detail/AttendanceSection.vue'
import ClassHistorySection from '@/components/employee/detail/ClassHistorySection.vue'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'
import EmployeeFormDialog from '@/components/employee/EmployeeFormDialog.vue'

const props = defineProps<{ id: number }>()
const router = useRouter()
const { isMobile } = useIsMobile()
const employeeStore = useEmployeeStore()

const detail = useEmployeeDetail(toRef(props, 'id'))
const { employee, educations, certificates, contracts, classHistory, loading, error, subResourceErrors } = detail

const canWriteEmployees = computed(() => hasPermission('EMPLOYEES_WRITE'))

// #5 個資收合狀態：追蹤 el-collapse active，讓收合列文案隨狀態切換（收合提示可展開、展開提示可收合），
// 預設空陣列＝收合（維持既有「個資預設收合」行為）。
const basicInfoActive = ref<string[]>([])

// 標準薪比較（沿用清單頁的 position-salary 設定）
const positionSalaryConfig = ref<Record<string, number> | null>(null)
onMounted(async () => {
  try {
    positionSalaryConfig.value = (await getPositionSalary()).data as Record<string, number>
  } catch { /* 設定載入失敗只影響標準薪 hint，不擋頁 */ }
})
const standardSalary = computed(() =>
  employee.value ? standardSalaryFor(employee.value, positionSalaryConfig.value) : null
)

// 員工待辦列（finding #6）：掃描目前員工個資/證照/合約狀態，浮出待處理事項；
// 全部條件不成立時整列不渲染（見 template v-if="employeeTodos.length"）。
interface EmployeeTodo {
  key: string
  type: 'danger' | 'warning'
  label: string
  /** 點擊後 scrollToSection 的目標區塊 key */
  sectionKey: string
}
// 證照到期計數單一來源：employeeTodos 與錨點徽章共用，避免兩處口徑漂移
const certExpiryCounts = computed(() => {
  let expired = 0
  let expiring = 0
  for (const cert of certificates.value) {
    const status = expiryStatus(typeof cert.expiry_date === 'string' ? cert.expiry_date : null)
    if (status.kind === 'expired') expired++
    else if (status.kind === 'expiring') expiring++
  }
  return { expired, expiring }
})
const employeeTodos = computed<EmployeeTodo[]>(() => {
  const todos: EmployeeTodo[] = []
  const emp = employee.value
  // 待補薪資：單一來源 isMissingSalary（emp.utils）—— 在職 + 正職 + 底薪嚴格 === 0；
  // 遮罩後的 null／undefined 不觸發，避免無權限使用者誤判待辦
  if (emp && isMissingSalary(emp)) {
    todos.push({ key: 'missing-salary', type: 'danger', label: '待補薪資', sectionKey: 'salary' })
  }
  // 證照到期：逾期與 30 天內到期分開計數顯示（單一來源見上方 certExpiryCounts）
  if (certExpiryCounts.value.expired > 0) {
    todos.push({ key: 'cert-expired', type: 'danger', label: `證照已逾期 ${certExpiryCounts.value.expired}`, sectionKey: 'credentials' })
  }
  if (certExpiryCounts.value.expiring > 0) {
    todos.push({ key: 'cert-expiring', type: 'warning', label: `證照 30 天內到期 ${certExpiryCounts.value.expiring}`, sectionKey: 'credentials' })
  }
  // 合約到期：任一合約已逾期就顯示「已到期」（優先權高於「將到期」，故一遇到即 break）；
  // 否則若有將到期則顯示「將到期」——迴圈中能走到 'expiring' 分支時 contractKind 必仍是 null（見上方 break）。
  let contractKind: 'expired' | 'expiring' | null = null
  for (const contract of contracts.value) {
    const status = expiryStatus(typeof contract.end_date === 'string' ? contract.end_date : null)
    if (status.kind === 'expired') { contractKind = 'expired'; break }
    if (status.kind === 'expiring') contractKind = 'expiring'
  }
  if (contractKind === 'expired') todos.push({ key: 'contract-expired', type: 'danger', label: '合約已到期', sectionKey: 'credentials' })
  else if (contractKind === 'expiring') todos.push({ key: 'contract-expiring', type: 'warning', label: '合約將到期', sectionKey: 'credentials' })
  return todos
})

// 錨點導覽：職務優先、個資（含個資／隱私）預設收合下移一階，其餘沿用既有順序
const SECTIONS = [
  { key: 'job', label: '職務・班級' },
  { key: 'basic', label: '個資・聯絡' },
  { key: 'salary', label: '薪資・投保' },
  { key: 'credentials', label: '學歷・證照・合約' },
  { key: 'attendance', label: '出勤紀錄' },
] as const
const scrollToSection = (key: string) => {
  activeSectionKey.value = key
  document.getElementById(`emp-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 錨點 active：IntersectionObserver 追蹤視口內最上方的 section；
// happy-dom 無 IO（typeof 守衛跳過），測試環境退化為「點擊時設定」
const activeSectionKey = ref<string>(SECTIONS[0].key)
let sectionObserver: IntersectionObserver | null = null
const observeSections = () => {
  if (typeof IntersectionObserver === 'undefined') return
  sectionObserver?.disconnect()
  sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible.length) activeSectionKey.value = visible[0].target.id.replace('emp-sec-', '')
  }, { rootMargin: '-10% 0px -70% 0px' })
  for (const s of SECTIONS) {
    const el = document.getElementById(`emp-sec-${s.key}`)
    if (el) sectionObserver.observe(el)
  }
}
watch(employee, async (val) => {
  if (val) { await nextTick(); observeSections() }
}, { immediate: true })
onUnmounted(() => sectionObserver?.disconnect())

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/employees')
}

// 辦理離職
const offboardVisible = ref(false)
const onOffboarded = async () => {
  await detail.reloadCore().catch((e) => ElMessage.error(friendlyError('重新載入員工資料失敗', e)))
  employeeStore.fetchEmployees(true)
}

const reloadSub = (kind: 'education' | 'certificate' | 'contract') => {
  if (kind === 'education') detail.reloadEducations().catch((e) => ElMessage.error(friendlyError('重新載入員工資料失敗', e)))
  else if (kind === 'certificate') detail.reloadCertificates().catch((e) => ElMessage.error(friendlyError('重新載入員工資料失敗', e)))
  else detail.reloadContracts().catch((e) => ElMessage.error(friendlyError('重新載入員工資料失敗', e)))
}

// 編輯：接統一員工表單彈窗
const formDialog = ref<InstanceType<typeof EmployeeFormDialog> | null>(null)
const openEdit = () => { if (employee.value) formDialog.value?.openEdit(employee.value) }
const openEditSalary = () => { if (employee.value) formDialog.value?.openEdit(employee.value, 'salary') }
const onSaved = async () => {
  await detail.reloadCore().catch((e) => ElMessage.error(friendlyError('重新載入員工資料失敗', e)))
  employeeStore.fetchEmployees(true)
}
</script>

<template>
  <div class="employee-detail-page crisp-surface">
    <el-button link class="back-btn" @click="goBack">
      <el-icon><ArrowLeft /></el-icon> 返回員工列表
    </el-button>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false">
      <el-button size="small" style="margin-top:8px" @click="detail.load()">重試</el-button>
    </el-alert>
    <TableSkeleton v-else-if="loading && !employee" :columns="2" />

    <div v-else-if="employee" class="detail-layout" :class="{ 'is-mobile': isMobile }">
      <!-- 左欄：sticky 摘要 + 快速操作 + 錨點導覽 -->
      <aside class="detail-aside">
        <div class="avatar-placeholder"><el-icon :size="64" color="#909399"><User /></el-icon></div>
        <h3 class="emp-name">{{ employee.name || '—' }}</h3>
        <div class="emp-meta">
          <div><span class="meta-label">編號</span>{{ employee.employee_id || '—' }}</div>
          <div><span class="meta-label">教育局職稱</span>{{ employee.job_title_name || employee.title || '—' }}</div>
          <div v-if="employee.position"><span class="meta-label">園內職務</span>{{ employee.position }}</div>
          <div v-if="employee.classroom_name"><span class="meta-label">班級</span>{{ employee.classroom_name }}</div>
          <div style="margin-top:12px">
            <el-tag :type="getEmployeeStatus(employee).type" size="small">{{ getEmployeeStatus(employee).label }}</el-tag>
            <el-tag v-if="employee.supervisor_role" size="small" type="warning" style="margin-left:6px">{{ employee.supervisor_role }}</el-tag>
          </div>
        </div>
        <div v-if="canWriteEmployees" class="aside-actions">
          <el-button type="primary" plain size="small" @click="openEdit">編輯</el-button>
          <el-button v-if="employee.is_active" type="warning" plain size="small" @click="offboardVisible = true">辦理離職</el-button>
        </div>
        <nav class="anchor-nav" aria-label="區塊導覽">
          <a
            v-for="s in SECTIONS" :key="s.key" :href="`#emp-sec-${s.key}`"
            :class="['anchor-link', { 'is-active': activeSectionKey === s.key }]"
            @click.prevent="scrollToSection(s.key)"
          >
            {{ s.label }}
            <span v-if="s.key === 'credentials' && certExpiryCounts.expired > 0" class="anchor-badge is-danger">{{ certExpiryCounts.expired }} 已逾期</span>
            <span v-else-if="s.key === 'credentials' && certExpiryCounts.expiring > 0" class="anchor-badge is-warning">{{ certExpiryCounts.expiring }} 即將到期</span>
          </a>
        </nav>
      </aside>

      <!-- 右欄：單頁區塊 -->
      <main class="detail-sections">
        <!-- 員工待辦列（finding #6）：待補薪資 / 證照到期 / 合約到期，全部條件不成立則不渲染。
             子資源（證照/合約）載入失敗時 certificates/contracts 停留空陣列、待辦掃不到資料，
             故 subResourceErrors > 0 時仍渲染本列並補「可能不完整」提示，避免持久假陰性。 -->
        <div v-if="employeeTodos.length || subResourceErrors > 0" class="employee-todos">
          <el-tag
            v-for="todo in employeeTodos" :key="todo.key" :type="todo.type"
            class="todo-tag" role="button" tabindex="0"
            @click="scrollToSection(todo.sectionKey)"
            @keydown.enter.prevent="scrollToSection(todo.sectionKey)"
            @keydown.space.prevent="scrollToSection(todo.sectionKey)"
          >{{ todo.label }}</el-tag>
          <el-tag v-if="subResourceErrors > 0" type="info">部分資料載入失敗，待辦可能不完整</el-tag>
        </div>
        <el-alert v-if="subResourceErrors > 0" type="warning" show-icon :closable="false"
          title="部分區塊載入失敗，顯示可能不完整" style="margin-bottom:12px" />
        <section :id="`emp-sec-job`" class="detail-section">
          <h3 class="section-title">職務・班級</h3>
          <JobSection :employee="employee" />
          <h4 class="subsection-title">班級歷程</h4>
          <ClassHistorySection :rows="classHistory" :loading="loading" />
        </section>
        <section :id="`emp-sec-basic`" class="detail-section">
          <h3 class="section-title">個資・聯絡</h3>
          <el-collapse v-model="basicInfoActive">
            <el-collapse-item name="basic">
              <template #title>
                {{ basicInfoActive.includes('basic') ? '收合個資' : '展開查看聯絡電話・身分證・地址・緊急聯絡人' }}
              </template>
              <BasicSection :employee="employee" />
            </el-collapse-item>
          </el-collapse>
        </section>
        <section :id="`emp-sec-salary`" class="detail-section">
          <h3 class="section-title">薪資・投保</h3>
          <SalarySection :employee="employee" :standard-salary="standardSalary" :can-fix="canWriteEmployees" @fix-salary="openEditSalary" />
        </section>
        <section :id="`emp-sec-credentials`" class="detail-section">
          <h3 class="section-title">學歷・證照・合約</h3>
          <CredentialsSection
            :employee-id="id" :educations="educations" :certificates="certificates" :contracts="contracts"
            @reload="reloadSub"
          />
        </section>
        <section :id="`emp-sec-attendance`" class="detail-section">
          <h3 class="section-title">出勤紀錄</h3>
          <AttendanceSection :employee="employee" />
        </section>
      </main>
    </div>

    <OffboardingModal
      v-if="employee"
      v-model="offboardVisible"
      :employee-id="id"
      :employee-name="(employee.name as string) || ''"
      :initial-resign-date="(employee.resign_date as string | undefined) ?? null"
      @success="onOffboarded"
    />

    <EmployeeFormDialog ref="formDialog" @saved="onSaved" />
  </div>
</template>

<style scoped>
.back-btn { margin-bottom: 12px; }
.detail-layout { display: flex; gap: 20px; align-items: flex-start; }
.detail-aside {
  flex: 0 0 240px; position: sticky; top: 16px;
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px; padding: 20px 16px; text-align: center;
}
.detail-sections { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.employee-todos { display: flex; flex-wrap: wrap; gap: 8px; }
.employee-todos .todo-tag { cursor: pointer; }
.detail-section { background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 16px 20px; scroll-margin-top: 12px; }
.section-title { margin: 0 0 12px; font-size: 15px; }
.subsection-title { margin: 16px 0 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.avatar-placeholder { width: 96px; height: 96px; border-radius: 50%; background: var(--el-color-info-light-9); display: flex; align-items: center; justify-content: center; margin: 4px auto 12px; }
.emp-name { margin: 0 0 12px; font-size: 18px; }
.emp-meta { text-align: left; font-size: 13px; color: var(--el-text-color-regular); line-height: 1.9; padding: 0 4px; }
.emp-meta .meta-label { display: inline-block; width: 72px; color: var(--el-text-color-secondary); }
.aside-actions { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.anchor-nav { margin-top: 16px; border-top: 1px solid var(--el-border-color-lighter); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; text-align: left; }
.anchor-link { cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); padding: 4px 8px; border-radius: 6px; }
.anchor-link:hover { color: var(--el-color-primary); }
.anchor-link.is-active {
  background: var(--crisp-accent-soft);
  color: var(--brand-primary);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--brand-primary);
}
.anchor-badge { font-size: 11px; margin-left: 4px; }
.anchor-badge.is-danger { color: var(--color-danger-darker); }
.anchor-badge.is-warning { color: var(--crisp-pill-warning-text); }

/* 手機：左欄變頂部卡片、錨點變橫向 chip */
.detail-layout.is-mobile { flex-direction: column; }
.detail-layout.is-mobile .detail-aside { position: static; flex: 0 0 auto; width: 100%; }
.detail-layout.is-mobile .detail-sections { width: 100%; }
.detail-layout.is-mobile .anchor-nav { flex-direction: row; flex-wrap: wrap; gap: 10px; }
</style>
