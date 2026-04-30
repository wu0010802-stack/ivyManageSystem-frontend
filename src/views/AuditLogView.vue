<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAuditLogs, getAuditLogsMeta, exportAuditLogs } from '@/api/audit'
import { ElMessage } from 'element-plus'

const router = useRouter()

const loading = ref(false)
const exporting = ref(false)
const logs = ref([])
const total = ref(0)

const entityTypes = ref([])
const actionTypes = ref([])

const filters = reactive({
  entity_type: '',
  action: '',
  username: '',
  entity_id: '',
  ip_address: '',
  start_at: '',
  end_at: '',
  page: 1,
  page_size: 50,
})

// entity_type → 前端路由生成函式。只對「有 id 專屬詳情頁」的資源建連結，
// 避免點「#5」卻跳去列表頁這種假導航（其他 entity 只有列表頁）。
const ENTITY_ROUTES = {
  student: (id) => (id ? { path: `/students/profile/${id}` } : null),
}

// 高風險事件快篩：name → predicate(row) → boolean
// 客端過濾（changes 是 JSONB，server 端篩成本較高）；同時回傳該按鈕是否要先設 entity_type。
// Why: 業主驗收要求「請假/加班/學費/退款/大額異動/強制放行/已核准後修改」可一鍵篩出
const RISK_QUICK_FILTERS = [
  { key: 'leave', label: '請假', entityType: 'leave', predicate: () => true },
  { key: 'overtime', label: '加班', entityType: 'overtime', predicate: () => true },
  { key: 'fee', label: '學費', entityType: 'fee', predicate: () => true },
  {
    key: 'refund',
    label: '退款',
    entityType: 'fee',
    predicate: (row) => row.changes?.action === 'fee_refund',
  },
  {
    key: 'large_amount',
    label: '大額金流',
    entityType: '',
    predicate: (row) => {
      const c = row.changes || {}
      // 任何金額類欄位 > 5000 視為大額；含 fee_pay/fee_refund/cumulative_refund_after
      const candidates = [c.delta, c.refund_amount, c.cumulative_refund_after, c.new_paid]
      return candidates.some((v) => typeof v === 'number' && Math.abs(v) >= 5000)
    },
  },
  {
    key: 'force_overlay',
    label: '強制放行',
    entityType: '',
    predicate: (row) => {
      const tags = row.changes?.risk_tags || []
      return tags.includes('force_overlap') || tags.includes('force_without_substitute')
    },
  },
  {
    key: 'reject_approved',
    label: '已核准後修改',
    entityType: '',
    predicate: (row) => {
      const c = row.changes || {}
      // 三條軌跡都算：(1) approve 流程中駁回已核准 (2) 修改觸發退審 (3) 批次中含此類
      if (c.is_reject_of_approved) return true
      if (c.action === 'leave_update' || c.action === 'overtime_update') {
        return c.was_approved === true
      }
      if (c.high_risk_count && c.high_risk_count > 0) return true
      return false
    },
  },
]

const activeRiskFilter = ref('')

const buildFilterParams = () => {
  const params = {}
  if (filters.entity_type) params.entity_type = filters.entity_type
  if (filters.action) params.action = filters.action
  if (filters.username) params.username = filters.username
  if (filters.entity_id && filters.entity_type) params.entity_id = filters.entity_id
  if (filters.ip_address) params.ip_address = filters.ip_address
  if (filters.start_at) params.start_at = filters.start_at
  if (filters.end_at) params.end_at = filters.end_at
  return params
}

