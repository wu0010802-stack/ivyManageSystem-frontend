<script setup lang="ts">
/**
 * 管理端娃娃車乘車歷史（route `/bus/history`，權限 `BUS_READ`）。
 *
 * 補「今日監看」（`BusMonitorView`）之外的空缺：家長申訴「昨天接晚了」時，
 * 園方要能查到過去班次的逐站接送紀錄，而不是只看得到當下。
 *
 * ⚠ 隱私鐵律（與 `BusMonitorView` 同源）：後端 `GET /bus/trips/{id}` 的
 * `stops[].lat/lng` 是家庭座標。本檔**全程不讀取、不顯示、不 log** 這兩個欄位——
 * 詳情只呈現站序／學生姓名／狀態／離站時間。
 *
 * 型別：改用 codegen 型別（`src/api/_generated/schema.d.ts` 已涵蓋 `/bus/trips`
 * 與 `/bus/trips/{trip_id}`），不再手刻對應 interface。
 *
 * `BusTripListItem` 額外掛 `[key: string]: unknown` 只是為了滿足
 * `AdminListCards`（手機卡片，通用 dumb component）既有的 `Record<string, unknown>[]`
 * prop 型別，不是重新手刻欄位——欄位定義仍 100% 來自 `Schema<'BusTripListItemOut'>`。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { listBusTrips, getBusTrip, listBusRoutes } from '@/api/bus'
import type { Schema } from '@/api/_generated/typed'
import { DIRECTION_LABELS } from '@/composables/useBusMonitor'
import { excuseReasonLabel } from '@/constants/bus'
import { formatTaipeiClock } from '@/utils/taipeiTime'

interface BusTripListItem extends Schema<'BusTripListItemOut'> {
  [key: string]: unknown
}

type BusTripDetail = Schema<'BusTripDetailOut'>

interface RouteOption {
  id: number
  name: string
  is_active?: boolean
}

const { isMobile } = useIsMobile()

// ── 路線選單（篩選用，不需站點名冊）──
const routes = ref<RouteOption[]>([])
/** 路線選單載入失敗：下拉是空的，但**不是**「這園沒有任何路線」。 */
const routesFailed = ref(false)
const fetchRoutes = async () => {
  routesFailed.value = false
  try {
    const res = await listBusRoutes()
    // 第二期契約：回應是 `{routes: [...]}`（route 層帶 direction，已無 morning/
    // afternoon 兩桶）。這裡只取篩選下拉需要的三欄——同一支端點會一併回傳全車名冊
    // 與家庭座標，那些一個欄位都不該進本頁狀態。
    routes.value = res.data.routes.map((r) => ({ id: r.id, name: r.name, is_active: r.is_active }))
  } catch {
    // 路線選單抓不到不影響歷史查詢本身（其餘篩選與查詢照常），但一個空的下拉
    // 看起來就是「這園沒有任何路線」——要明說是載入失敗。
    routesFailed.value = true
    routes.value = []
  }
}

// ── 篩選 ──
const filters = reactive({
  route_id: null as number | null,
  direction: '' as '' | 'morning' | 'afternoon',
  date_from: '',
  date_to: '',
  page: 1,
  page_size: 20,
})

const onRouteFilterChange = (val: string | number | null) => {
  filters.route_id = val ? Number(val) : null
}
const onDirectionFilterChange = (val: string) => {
  filters.direction = (val as '' | 'morning' | 'afternoon') || ''
}

const buildParams = () => ({
  page: filters.page,
  page_size: filters.page_size,
  ...(filters.route_id ? { route_id: filters.route_id } : {}),
  ...(filters.direction ? { direction: filters.direction } : {}),
  ...(filters.date_from ? { date_from: filters.date_from } : {}),
  ...(filters.date_to ? { date_to: filters.date_to } : {}),
})

// ── 清單三態 ──
const loading = ref(false)
const errored = ref(false)
const trips = ref<BusTripListItem[]>([])
const total = ref(0)

