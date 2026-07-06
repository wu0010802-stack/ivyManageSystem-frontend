<script setup lang="ts">
import { computed, ref, toRef, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, User } from '@element-plus/icons-vue'
import { useEmployeeDetail } from '@/composables/useEmployeeDetail'
import { getEmployeeStatus, standardSalaryFor } from '@/utils/employeeDisplay'
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

const props = defineProps<{ id: number }>()
const router = useRouter()
const { isMobile } = useIsMobile()
const employeeStore = useEmployeeStore()

const detail = useEmployeeDetail(toRef(props, 'id'))
const { employee, educations, certificates, contracts, classHistory, loading, error, subResourceErrors } = detail

const canWriteEmployees = computed(() => hasPermission('EMPLOYEES_WRITE'))

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

// 錨點導覽
const SECTIONS = [
  { key: 'basic', label: '基本資料' },
  { key: 'job', label: '職務・班級' },
  { key: 'salary', label: '薪資・投保' },
  { key: 'credentials', label: '學歷・證照・合約' },
  { key: 'attendance', label: '出勤紀錄' },
] as const
const scrollToSection = (key: string) => {
  document.getElementById(`emp-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/employees')
}

// 辦理離職
const offboardVisible = ref(false)
const onOffboarded = async () => {
  await detail.reloadCore().catch(() => ElMessage.error('重新載入失敗'))
  employeeStore.fetchEmployees(true)
}

const reloadSub = (kind: 'education' | 'certificate' | 'contract') => {
  if (kind === 'education') detail.reloadEducations().catch(() => ElMessage.error('重新載入失敗'))
  else if (kind === 'certificate') detail.reloadCertificates().catch(() => ElMessage.error('重新載入失敗'))
  else detail.reloadContracts().catch(() => ElMessage.error('重新載入失敗'))
}
</script>

<template>
  <div class="employee-detail-page">
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
          <div><span class="meta-label">職稱</span>{{ employee.job_title_name || employee.title || '—' }}</div>
          <div v-if="employee.position"><span class="meta-label">職位</span>{{ employee.position }}</div>
          <div v-if="employee.classroom_name"><span class="meta-label">班級</span>{{ employee.classroom_name }}</div>
          <div style="margin-top:12px">
            <el-tag :type="getEmployeeStatus(employee).type" size="small">{{ getEmployeeStatus(employee).label }}</el-tag>
            <el-tag v-if="employee.supervisor_role" size="small" type="warning" style="margin-left:6px">{{ employee.supervisor_role }}</el-tag>
          </div>
        </div>
        <div v-if="canWriteEmployees" class="aside-actions">
          <!-- 編輯按鈕於 Task 8 接 EmployeeFormDialog -->
          <el-button v-if="employee.is_active" type="warning" plain size="small" @click="offboardVisible = true">辦理離職</el-button>
        </div>
        <nav class="anchor-nav" aria-label="區塊導覽">
          <a v-for="s in SECTIONS" :key="s.key" class="anchor-link" @click.prevent="scrollToSection(s.key)">{{ s.label }}</a>
        </nav>
      </aside>

      <!-- 右欄：單頁區塊 -->
      <main class="detail-sections">
        <el-alert v-if="subResourceErrors > 0" type="warning" show-icon :closable="false"
          title="部分區塊載入失敗，顯示可能不完整" style="margin-bottom:12px" />
        <section :id="`emp-sec-basic`" class="detail-section">
          <h3 class="section-title">基本資料</h3>
          <BasicSection :employee="employee" />
        </section>
        <section :id="`emp-sec-job`" class="detail-section">
          <h3 class="section-title">職務・班級</h3>
          <JobSection :employee="employee" />
          <h4 class="subsection-title">班級歷程</h4>
          <ClassHistorySection :rows="classHistory" :loading="loading" />
        </section>
        <section :id="`emp-sec-salary`" class="detail-section">
          <h3 class="section-title">薪資・投保</h3>
          <SalarySection :employee="employee" :standard-salary="standardSalary" />
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
      @success="onOffboarded"
    />
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
.detail-section { background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 16px 20px; scroll-margin-top: 12px; }
.section-title { margin: 0 0 12px; font-size: 15px; }
.subsection-title { margin: 16px 0 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.avatar-placeholder { width: 96px; height: 96px; border-radius: 50%; background: var(--el-color-info-light-9); display: flex; align-items: center; justify-content: center; margin: 4px auto 12px; }
.emp-name { margin: 0 0 12px; font-size: 18px; }
.emp-meta { text-align: left; font-size: 13px; color: var(--el-text-color-regular); line-height: 1.9; padding: 0 4px; }
.emp-meta .meta-label { display: inline-block; width: 48px; color: var(--el-text-color-secondary); }
.aside-actions { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.anchor-nav { margin-top: 16px; border-top: 1px solid var(--el-border-color-lighter); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; text-align: left; }
.anchor-link { cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); }
.anchor-link:hover { color: var(--el-color-primary); }

/* 手機：左欄變頂部卡片、錨點變橫向 chip */
.detail-layout.is-mobile { flex-direction: column; }
.detail-layout.is-mobile .detail-aside { position: static; flex: 0 0 auto; width: 100%; }
.detail-layout.is-mobile .anchor-nav { flex-direction: row; flex-wrap: wrap; gap: 10px; }
</style>