const fetchMeta = async () => {
  try {
    const res = await getAuditLogsMeta()
    entityTypes.value = res.data.entity_types
    actionTypes.value = res.data.actions
  } catch (error) {
    // meta 抓不到不影響查詢
  }
}

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = {
      ...buildFilterParams(),
      page: filters.page,
      page_size: filters.page_size,
    }
    const res = await getAuditLogs(params)
    logs.value = res.data.items
    total.value = res.data.total
  } catch (error) {
    if (error.response?.status === 403) {
      ElMessage.error('需要管理員權限')
    } else {
      ElMessage.error('載入操作紀錄失敗')
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  if (filters.entity_id && !filters.entity_type) {
    ElMessage.warning('使用「資源 ID」篩選前請先選擇資源類型')
    return
  }
  filters.page = 1
  fetchLogs()
}

const handleReset = () => {
  filters.entity_type = ''
  filters.action = ''
  filters.username = ''
  filters.entity_id = ''
  filters.ip_address = ''
  filters.start_at = ''
  filters.end_at = ''
  filters.page = 1
  activeRiskFilter.value = ''
  fetchLogs()
}

const applyRiskFilter = (key) => {
  if (activeRiskFilter.value === key) {
    // 再次點擊取消
    activeRiskFilter.value = ''
    return
  }
  activeRiskFilter.value = key
  const def = RISK_QUICK_FILTERS.find((f) => f.key === key)
  if (def && def.entityType) {
    filters.entity_type = def.entityType
    filters.page = 1
    fetchLogs()
  }
  // 純客端過濾（如「強制放行」）不重打 API，僅切換 displayedLogs
}

// 客端套用 risk filter 後的最終列表；無風險篩選時直接回 logs
const displayedLogs = computed(() => {
  if (!activeRiskFilter.value) return logs.value
  const def = RISK_QUICK_FILTERS.find((f) => f.key === activeRiskFilter.value)
  if (!def) return logs.value
  return logs.value.filter(def.predicate)
})

// 高風險旗標：用於行內顯示警示徽章
const getRiskBadges = (row) => {
  const c = row.changes || {}
  const badges = []
  const tags = c.risk_tags || []
  if (tags.includes('force_overlap')) badges.push({ type: 'danger', label: '強制重疊' })
  if (tags.includes('force_without_substitute'))
    badges.push({ type: 'danger', label: '無代理人' })
  if (tags.includes('reject_of_approved'))
    badges.push({ type: 'warning', label: '駁回已核准' })
  if (c.action === 'leave_update' && c.was_approved)
    badges.push({ type: 'warning', label: '修改已核准' })
  if (c.action === 'overtime_update' && c.was_approved)
    badges.push({ type: 'warning', label: '修改已核准' })
  if (c.action === 'fee_refund') badges.push({ type: 'info', label: '退款' })
  // 大額金流（本次本筆 > 5000）
  const amounts = [c.delta, c.refund_amount, c.new_paid]
  if (amounts.some((v) => typeof v === 'number' && Math.abs(v) >= 5000))
    badges.push({ type: 'danger', label: '大額' })
  return badges
}

const handlePageChange = (page) => {
  filters.page = page
  fetchLogs()
}

const handlePageSizeChange = (size) => {
  filters.page_size = size
  filters.page = 1
  fetchLogs()
}

const setQuickRange = (kind) => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  if (kind === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  } else if (kind === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  } else if (kind === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  }
  handleSearch()
}

