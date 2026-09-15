<script setup lang="ts">
/**
 * 管理端：臨時接送授權總覽 + 行政代核銷。
 * 對應後端 api/pickup_authorizations.py（沿用 GUARDIANS_READ/WRITE，未新增權限碼）。
 *
 * 2026-09-15 UI/UX 改版（審查見 memory
 * project_pickup_authorizations_uiux_mockup_2026_09_15）：三段式範圍（今天／即將
 * 到來／歷史）取代空白日期框、搜尋＋帶計數狀態篩選、待確認排最前、接送人合併欄、
 * 「交接紀錄」取代「核銷方式」、彈窗常駐「改用人工核對」＋剩餘次數＋彈窗內成功態。
 * 「核銷」→「確認交接」僅動管理端（Q1 裁定：教師端／POS 語彙本次不動）。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { extractErrorCode, extractErrorDetail } from '@/utils/error'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import AdminListToolbar, { type FilterGroup } from '@/components/common/AdminListToolbar.vue'
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
  code_attempts: number
  completed_at: string | null
  completed_via: string | null
  completed_by_name: string | null
  override_note: string | null
  cancelled_at: string | null
  created_at: string
  [key: string]: unknown
}

const canWrite = computed(() => hasPermission('GUARDIANS_WRITE'))
const { isMobile } = useIsMobile()

// 驗碼連錯上限，需與後端 services/pickup_verification.py::_MAX_ATTEMPTS 對齊。
const MAX_CODE_ATTEMPTS = 5

// 手機卡片只留「要不要放行」需要看的欄位；授權家長、交接紀錄等追溯欄位留在桌機表格。
const CARD_COLUMNS = [
  { label: '接送人', prop: 'person_name' },
  { label: '聯絡電話', prop: 'person_phone' },
  { label: '接送日', prop: 'pickup_date' },
]

// 待確認排最前、已處理降灰（不改變後端排序，只影響畫面呈現順序）。
const STATUS_LABEL: Record<string, string> = {
  active: '待確認', completed: '已交接', cancelled: '已取消', expired: '已過期',
}
type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const STATUS_TAG: Record<string, ElTagType> = {
  active: 'primary', completed: 'success', cancelled: 'info', expired: 'info',
}

function taipeiToday(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join('-')
}

function formatPickupDate(dateStr: string): string {
  const today = taipeiToday()
  const tomorrow = taipeiToday(1)
  if (dateStr === today) return '今天'
  if (dateStr === tomorrow) return '明天'
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（${weekday}）`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.includes('T') || iso.includes(' ') ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ── 範圍：今天／即將到來／歷史 ──────────────────────────────────────────
type Scope = 'today' | 'upcoming' | 'history'
const scope = ref<Scope>('today')
const historyRange = ref<[string, string]>([taipeiToday(-30), taipeiToday(-1)])

const items = ref<PickupAuth[]>([])
const loading = ref(false)

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (scope.value === 'upcoming') {
      params.date_from = taipeiToday(1)
      params.date_to = taipeiToday(14)
    } else if (scope.value === 'history') {
      params.date_from = historyRange.value[0]
      params.date_to = historyRange.value[1]
    }
    // scope === 'today'：不帶日期參數，沿用後端「無日期參數即今日」的預設。
    const { data } = await listPickupAuthorizations(params)
    items.value = (data as { items?: PickupAuth[] })?.items || []
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

function onScopeChange(next: string | number | boolean | undefined) {
  scope.value = next as Scope
  statusFilter.value = ''
  fetchData()
}

watch(historyRange, () => {
  if (scope.value === 'history') fetchData()
})

// ── 搜尋 + 狀態篩選（前端過濾，不重打 API） ───────────────────────────────
const search = ref('')
const statusFilter = ref('')

const statusCounts = computed(() => {
  const c: Record<string, number> = { active: 0, completed: 0, cancelled: 0, expired: 0 }
  items.value.forEach((i) => {
    if (c[i.effective_status] !== undefined) c[i.effective_status] += 1
  })
  return c
})

const filterGroups = computed<FilterGroup[]>(() => [
  {
    key: 'status',
    label: '狀態',
    options: [
      { value: 'active', label: `待確認（${statusCounts.value.active}）` },
      { value: 'completed', label: `已交接（${statusCounts.value.completed}）` },
      { value: 'cancelled', label: `已取消（${statusCounts.value.cancelled}）` },
      { value: 'expired', label: `已過期（${statusCounts.value.expired}）` },
    ],
  },
])
const filterValues = computed(() => ({ status: statusFilter.value || undefined }))
function onFilterChange(next: Record<string, unknown>) {
  statusFilter.value = (next.status as string) || ''
}

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = items.value
  if (statusFilter.value) {
    list = list.filter((i) => i.effective_status === statusFilter.value)
  }
  if (q) {
    list = list.filter((i) =>
      [i.student_name, i.person_name, i.person_phone].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      ),
    )
  }
  // 待確認（active）排最前，其餘依接送日排序。
  return [...list].sort((a, b) => {
    const aTodo = a.effective_status === 'active' ? 0 : 1
    const bTodo = b.effective_status === 'active' ? 0 : 1
    if (aTodo !== bTodo) return aTodo - bTodo
    return a.pickup_date < b.pickup_date ? -1 : a.pickup_date > b.pickup_date ? 1 : 0
  })
})

const todoCount = computed(() => statusCounts.value.active)

function recordSummary(item: PickupAuth): string {
  if (item.status === 'cancelled') {
    return item.cancelled_at ? `家長 ${formatDateTime(item.cancelled_at)} 取消` : '家長已取消'
  }
  if (item.status === 'completed') {
    const via = item.completed_via === 'code' ? '驗碼'
      : item.completed_via === 'override' ? '人工核對'
      : item.completed_via === 'visual_match' ? '目視比對' : ''
    const parts = [formatDateTime(item.completed_at), via, item.completed_by_name].filter(Boolean)
    return parts.join(' · ')
  }
  return '—'
}

// ── 確認交接 ────────────────────────────────────────────────────────────
const verifyTarget = ref<PickupAuth | null>(null)
const verifyDialogOpen = ref(false)
const codeInput = ref('')
const overrideMode = ref(false)
const overrideNote = ref('')
const verifying = ref(false)
const codeInputRef = ref<{ focus: () => void } | null>(null)
const successResult = reactive<{ show: boolean; via: string }>({ show: false, via: '' })

const remainingAttempts = computed(() => {
  if (!verifyTarget.value) return MAX_CODE_ATTEMPTS
  return Math.max(0, MAX_CODE_ATTEMPTS - (verifyTarget.value.code_attempts || 0))
})

function openVerify(item: PickupAuth) {
  verifyTarget.value = item
  codeInput.value = ''
  overrideMode.value = item.code_locked
  overrideNote.value = ''
  successResult.show = false
  verifyDialogOpen.value = true
}

function closeVerify() {
  verifyDialogOpen.value = false
  verifyTarget.value = null
  successResult.show = false
}

function onDialogOpened() {
  if (!overrideMode.value) {
    void nextTick(() => codeInputRef.value?.focus())
  }
}

function onCodeInput(value: string) {
  codeInput.value = value.replace(/\D/g, '').slice(0, 6)
}

function onCodeEnter() {
  if (codeInput.value.length === 6 && !verifying.value) submitVerify()
}

async function submitVerify() {
  const target = verifyTarget.value
  if (!target) return
  verifying.value = true
  try {
    await verifyPickupAuthorization(target.id, { code: codeInput.value })
    successResult.via = '驗碼'
    successResult.show = true
    fetchData()
  } catch (err) {
    const code = extractErrorCode(err)
    if (code === 'code_locked') {
      overrideMode.value = true
      target.code_locked = true
      ElMessage.warning('驗碼已鎖定，請人工核對證件後送出')
    } else {
      // 後端已同步累計連錯次數；本地即時 +1 讓「還可再試 N 次」不必等重新整理。
      target.code_attempts = (target.code_attempts || 0) + 1
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
    successResult.via = '人工核對'
    successResult.show = true
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
    <PageHeader
      :title="PAGE_TERMS.pickupAuthorizations"
      subtitle="家長在 LINE 家長端授權的臨時接送人；到園時在這裡確認交接。"
    />

    <div class="scope-row">
      <el-radio-group :model-value="scope" @update:model-value="onScopeChange">
        <el-radio-button value="today">今天</el-radio-button>
        <el-radio-button value="upcoming">即將到來</el-radio-button>
        <el-radio-button value="history">歷史</el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="scope === 'history'"
        v-model="historyRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="起日"
        end-placeholder="迄日"
        class="history-range"
      />
      <span v-else class="scope-day">{{ formatPickupDate(taipeiToday()) }}</span>
      <span class="scope-count" data-test="scope-count">
        {{ scope === 'today' ? '今天' : scope === 'upcoming' ? '即將到來' : '這段期間' }}
        <strong>{{ items.length }}</strong> 筆
        <template v-if="todoCount">· <strong>{{ todoCount }}</strong> 筆待確認</template>
      </span>
    </div>

    <AdminListToolbar
      v-model:search="search"
      search-placeholder="搜尋學生、接送人或電話"
      :filters="filterGroups"
      :filter-values="filterValues"
      :total="items.length"
      :shown="filteredItems.length"
      @update:filter-values="onFilterChange"
    />

    <!-- 手機：9 欄表格要橫捲才按得到，改任務卡片 -->
    <AdminListCards
      v-if="isMobile"
      :items="filteredItems"
      :columns="CARD_COLUMNS"
      row-key="id"
      :loading="loading"
      empty-text="今天沒有臨時接送授權；家長在 LINE 家長端建立後會立刻出現在這裡"
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
          <el-tag v-if="item.code_locked" type="warning" size="small">驗碼已鎖</el-tag>
        </div>
      </template>
      <template #cell-person_name="{ item }">
        {{ item.person_name }}（{{ item.person_relation }}）
      </template>
      <template #actions="{ item }">
        <el-button
          v-if="canWrite && item.effective_status === 'active' && !item.code_locked"
          data-test="pickup-card-verify"
          type="primary"
          :aria-label="`確認${item.student_name}的接送交接`"
          @click="openVerify(item as unknown as PickupAuth)"
        >確認交接</el-button>
        <el-button
          v-else-if="canWrite && item.effective_status === 'active' && item.code_locked"
          data-test="pickup-card-verify"
          type="warning"
          :aria-label="`人工核對${item.student_name}的接送人證件`"
          @click="openVerify(item as unknown as PickupAuth)"
        >人工核對</el-button>
      </template>
    </AdminListCards>

    <el-table v-else :data="filteredItems" v-loading="loading" style="width: 100%">
      <el-table-column label="學生" width="120">
        <template #default="{ row }">
          <div class="cell-name">{{ row.student_name }}</div>
          <div class="cell-sub">{{ row.classroom_name }}</div>
        </template>
      </el-table-column>
      <el-table-column label="接送人" min-width="200">
        <template #default="{ row }">
          <div class="person-cell">
            <img v-if="row.photo_url" :src="row.photo_url" alt="接送人照片" class="thumb" />
            <div v-else class="thumb thumb--none" aria-hidden="true" />
            <div>
              <div class="cell-name">{{ row.person_name }}<span class="rel-tag">{{ row.person_relation }}</span></div>
              <div class="cell-sub"><a :href="`tel:${row.person_phone}`">{{ row.person_phone }}</a></div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="授權家長" width="140">
        <template #default="{ row }">
          <div class="cell-name">{{ row.parent_name || '—' }}</div>
          <div class="cell-sub">{{ formatDateTime(row.created_at) }} 授權</div>
        </template>
      </el-table-column>
      <el-table-column label="接送日" width="100">
        <template #default="{ row }">{{ formatPickupDate(row.pickup_date) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="150">
        <template #default="{ row }">
          <div class="status-cell">
            <el-tag :type="STATUS_TAG[row.effective_status] || 'info'">
              {{ STATUS_LABEL[row.effective_status] || row.effective_status }}
            </el-tag>
            <el-tag v-if="row.code_locked" type="warning" size="small">
              驗碼已鎖 · 錯 {{ row.code_attempts }} 次
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="交接紀錄" min-width="220">
        <template #default="{ row }">
          <div class="record-cell">
            <span>{{ recordSummary(row) }}</span>
            <span v-if="row.override_note" class="record-note">{{ row.override_note }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="" width="130">
        <template #default="{ row }">
          <el-button
            v-if="row.effective_status === 'active' && !row.code_locked"
            type="primary"
            size="small"
            :aria-label="`確認${row.student_name}的接送交接`"
            @click="openVerify(row)"
          >確認交接</el-button>
          <el-button
            v-else-if="row.effective_status === 'active' && row.code_locked"
            type="warning"
            size="small"
            :aria-label="`人工核對${row.student_name}的接送人證件`"
            @click="openVerify(row)"
          >人工核對</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span>{{ scope === 'today' ? '今天沒有臨時接送授權' : '這段期間沒有資料' }}</span>
      </template>
    </el-table>

    <!-- 手機滿版：確認交接要看照片＋輸入 6 位碼，虛擬鍵盤彈出時 480px 置中 dialog
         的底部按鈕會被蓋住。滿版下 main.css 的 dialog 殼層讓 footer 常駐可見。 -->
    <el-dialog
      v-model="verifyDialogOpen"
      title="確認交接"
      width="600px"
      :fullscreen="isMobile"
      @opened="onDialogOpened"
    >
      <template v-if="verifyTarget && !successResult.show">
        <p class="verify-target-name">
          {{ verifyTarget.student_name }} · {{ verifyTarget.classroom_name }} · {{ formatPickupDate(verifyTarget.pickup_date) }}
        </p>

        <div v-if="overrideMode && verifyTarget.code_locked" class="locked-banner" role="alert">
          取件碼已連續輸錯 {{ MAX_CODE_ATTEMPTS }} 次，已鎖定。只能人工核對證件放行；
          家長也可以在 LINE 家長端重發新碼，重發後即可再驗碼。
        </div>

        <div class="dlg-body">
          <div class="dlg-left">
            <img
              v-if="verifyTarget.photo_url"
              :src="verifyTarget.photo_url"
              alt="接送人照片"
              class="verify-photo"
            />
            <div v-else class="verify-photo verify-photo--none">家長未上傳照片，請以證件姓名比對</div>
            <ul class="facts">
              <li><strong>{{ verifyTarget.person_name }}</strong>（{{ verifyTarget.person_relation }}）</li>
              <li><a :href="`tel:${verifyTarget.person_phone}`">{{ verifyTarget.person_phone }}</a></li>
              <li>授權家長 <strong>{{ verifyTarget.parent_name || '—' }}</strong> · {{ formatDateTime(verifyTarget.created_at) }}</li>
            </ul>
          </div>

          <div class="dlg-right">
            <template v-if="!overrideMode">
              <div class="lbl">請接送人出示或唸出 6 位取件碼</div>
              <el-input
                ref="codeInputRef"
                :model-value="codeInput"
                maxlength="6"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="請輸入接送人出示的 6 位取件碼"
                class="code-input"
                @update:model-value="onCodeInput"
                @keyup.enter="onCodeEnter"
              />
              <p v-if="verifyTarget.code_attempts > 0" class="attempts-hint">
                已輸錯 {{ verifyTarget.code_attempts }} 次，還可再試 {{ remainingAttempts }} 次；連錯 {{ MAX_CODE_ATTEMPTS }} 次會鎖定。
              </p>
              <p class="alt-link">
                接送人沒有取件碼？
                <button type="button" class="link-btn" @click="overrideMode = true">改用人工核對證件</button>
              </p>
            </template>
            <template v-else>
              <div class="lbl">人工核對證件</div>
              <p class="hint">請核對接送人證件與家長授權資料一致。說明會寫入稽核紀錄，交接完成後不可撤銷。</p>
              <el-input
                v-model="overrideNote"
                type="textarea"
                :rows="3"
                placeholder="請輸入核對證件的說明（至少 2 字，將寫入稽核紀錄）"
                class="override-note"
              />
              <p v-if="!verifyTarget.code_locked" class="alt-link">
                接送人拿到取件碼了？
                <button type="button" class="link-btn" @click="overrideMode = false">回到驗碼</button>
              </p>
            </template>
          </div>
        </div>
      </template>

      <div v-else-if="successResult.show" class="success-panel">
        <div class="success-icon" aria-hidden="true">✓</div>
        <h4>已完成交接{{ formatDateTime(verifyTarget?.completed_at || null) ? ' · ' + formatDateTime(verifyTarget?.completed_at || null) : '' }}</h4>
        <p>{{ verifyTarget?.student_name }} 已交給 {{ verifyTarget?.person_name }}（{{ verifyTarget?.person_relation }}），{{ successResult.via }}確認。</p>
      </div>

      <template #footer>
        <template v-if="!successResult.show">
          <span v-if="overrideMode" class="irreversible-hint">確認後寫入稽核紀錄，不可撤銷</span>
          <el-button @click="closeVerify">取消</el-button>
          <el-button
            v-if="!overrideMode"
            type="primary"
            :disabled="codeInput.length !== 6"
            :loading="verifying"
            @click="submitVerify"
          >確認交接</el-button>
          <el-button
            v-else
            type="warning"
            :disabled="overrideNote.trim().length < 2"
            :loading="verifying"
            @click="submitOverride"
          >人工核對後交接</el-button>
        </template>
        <el-button v-else type="primary" @click="closeVerify">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pickup-auth-admin-view {
  padding: 16px;
}
.scope-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}
.scope-day {
  font-weight: 600;
  color: var(--text-primary);
}
.scope-count {
  margin-left: auto;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.scope-count strong {
  color: var(--color-primary);
}
.history-range {
  max-width: 280px;
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

.thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
}
.thumb--none {
  background: var(--neutral-100);
}
.person-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.cell-name {
  font-weight: 600;
}
.cell-sub {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.rel-tag {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0 4px;
}
.status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.record-cell {
  display: flex;
  flex-direction: column;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.record-note {
  font-size: 12px;
  color: var(--text-tertiary, var(--text-secondary));
}

.verify-target-name {
  font-weight: 600;
  margin-bottom: 12px;
}
.locked-banner {
  background: var(--el-color-warning-light-9, #fdf3e3);
  border: 1px solid var(--el-color-warning-light-5, #f5d9a8);
  color: var(--el-color-warning, #b45309);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: var(--text-sm);
  margin-bottom: 12px;
}
.dlg-body {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
}
@media (--to-sm) {
  .dlg-body {
    grid-template-columns: 1fr;
  }
}
.verify-photo {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 12px;
}
.verify-photo--none {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--neutral-100);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 12px;
}
.facts {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  display: grid;
  gap: 4px;
}
.lbl {
  font-weight: 600;
  margin-bottom: 8px;
}
.hint {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0 0 8px;
}
.attempts-hint {
  font-size: var(--text-sm);
  color: var(--el-color-warning, #b45309);
  margin: 8px 0 0;
}
.alt-link {
  font-size: var(--text-sm);
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
  text-decoration: underline;
}
.irreversible-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--text-secondary);
}
.success-panel {
  text-align: center;
  padding: 12px 0;
}
.success-icon {
  width: 48px;
  height: 48px;
  line-height: 48px;
  border-radius: 50%;
  background: var(--el-color-success-light-9, #e6f4ea);
  color: var(--el-color-success, #15803d);
  font-size: 22px;
  margin: 0 auto 12px;
}
.code-input, .override-note {
  margin-bottom: 4px;
}

@media (--to-sm) {
  .pickup-auth-admin-view {
    padding: 0;
  }
}
</style>