const fetchTrips = async () => {
  loading.value = true
  errored.value = false
  try {
    const res = await listBusTrips(buildParams())
    // 收斂成 BusTripListItem（多的 index signature 純為滿足 AdminListCards 的
    // Record<string, unknown>[] prop，見檔頭註解，欄位本身仍是 codegen 型別）
    trips.value = res.data.items as BusTripListItem[]
    total.value = res.data.total
  } catch {
    errored.value = true
    trips.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const isEmpty = computed(() => !loading.value && !errored.value && trips.value.length === 0)

const handleSearch = () => {
  filters.page = 1
  fetchTrips()
}
const handleReset = () => {
  filters.route_id = null
  filters.direction = ''
  filters.date_from = ''
  filters.date_to = ''
  filters.page = 1
  fetchTrips()
}
const handlePageChange = (page: number) => {
  filters.page = page
  fetchTrips()
}
const handlePageSizeChange = (size: number) => {
  filters.page_size = size
  filters.page = 1
  fetchTrips()
}

// ── 呈現用 helper（純函式；避免模板內物件型別 cast 拖垮 template compiler）──
// direction/status/auto_closed/operator_employee_name 是清單列與詳情共有欄位，
// 兩型別聯集即可涵蓋，不需要退回 Record<string, unknown>。
type BusTripRow = BusTripListItem | BusTripDetail

const directionLabelOf = (row: BusTripRow): string => {
  const d = row.direction ?? ''
  return DIRECTION_LABELS[d] ?? d
}
/**
 * 第二期 status 域擴為 planned／in_progress／completed／expired。
 * 列表**預設排除** planned／expired（`listBusTrips` 不帶 `include_planned`），
 * 這兩個標籤是防禦性補齊：後端預設值哪天改了，畫面不會退化成印出裸英文碼。
 */
const STATUS_LABELS: Record<string, string> = {
  planned: '已排定（未發車）',
  in_progress: '行駛中',
  completed: '已完成',
  expired: '未發車已過期',
  cancelled: '已取消',
}
const statusLabelOf = (row: BusTripRow): string => {
  const s = row.status ?? ''
  return STATUS_LABELS[s] ?? s
}
const statusTagType = (row: BusTripRow): 'success' | 'warning' | 'info' | 'danger' | undefined => {
  if (row.status === 'completed') return 'success'
  if (row.status === 'in_progress') return 'warning'
  if (row.status === 'planned') return 'info'
  if (row.status === 'expired') return 'danger'
  return undefined
}
/**
 * `operator_employee_id`／`operator_employee_name`／`started_at` 第二期改 Optional
 * （planned 階段司機還沒按開始，三者皆為 NULL）——一律以 `—` 呈現，不可讓
 * `null` 直接漏到畫面上。
 */
const operatorNameOf = (row: BusTripRow): string => row.operator_employee_name || '—'
const startedAtOf = (row: BusTripRow): string => formatTaipeiClock(row.started_at ?? null) ?? '—'
const stopStatsOf = (row: BusTripListItem): string => {
  const stats = row.stop_stats
  if (!stats) return '—'
  return `${stats.departed}/${stats.total} 已離站（跳過 ${stats.skipped}）`
}
const stopStatusLabel = (status: string): string => {
  if (status === 'departed') return '已離站'
  if (status === 'skipped') return '已跳過'
  if (status === 'excused') return '今日不搭'
  return '未處理'
}
const stopStatusTagType = (status: string): 'success' | 'info' | 'warning' | undefined => {
  if (status === 'departed') return 'success'
  if (status === 'skipped') return 'info'
  if (status === 'excused') return 'warning'
  return undefined
}

// AdminListCards 是通用 dumb 元件，item slot 型別固定為 Record<string, unknown>；
// 這裡在 script 收斂回 BusTripListItem 一次，避免在 template 內對 slot props 直接
// `as {…}` cast（會炸 template compiler）。
const asBusTripListItem = (item: Record<string, unknown>): BusTripListItem =>
  item as BusTripListItem

// 手機卡片欄位（__ 前綴為 slot-only 欄，值由對應 #cell- slot 渲染）
const tripCardColumns = [
  { label: '日期', prop: 'trip_date' },
  { label: '路線', prop: 'route_name' },
  { label: '方向', prop: '__direction' },
  { label: '狀態', prop: '__status' },
  { label: '站點進度', prop: '__stats' },
  { label: '隨車老師', prop: '__operator' },
]

// ── 詳情（逐站）──
const detail = reactive({
  visible: false,
  loading: false,
  errored: false,
  trip: null as BusTripDetail | null,
})

const openDetail = async (row: BusTripListItem) => {
  const tripId = row.id
  detail.visible = true
  detail.loading = true
  detail.errored = false
  detail.trip = null
  try {
    const res = await getBusTrip(tripId)
    detail.trip = res.data
  } catch {
    detail.errored = true
  } finally {
    detail.loading = false
  }
}

onMounted(() => {
  fetchRoutes()
  fetchTrips()
})
</script>

<template>
  <div class="bus-history">
    <PageHeader title="娃娃車乘車歷史" subtitle="查詢過去班次的接送進度，用於申訴查證與異常追蹤">
      <template #filters>
        <el-select
          :model-value="filters.route_id"
          data-testid="bus-history-filter-route"
          :placeholder="routesFailed ? '路線清單載入失敗' : '全部路線'"
          clearable
          style="width: 160px"
          @change="onRouteFilterChange"
        >
          <el-option v-for="r in routes" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-select
          :model-value="filters.direction"
          data-testid="bus-history-filter-direction"
          placeholder="全部方向"
          clearable
          style="width: 140px"
          @change="onDirectionFilterChange"
        >
          <el-option label="早上接學生" value="morning" />
          <el-option label="下午送學生" value="afternoon" />
        </el-select>
        <el-date-picker
          v-model="filters.date_from"
          data-testid="bus-history-filter-date-from"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="起始日期"
          style="width: 160px"
        />
        <el-date-picker
          v-model="filters.date_to"
          data-testid="bus-history-filter-date-to"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="結束日期"
          style="width: 160px"
        />
        <el-button type="primary" data-testid="bus-history-search" :loading="loading" @click="handleSearch">
          查詢
        </el-button>
        <el-button data-testid="bus-history-reset" @click="handleReset">重置</el-button>
      </template>
    </PageHeader>

    <el-skeleton v-if="loading && !trips.length" data-testid="bus-history-loading" :rows="5" animated />

    <el-alert
      v-else-if="errored"
      data-testid="bus-history-error"
      type="error"
      show-icon
      :closable="false"
      title="載入乘車歷史失敗"
      description="請確認網路連線後重新查詢。"
    />

    <el-empty
      v-else-if="isEmpty"
      data-testid="bus-history-empty"
      description="這個篩選條件下沒有查到任何班次"
    />

    <template v-else>
      <el-table v-if="!isMobile" :data="trips" border stripe style="width: 100%">
        <el-table-column prop="trip_date" label="日期" width="110" />
        <el-table-column prop="route_name" label="路線" width="120" />
        <el-table-column label="方向" width="110">
          <template #default="{ row }">{{ directionLabelOf(row) }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="140">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row)" size="small">{{ statusLabelOf(row) }}</el-tag>
            <el-tag
              v-if="row.auto_closed"
              data-testid="bus-history-autoclosed"
              type="warning"
              size="small"
              effect="dark"
            >
              系統自動關閉
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="站點進度" min-width="160">
          <template #default="{ row }">{{ stopStatsOf(row) }}</template>
        </el-table-column>
        <el-table-column label="隨車老師" width="110">
          <template #default="{ row }">{{ operatorNameOf(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              data-testid="bus-history-detail-btn"
              @click="openDetail(row)"
            >
              查看明細
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <AdminListCards v-else :items="trips" :columns="tripCardColumns" row-key="id" :loading="loading">
        <template #title="{ item }">{{ item.route_name }}</template>
        <template #cell-__direction="{ item }">{{ directionLabelOf(asBusTripListItem(item)) }}</template>
        <template #cell-__status="{ item }">
          <el-tag :type="statusTagType(asBusTripListItem(item))" size="small">
            {{ statusLabelOf(asBusTripListItem(item)) }}
          </el-tag>
          <el-tag
            v-if="item.auto_closed"
            data-testid="bus-history-autoclosed"
            type="warning"
            size="small"
            effect="dark"
          >
            系統自動關閉
          </el-tag>
        </template>
        <template #cell-__stats="{ item }">{{ stopStatsOf(asBusTripListItem(item)) }}</template>
        <template #cell-__operator="{ item }">{{ operatorNameOf(asBusTripListItem(item)) }}</template>
        <template #actions="{ item }">
          <el-button
            type="primary"
            size="small"
            data-testid="bus-history-detail-btn"
            @click="openDetail(asBusTripListItem(item))"
          >
            查看明細
          </el-button>
        </template>
      </AdminListCards>

      <div class="bus-history__pagination">
        <el-pagination
          data-testid="bus-history-pagination"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :page-size="filters.page_size"
          :current-page="filters.page"
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </template>

    <el-drawer v-model="detail.visible" data-testid="bus-history-drawer" title="班次明細" size="480px">
      <el-skeleton v-if="detail.loading" :rows="4" animated />
      <el-alert
        v-else-if="detail.errored"
        data-testid="bus-history-drawer-error"
        type="error"
        show-icon
        :closable="false"
        title="載入班次明細失敗"
      />
      <template v-else-if="detail.trip">
        <p class="bus-history__detail-summary">
          {{ detail.trip.route_name }}・{{ directionLabelOf(detail.trip) }}・{{ detail.trip.trip_date }}
        </p>
        <p class="bus-history__detail-summary" data-testid="bus-history-drawer-operator">
          隨車老師：{{ operatorNameOf(detail.trip) }}・發車時間：{{ startedAtOf(detail.trip) }}
        </p>
        <el-tag
          v-if="detail.trip.auto_closed"
          data-testid="bus-history-drawer-autoclosed"
          type="warning"
          effect="dark"
        >
          系統自動關閉（司機未手動結束班次）
        </el-tag>
        <el-table :data="detail.trip.stops" size="small" style="margin-top: 12px">
          <el-table-column prop="seq" label="站序" width="70" />
          <el-table-column prop="student_name" label="學生" />
          <el-table-column label="狀態" width="140">
            <template #default="{ row }">
              <el-tag :type="stopStatusTagType(row.status)" size="small">
                {{ stopStatusLabel(row.status) }}
              </el-tag>
              <!-- excused 是落庫事實，申訴查證時「為什麼沒接」比「沒接」本身重要 -->
              <span
                v-if="row.status === 'excused'"
                class="bus-history__excuse"
                data-testid="bus-history-drawer-excuse"
              >
                {{ excuseReasonLabel(row.excuse_reason) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="離站時間" width="110">
            <template #default="{ row }">{{ formatTaipeiClock(row.departed_at) ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.bus-history {
  padding: var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.bus-history__pagination {
  display: flex;
  justify-content: center;
  margin-top: var(--space-4, 16px);
}
.bus-history__detail-summary {
  margin: 0 0 var(--space-2, 8px);
  color: var(--text-secondary, #606266);
}
.bus-history__excuse {
  margin-left: var(--space-1, 4px);
  font-size: var(--text-sm, 13px);
  color: var(--text-tertiary, #909399);
}
</style>