const handleExport = async () => {
  if (total.value === 0) {
    ElMessage.info('目前查詢結果為空，沒有可匯出內容')
    return
  }
  exporting.value = true
  try {
    const res = await exportAuditLogs(buildFilterParams())
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    a.download = `audit_logs_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('匯出成功')
  } catch (error) {
    // 超過上限的 400 response 是 blob，要讀取才能看 detail
    if (error.response?.status === 400 && error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const body = JSON.parse(text)
        ElMessage.error(body.detail || '匯出失敗')
      } catch (_) {
        ElMessage.error('匯出失敗')
      }
    } else {
      ElMessage.error(error.response?.data?.detail || '匯出失敗')
    }
  } finally {
    exporting.value = false
  }
}

const getActionTag = (action) => {
  const map = {
    CREATE: { type: 'success', label: '新增' },
    UPDATE: { type: 'warning', label: '修改' },
    DELETE: { type: 'danger', label: '刪除' },
  }
  return map[action] || { type: 'info', label: action }
}

const entityLabelMap = computed(() => {
  const m = {}
  for (const e of entityTypes.value) m[e.value] = e.label
  return m
})

const getEntityLabel = (type) => entityLabelMap.value[type] || type

const formatTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const hasChanges = (row) => {
  const c = row.changes
  return c && typeof c === 'object' && Object.keys(c).length > 0
}

// changes 結構不一致：舊紀錄是 {field: {before, after}}（auth/employees/classrooms），
// 新紀錄則是 {action, ..., diff: {...}, risk_tags: [...]}（leave/overtime/fee）。
// 此 helper 把兩種都拆成 nested-diff（before/after）+ flat-fields（單值），讓 expand 一致。
const splitChanges = (row) => {
  const c = row.changes || {}
  const nestedDiff = []
  const flatFields = []
  const meta = {}
  // 先處理新格式：c.diff 內為 {field: {before, after}}
  if (c.diff && typeof c.diff === 'object') {
    for (const [field, v] of Object.entries(c.diff)) {
      if (v && typeof v === 'object' && 'before' in v && 'after' in v) {
        nestedDiff.push({ field, before: v.before, after: v.after })
      }
    }
  }
  // 處理新/舊混合：頂層 {field: {before, after}} 也視為 diff
  for (const [k, v] of Object.entries(c)) {
    if (k === 'diff' || k === 'before' || k === 'after') continue
    if (v && typeof v === 'object' && 'before' in v && 'after' in v) {
      nestedDiff.push({ field: k, before: v.before, after: v.after })
    } else if (k === 'risk_tags' || k === 'failed' || k === 'requested_ids' || k === 'succeeded_ids' || k === 'approval_log_ids' || k === 'sampled_student_ids') {
      // 這些是結構化資料，放 meta 分區呈現
      meta[k] = v
    } else {
      flatFields.push({ field: k, value: v })
    }
  }
  // 新格式專用：if c.before/c.after 都是物件，攤平成 nestedDiff
  if (c.before && c.after && typeof c.before === 'object' && typeof c.after === 'object') {
    for (const k of Object.keys(c.before)) {
      if (c.before[k] !== c.after[k]) {
        nestedDiff.push({ field: k, before: c.before[k], after: c.after[k] })
      }
    }
  }
  return { nestedDiff, flatFields, meta }
}

const resolveRoute = (row) => {
  const fn = ENTITY_ROUTES[row.entity_type]
  if (!fn) return null
  return fn(row.entity_id)
}

const canNavigate = (row) => !!resolveRoute(row)

const goToEntity = (row) => {
  const to = resolveRoute(row)
  if (to) router.push(to)
}

onMounted(async () => {
  await fetchMeta()
  fetchLogs()
})
</script>

<template>
  <div class="audit-page">
    <h2>操作紀錄</h2>

    <el-card class="filter-card">
      <div class="filters">
        <el-select v-model="filters.entity_type" placeholder="資源類型" clearable style="width: 130px;">
          <el-option v-for="et in entityTypes" :key="et.value" :label="et.label" :value="et.value" />
        </el-select>
        <el-select v-model="filters.action" placeholder="操作類型" clearable style="width: 110px;">
          <el-option v-for="at in actionTypes" :key="at.value" :label="at.label" :value="at.value" />
        </el-select>
        <el-input v-model="filters.username" placeholder="使用者名稱" clearable style="width: 140px;" />
        <el-input
          v-model="filters.entity_id"
          :placeholder="filters.entity_type ? '資源 ID' : '資源 ID（先選類型）'"
          :disabled="!filters.entity_type"
          clearable
          style="width: 150px;"
        />
        <el-input v-model="filters.ip_address" placeholder="IP 包含" clearable style="width: 130px;" />
        <el-date-picker
          v-model="filters.start_at"
          type="datetime"
          placeholder="起始時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px;"
        />
        <el-date-picker
          v-model="filters.end_at"
          type="datetime"
          placeholder="結束時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px;"
        />
        <el-button type="primary" @click="handleSearch">查詢</el-button>
        <el-button @click="handleReset">重置</el-button>
        <el-button :loading="exporting" @click="handleExport">匯出 CSV</el-button>
      </div>
      <div class="quick-ranges">
        <span class="quick-label">快捷時段：</span>
        <el-button size="small" link @click="setQuickRange('today')">今日</el-button>
        <el-button size="small" link @click="setQuickRange('7d')">近 7 日</el-button>
        <el-button size="small" link @click="setQuickRange('month')">本月</el-button>
      </div>
      <div class="quick-ranges">
        <span class="quick-label">高風險快篩：</span>
        <el-button
          v-for="rf in RISK_QUICK_FILTERS"
          :key="rf.key"
          size="small"
          :type="activeRiskFilter === rf.key ? 'primary' : ''"
          @click="applyRiskFilter(rf.key)"
        >
          {{ rf.label }}
        </el-button>
        <el-button v-if="activeRiskFilter" size="small" link @click="activeRiskFilter = ''">
          清除
        </el-button>
        <span v-if="activeRiskFilter && !RISK_QUICK_FILTERS.find(f => f.key === activeRiskFilter)?.entityType" class="risk-hint">
          ⚠ 純客端過濾：僅在當頁 {{ logs.length }} 筆中比對；如需全庫掃描請放大 page_size 或切換伺服端條件
        </span>
      </div>
    </el-card>

    <el-table
      :data="displayedLogs"
      border
      stripe
      style="width: 100%; margin-top: 20px;"
      v-loading="loading"
      max-height="600"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="changes-detail">
            <template v-if="hasChanges(row)">
              <!-- before/after 欄位差異表 -->
              <template v-if="splitChanges(row).nestedDiff.length > 0">
                <div class="diff-header">變更欄位</div>
                <el-table :data="splitChanges(row).nestedDiff" size="small" border>
                  <el-table-column prop="field" label="欄位" width="180" />
                  <el-table-column label="變更前">
                    <template #default="{ row: r }">
                      <span class="diff-before">{{ formatValue(r.before) }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="變更後">
                    <template #default="{ row: r }">
                      <span class="diff-after">{{ formatValue(r.after) }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </template>

              <!-- 平面結構化欄位（新格式 changes 的 metadata） -->
              <template v-if="splitChanges(row).flatFields.length > 0">
                <div class="diff-header" style="margin-top: 12px;">操作上下文</div>
                <el-table :data="splitChanges(row).flatFields" size="small" border>
                  <el-table-column prop="field" label="欄位" width="220" />
                  <el-table-column label="值">
                    <template #default="{ row: r }">
                      <span class="diff-after">{{ formatValue(r.value) }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </template>

              <!-- 結構化清單（risk_tags / failed / approval_log_ids 等） -->
              <template v-for="(v, k) in splitChanges(row).meta" :key="k">
                <div class="diff-header" style="margin-top: 12px;">{{ k }}</div>
                <pre class="meta-json">{{ formatValue(v) }}</pre>
              </template>
            </template>
            <div v-else class="no-changes">
              此紀錄未記錄欄位變更詳情（較早的紀錄或未接入 diff 的 endpoint）。
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="時間" width="170">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.created_at) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="username" label="使用者" width="110" />
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getActionTag(row.action).type" size="small">
            {{ getActionTag(row.action).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="資源類型" width="110">
        <template #default="{ row }">{{ getEntityLabel(row.entity_type) }}</template>
      </el-table-column>
      <el-table-column label="資源 ID" width="100">
        <template #default="{ row }">
          <el-button
            v-if="row.entity_id && canNavigate(row)"
            link
            type="primary"
            size="small"
            @click="goToEntity(row)"
          >
            #{{ row.entity_id }}
          </el-button>
          <span v-else>{{ row.entity_id || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="摘要" min-width="200">
        <template #default="{ row }">
          <div class="summary-cell">
            <span class="summary-text" :title="row.summary">{{ row.summary }}</span>
            <div v-if="getRiskBadges(row).length > 0" class="risk-badges">
              <el-tag
                v-for="(b, i) in getRiskBadges(row)"
                :key="i"
                :type="b.type"
                size="small"
                effect="dark"
              >
                {{ b.label }}
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="ip_address" label="IP" width="130" />
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-sizes="[20, 50, 100, 200]"
        :page-size="filters.page_size"
        :current-page="filters.page"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: var(--space-4);
}
.filters {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.quick-ranges {
  margin-top: var(--space-2);
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.quick-label {
  color: var(--text-secondary, #666);
  font-size: var(--text-sm);
}
.risk-hint {
  color: #d97706;
  font-size: var(--text-sm);
  margin-left: var(--space-2);
}
.pagination-wrapper {
  margin-top: var(--space-4);
  display: flex;
  justify-content: center;
}
.time-text {
  font-size: var(--text-sm);
  font-family: monospace;
}
.changes-detail {
  padding: var(--space-3);
  background: var(--background-secondary, #fafafa);
}
.diff-header {
  margin-bottom: var(--space-2);
  font-weight: 600;
}
.no-changes {
  color: var(--text-secondary, #888);
  padding: var(--space-2);
  font-style: italic;
}
.diff-before {
  color: #c0392b;
  text-decoration: line-through;
  font-family: monospace;
}
.diff-after {
  color: #27ae60;
  font-family: monospace;
  font-weight: 500;
}
.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.summary-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.risk-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.meta-json {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
