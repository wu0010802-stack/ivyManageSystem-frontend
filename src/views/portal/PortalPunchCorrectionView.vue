<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { Warning } from '@element-plus/icons-vue'
import { getMyPunchCorrections, createMyPunchCorrection } from '@/api/portal'
import type { ApiBody } from '@/api/_generated/typed'
import { apiError } from '@/utils/error'
import { useIsMobile } from '@/composables/useIsMobile'
import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'
import PortalPunchCorrectionForm from '@/components/portal/PortalPunchCorrectionForm.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'

const { isMobile } = useIsMobile()

const loading = ref(false)
const submitLoading = ref(false)
const corrections = ref<Record<string, unknown>[]>([])

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})
// 動態年份（避免硬編 [2024..2027] 於 2028 斷頭）
const yearOptions = computed(() => {
  const y = now.getFullYear()
  return [y - 2, y - 1, y, y + 1]
})

const correctionTypes = [
  { value: 'punch_in',  label: '補上班打卡', description: '有下班記錄，但缺上班記錄' },
  { value: 'punch_out', label: '補下班打卡', description: '有上班記錄，但缺下班記錄' },
  { value: 'both',      label: '補全天打卡', description: '整日無任何打卡記錄' },
]

const showForm = ref(false)

const fetchCorrections = async () => {
  loading.value = true
  try {
    const res = await getMyPunchCorrections({ year: query.year, month: query.month })
    // 後端缺 response_model，res.data 為 unknown，narrow 成清單。
    corrections.value = res.data as Record<string, unknown>[]
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

const openForm = () => { showForm.value = true }

const submitCorrection = async (payload: Record<string, unknown>) => {
  submitLoading.value = true
  try {
    // 表單以 Record 形式 emit，依後端 PunchCorrectionCreate 契約送出。
    await createMyPunchCorrection(payload as ApiBody<'/portal/my-punch-corrections', 'post'>)
    ElMessage.success('補打卡申請已送出，待主管核准')
    showForm.value = false
    fetchCorrections()
  } catch (error) {
    ElMessage.error(apiError(error, '提交失敗'))
  } finally {
    submitLoading.value = false
  }
}

const statusTagType = (status: string) => {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

const statusLabel = (status: string) => {
  if (status === 'approved') return '已核准'
  if (status === 'rejected') return '已駁回'
  return '待核准'
}

const correctionTypeTagType = (type: string) => {
  if (type === 'punch_in') return 'warning'
  if (type === 'punch_out') return 'info'
  return 'danger'
}

const formatTime = (isoStr: string | null | undefined) => {
  if (!isoStr) return '-'
  return isoStr.slice(11, 16)
}

// 手機卡片視圖欄位設定（格式化函式沿用既有 formatTime/correctionTypeTagType/statusLabel）
const correctionCardColumns = [
  { label: '補正類型', prop: 'correction_type' },
  { label: '申請上班', prop: 'requested_punch_in',
    formatter: (item: Record<string, unknown>) => formatTime(item.requested_punch_in as string | null | undefined) },
  { label: '申請下班', prop: 'requested_punch_out',
    formatter: (item: Record<string, unknown>) => formatTime(item.requested_punch_out as string | null | undefined) },
  { label: '說明原因', prop: 'reason' },
  { label: '狀態', prop: 'approval_status' },
  { label: '核准人', prop: 'approved_by' },
  { label: '駁回原因', prop: 'rejection_reason',
    formatter: (item: Record<string, unknown>) => (item.rejection_reason as string) || '-' },
]

// 年/月連動時只觸發一次請求（防止使用者先改年再改月，送出兩次 API）
const _debouncedFetch = useDebounceFn(fetchCorrections, 200)
watch([() => query.year, () => query.month], _debouncedFetch)

onMounted(fetchCorrections)
</script>

<template>
  <div class="portal-punch-correction">
    <div class="page-header">
      <h2>補打卡申請</h2>
      <el-button type="primary" @click="openForm">新增申請</el-button>
    </div>

    <el-card class="notice-card">
      <div class="notice-content">
        <el-icon style="color: var(--el-color-warning); font-size: 16px;"><Warning /></el-icon>
        <span>若您遺忘打卡，請在此提交補打卡申請，由主管審核後系統將自動補正考勤記錄。</span>
      </div>
      <div class="type-grid">
        <div v-for="t in correctionTypes" :key="t.value" class="type-item">
          <el-tag :type="correctionTypeTagType(t.value)" size="small">{{ t.label }}</el-tag>
          <span>{{ t.description }}</span>
        </div>
      </div>
    </el-card>

    <el-card v-loading="loading">
      <div class="query-row">
        <el-select v-model="query.year" style="width: 100px;">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="query.month" style="width: 100px;">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
      </div>

      <el-table v-if="!isMobile" :data="corrections" border stripe style="margin-top: 12px;">
        <el-table-column prop="attendance_date" label="申請日期" width="120" />
        <el-table-column label="補正類型" width="120">
          <template #default="{ row }">
            <el-tag :type="correctionTypeTagType(row.correction_type)" size="small">
              {{ row.correction_type_label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申請上班" width="100">
          <template #default="{ row }">
            {{ formatTime(row.requested_punch_in) }}
          </template>
        </el-table-column>
        <el-table-column label="申請下班" width="100">
          <template #default="{ row }">
            {{ formatTime(row.requested_punch_out) }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="說明原因" />
        <el-table-column label="狀態" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.approval_status)" size="small">
              {{ statusLabel(row.approval_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="approved_by" label="核准人" width="100" />
        <el-table-column label="駁回原因" min-width="120">
          <template #default="{ row }">
            <span v-if="row.rejection_reason" style="color: var(--el-color-danger); font-size: 12px;">
              {{ row.rejection_reason }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 桌機空狀態；手機空狀態由 AdminListCards emptyText 負責 -->
      <el-empty v-if="!isMobile && !loading && corrections.length === 0" description="本月無補打卡申請記錄" />

      <!-- 手機卡片視圖；row-key="id" 對應後端 _format_correction 回傳 id 欄位 -->
      <AdminListCards
        v-else-if="isMobile"
        :items="corrections"
        :columns="correctionCardColumns"
        row-key="id"
        :loading="loading"
        empty-text="本月無補打卡申請記錄"
      >
        <template #title="{ item }">{{ item.attendance_date }}</template>
        <template #cell-correction_type="{ item }">
          <el-tag :type="correctionTypeTagType(item.correction_type as string)" size="small">
            {{ item.correction_type_label }}
          </el-tag>
        </template>
        <template #cell-approval_status="{ item }">
          <el-tag :type="statusTagType(item.approval_status as string)" size="small">
            {{ statusLabel(item.approval_status as string) }}
          </el-tag>
        </template>
      </AdminListCards>
    </el-card>

    <!-- Mobile: BottomSheet -->
    <TeacherBottomSheet
        v-if="isMobile"
        v-model="showForm"
        title="新增補打卡申請"
        default-snap="full"
        :snap-points="['full']"
    >
        <PortalPunchCorrectionForm
            v-if="showForm"
            :loading="submitLoading"
            @submit="submitCorrection"
            @cancel="showForm = false"
        />
    </TeacherBottomSheet>

    <!-- Desktop: el-dialog -->
    <el-dialog
        v-else
        v-model="showForm"
        title="新增補打卡申請"
        width="480px"
    >
        <PortalPunchCorrectionForm
            v-if="showForm"
            :loading="submitLoading"
            @submit="submitCorrection"
            @cancel="showForm = false"
        />
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text-primary);
}

.notice-card {
  margin-bottom: var(--space-4);
}

.notice-content {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.type-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.query-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

@media (--to-sm) {
  .type-grid {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
