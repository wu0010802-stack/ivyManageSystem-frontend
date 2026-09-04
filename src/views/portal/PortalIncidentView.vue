<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyClassIncidents, createPortalIncident } from '@/api/studentIncidents'
import { getMyStudents } from '@/api/portal'
import { INCIDENT_TYPES, SEVERITIES, INCIDENT_TYPE_TAG as _TYPE_TAG, SEVERITY_TAG as _SEVERITY_TAG } from '@/constants/studentRecords'
import { useIsMobile } from '@/composables/useIsMobile'
import AdminListCards from '@/components/common/AdminListCards.vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import { Plus } from '@element-plus/icons-vue'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
const TYPE_TAG = _TYPE_TAG as Record<string, ElTagType>
const SEVERITY_TAG = _SEVERITY_TAG as Record<string, ElTagType>
import { usePortalFromHub } from '@/composables/usePortalFromHub'

const { fromHub, backToHub } = usePortalFromHub()
const { isMobile } = useIsMobile()

// ── 班級/學生 ─────────────────────────────────────────
interface ClassroomStudent { id: number; name: string; [key: string]: unknown }
interface ClassroomItem { classroom_id: number; classroom_name: string; students: ClassroomStudent[] }
const classrooms = ref<ClassroomItem[]>([])      // [{ classroom_id, classroom_name, students: [...] }]
const activeClassroom = ref('')
const classLoading = ref(false)

// ── 事件列表 ──────────────────────────────────────────
const incidents = ref<Record<string, unknown>[]>([])
const total = ref(0)
// 先前寫死 limit=100 且無分頁，卻顯示未截斷的 total：畫面寫「共 350 筆」但只有
// 100 列，第 101 筆之後永遠看不到。後端早就支援 skip/limit（le=200）。
const currentPage = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterType = ref<string | null>(null)
const filterDateRange = ref<string[]>([])

// ── Dialog ────────────────────────────────────────────
const dialogVisible = ref(false)
const formLoading = ref(false)

const emptyForm = () => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
})
const form = reactive(emptyForm())

const currentStudents = ref<ClassroomStudent[]>([])

const fetchMyStudents = async () => {
  classLoading.value = true
  try {
    const res = await getMyStudents()
    classrooms.value = res.data.classrooms || []
    if (classrooms.value.length > 0) {
      activeClassroom.value = String(classrooms.value[0].classroom_id)
      currentStudents.value = classrooms.value[0].students || []
    }
  } catch {
    ElMessage.error('載入班級資料失敗')
  } finally {
    classLoading.value = false
  }
}

const onTabChange = (cid: string | number) => {
  const cr = classrooms.value.find(c => String(c.classroom_id) === String(cid))
  currentStudents.value = cr ? cr.students : []
  filterType.value = null
  filterDateRange.value = []
  currentPage.value = 1
  fetchIncidents()
}

const fetchIncidents = async () => {
  if (!activeClassroom.value) return
  loading.value = true
  try {
    const params: { classroom_id: number; skip: number; limit: number; incident_type?: string; start_date?: string; end_date?: string } = {
      classroom_id: Number(activeClassroom.value),
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (filterType.value) params.incident_type = filterType.value
    if (filterDateRange.value?.length === 2) {
      params.start_date = filterDateRange.value[0]
      params.end_date = filterDateRange.value[1]
    }
    const res = await getMyClassIncidents(params)
    incidents.value = res.data.items
    total.value = res.data.total
  } catch {
    ElMessage.error('載入事件紀錄失敗')
  } finally {
    loading.value = false
  }
}

// currentPage / pageSize 變動時重新查詢（宣告須晚於 fetchIncidents，否則 TDZ）
watch([currentPage, pageSize], fetchIncidents)

const openCreate = () => {
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.student_id || !form.incident_type || !form.occurred_at || !form.description) {
    ElMessage.warning('請填寫必填欄位（學生、類型、發生時間、描述）')
    return
  }

  formLoading.value = true
  try {
    await createPortalIncident({
      student_id: form.student_id,
      incident_type: form.incident_type,
      severity: form.severity || null,
      occurred_at: form.occurred_at,
      description: form.description,
      action_taken: form.action_taken || null,
      parent_notified: form.parent_notified,
    })
    ElMessage.success('新增成功')
    dialogVisible.value = false
    fetchIncidents()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '新增失敗')
  } finally {
    formLoading.value = false
  }
}

