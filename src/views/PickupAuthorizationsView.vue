<script setup lang="ts">
/**
 * 管理端：臨時接送授權總覽 + 行政代核銷。
 * 對應後端 api/pickup_authorizations.py（沿用 GUARDIANS_READ/WRITE，未新增權限碼）。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { extractErrorCode, extractErrorDetail } from '@/utils/error'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
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
const { isMobile } = useIsMobile()

// 手機卡片只留「要不要放行」需要看的欄位；授權家長、核銷方式等追溯欄位留在桌機表格。
const CARD_COLUMNS = [
  { label: '接送人', prop: 'person_name' },
  { label: '聯絡電話', prop: 'person_phone' },
  { label: '接送日', prop: 'pickup_date' },
]

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

    <!-- 篩選列：手機一律單欄。原本固定 :span="6" 在 375px 下每欄只剩約 85px，
         日期選擇器內容撐開後造成頁面級橫向溢出。 -->
    <el-row :gutter="12" class="filter-row">
      <el-col :xs="24" :sm="6">
        <el-date-picker
          v-model="dateFrom"
          type="date"
          placeholder="起日"
          value-format="YYYY-MM-DD"
          class="filter-control"
          @change="fetchData"
        />
      </el-col>
      <el-col :xs="24" :sm="6">
        <el-date-picker
          v-model="dateTo"
          type="date"
          placeholder="迄日"
          value-format="YYYY-MM-DD"
          class="filter-control"
          @change="fetchData"
        />
      </el-col>
      <el-col :xs="24" :sm="6">
        <el-select
          v-model="statusFilter"
          placeholder="狀態"
          class="filter-control"
          @change="fetchData"
        >
          <el-option
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
      </el-col>
    </el-row>

    <!-- 手機：9 欄表格要橫捲才按得到「核銷」，改任務卡片 -->
    <AdminListCards
      v-if="isMobile"
      :items="items"
      :columns="CARD_COLUMNS"
      row-key="id"
      :loading="loading"
      empty-text="今日無接送授權"
    >
      <template #title="{ item }">
        <div class="card-title">
          <img
            v-if="item.photo_url"
            :src="String(item.photo_url)"
            alt="接送人照片"
            class="thumb"
          />
          <span class="card-title__name">{{ item.student_name }}</span>
          <span class="card-title__class">{{ item.classroom_name }}</span>
          <el-tag
            :type="STATUS_TAG[String(item.effective_status)] || 'info'"
            size="small"
          >
            {{ STATUS_LABEL[String(item.effective_status)] || item.effective_status }}
          </el-tag>
        </div>
      </template>
      <template #cell-person_name="{ item }">
        {{ item.person_name }}（{{ item.person_relation }}）
      </template>
      <template #actions="{ item }">
        <el-button
          v-if="canWrite && item.effective_status === 'active'"
          data-test="pickup-card-verify"
          type="primary"
          @click="openVerify(item as unknown as PickupAuth)"
        >核銷</el-button>
      </template>
    </AdminListCards>

    <el-table v-else :data="items" v-loading="loading" style="width: 100%">
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

    <!-- 手機滿版：核銷要看照片＋輸入 6 位碼，虛擬鍵盤彈出時 480px 置中 dialog
         的底部按鈕會被蓋住。滿版下 main.css 的 dialog 殼層讓 footer 常駐可見。 -->
    <el-dialog
      v-model="verifyDialogOpen"
      title="接送核銷"
      width="480px"
      :fullscreen="isMobile"
    >
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
.card-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.card-title__class {
  font-size: var(--text-sm);
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}

@media (--to-sm) {
  /* 外層 .content-container 已有 padding，這裡再補一層會吃掉窄機寬度 */
  .pickup-auth-admin-view {
    padding: 0;
  }
  .filter-row :deep(.el-col) {
    margin-bottom: var(--space-2);
  }
  /* 單欄後控制項撐滿，避免右側留一段空白且觸控目標偏窄。桌機不套，版面零變動。 */
  .filter-control {
    width: 100%;
  }
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