const truncate = (text: string, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

// ── 手機卡片欄設定（truncate 已定義，可安全引用）────────────
const incidentCardColumns = [
  {
    label: '發生時間',
    prop: 'occurred_at',
    formatter: (item: Record<string, unknown>) =>
      item.occurred_at ? String(item.occurred_at).slice(0, 16).replace('T', ' ') : '-',
  },
  { label: '類型', prop: 'incident_type' },      // tag → #cell-incident_type
  { label: '嚴重程度', prop: 'severity' },        // tag → #cell-severity
  {
    label: '描述',
    prop: 'description',
    formatter: (item: Record<string, unknown>) => truncate(item.description as string),
  },
  { label: '通知家長', prop: 'parent_notified' }, // tag → #cell-parent_notified
]

onMounted(async () => {
  await fetchMyStudents()
  fetchIncidents()
})
</script>

<template>
  <div>
    <PortalPageHeader
      title="事件紀錄"
      :back-label="fromHub ? '返回今日工作台' : ''"
      @back="backToHub"
    >
      <template #actions>
        <el-button type="primary" size="small" :icon="Plus" @click="openCreate">新增事件</el-button>
      </template>
    </PortalPageHeader>

    <el-tabs
      v-if="classrooms.length > 0"
      v-model="activeClassroom"
      @tab-change="onTabChange"
      v-loading="classLoading"
    >
      <el-tab-pane
        v-for="cr in classrooms"
        :key="cr.classroom_id"
        :label="cr.classroom_name"
        :name="String(cr.classroom_id)"
      />
    </el-tabs>

    <!-- 篩選列 -->
    <el-row :gutter="12" style="margin-bottom: 16px">
      <el-col :xs="12" :sm="6">
        <el-select v-model="filterType" placeholder="事件類型" clearable size="small" style="width: 100%">
          <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-col>
      <el-col :xs="24" :sm="10">
        <el-date-picker
          v-model="filterDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="開始"
          end-placeholder="結束"
          value-format="YYYY-MM-DD"
          size="small"
          style="width: 100%"
        />
      </el-col>
      <el-col :xs="12" :sm="4">
        <el-button size="small" @click="fetchIncidents">查詢</el-button>
        <el-button size="small" @click="filterType = null; filterDateRange = []; fetchIncidents()">重置</el-button>
      </el-col>
    </el-row>

    <!-- 事件表格（桌機）／卡片（手機） -->
    <el-table v-if="!isMobile" :data="incidents" v-loading="loading" stripe size="small">
      <el-table-column label="發生時間" width="145">
        <template #default="{ row }">
          {{ row.occurred_at ? row.occurred_at.slice(0, 16).replace('T', ' ') : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="學生姓名" width="90" prop="student_name" />
      <el-table-column label="類型" width="90">
        <template #default="{ row }">
          <el-tag :type="TYPE_TAG[row.incident_type]" size="small">{{ row.incident_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="嚴重程度" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.severity" :type="SEVERITY_TAG[row.severity]" size="small">{{ row.severity }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="描述" min-width="160">
        <template #default="{ row }">
          <el-tooltip :content="row.description" placement="top" :show-after="500">
            <span>{{ truncate(row.description) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="通知家長" width="85" align="center">
        <template #default="{ row }">
          <el-tag :type="row.parent_notified ? 'success' : 'info'" size="small">
            {{ row.parent_notified ? '已通知' : '未通知' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- 手機卡片視圖（incidents 的 DB PK 欄位為 id，已確認 incident_to_dict 回傳 id） -->
    <AdminListCards
      v-else
      :items="incidents"
      :columns="incidentCardColumns"
      row-key="id"
      :loading="loading"
      empty-text="目前沒有事件紀錄"
    >
      <template #title="{ item }">{{ item.student_name || '（未指定學生）' }}</template>
      <template #cell-incident_type="{ item }">
        <el-tag :type="TYPE_TAG[item.incident_type as string]" size="small">{{ item.incident_type }}</el-tag>
      </template>
      <template #cell-severity="{ item }">
        <el-tag v-if="item.severity" :type="SEVERITY_TAG[item.severity as string]" size="small">{{ item.severity }}</el-tag>
        <span v-else>-</span>
      </template>
      <template #cell-parent_notified="{ item }">
        <el-tag :type="item.parent_notified ? 'success' : 'info'" size="small">
          {{ item.parent_notified ? '已通知' : '未通知' }}
        </el-tag>
      </template>
    </AdminListCards>

    <!-- 0 筆時不畫分頁：空清單配「共 0 筆・20項/頁・‹1›」只是噪音（P2-06） -->
    <div v-if="total > 0" class="pt-list-footer">
      <span class="pt-list-total">共 {{ total }} 筆紀錄</span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="sizes, prev, pager, next"
        background
        small
      />
    </div>

    <!-- 新增 Dialog -->
    <el-dialog v-model="dialogVisible" title="新增事件紀錄" width="500px">
      <el-form label-width="90px">
        <el-form-item label="學生 *">
          <el-select v-model="form.student_id" placeholder="選擇學生" style="width: 100%">
            <el-option v-for="s in currentStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="事件類型 *">
          <el-select v-model="form.incident_type" placeholder="選擇類型" style="width: 100%">
            <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="嚴重程度">
          <el-select v-model="form.severity" placeholder="選擇嚴重程度" clearable style="width: 100%">
            <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="發生時間 *">
          <el-date-picker
            v-model="form.occurred_at"
            type="datetime"
            placeholder="選擇日期時間"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="事件描述 *">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="請描述事件經過"
          />
        </el-form-item>
        <el-form-item label="處置方式">
          <el-input
            v-model="form.action_taken"
            type="textarea"
            :rows="2"
            placeholder="已採取的處置措施"
          />
        </el-form-item>
        <el-form-item label="通知家長">
          <el-checkbox v-model="form.parent_notified">已通知家長</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="submitForm">確認</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pt-list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.pt-list-total {
  font-size: 13px;
  color: var(--text-secondary);
}

</style>
