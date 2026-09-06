<template>
  <el-card>
    <div class="filter-bar">
      <el-select
        :model-value="filters.month"
        placeholder="月份"
        clearable
        size="small"
        style="width:110px"
        @update:model-value="updateFilter('month', $event)"
        @change="$emit('filter-change')"
      >
        <el-option v-for="item in options.months" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select
        :model-value="filters.grade"
        placeholder="班別"
        clearable
        size="small"
        style="width:100px"
        @update:model-value="updateFilter('grade', $event)"
        @change="$emit('filter-change')"
      >
        <el-option v-for="item in options.grades" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select
        :model-value="filters.school_year ?? null"
        placeholder="入學學年"
        clearable
        size="small"
        style="width:120px"
        @update:model-value="updateFilter('school_year', $event)"
        @change="$emit('filter-change')"
      >
        <el-option v-for="y in termYearOptions" :key="y" :label="`${y} 學年`" :value="y" />
      </el-select>
      <el-select
        :model-value="filters.semester ?? null"
        placeholder="學期"
        clearable
        size="small"
        style="width:100px"
        @update:model-value="updateFilter('semester', $event)"
        @change="$emit('filter-change')"
      >
        <el-option label="上學期" :value="1" />
        <el-option label="下學期" :value="2" />
      </el-select>
      <el-select
        :model-value="filters.source"
        placeholder="來源"
        clearable
        size="small"
        style="width:130px"
        @update:model-value="updateFilter('source', $event)"
        @change="$emit('filter-change')"
      >
        <el-option v-for="item in options.sources" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select
        :model-value="filters.referrer"
        placeholder="介紹者"
        clearable
        size="small"
        style="width:110px"
        @update:model-value="updateFilter('referrer', $event)"
        @change="$emit('filter-change')"
      >
        <el-option v-for="item in options.referrers" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select
        :model-value="filters.has_deposit"
        placeholder="預繳"
        clearable
        size="small"
        style="width:90px"
        @update:model-value="updateFilter('has_deposit', $event)"
        @change="$emit('filter-change')"
      >
        <el-option label="是" :value="true" />
        <el-option label="否" :value="false" />
      </el-select>
      <el-select
        :model-value="filters.no_deposit_reason"
        placeholder="未預繳原因"
        clearable
        size="small"
        style="width:160px"
        @update:model-value="updateFilter('no_deposit_reason', $event)"
        @change="$emit('filter-change')"
      >
        <el-option v-for="item in options.no_deposit_reasons" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input
        :model-value="filters.keyword"
        placeholder="姓名/地址/備註搜尋..."
        size="small"
        style="width:200px"
        clearable
        @update:model-value="updateFilter('keyword', $event)"
        @input="$emit('keyword-input')"
      />
      <el-button size="small" @click="$emit('clear-filter')">清除篩選</el-button>
      <span class="record-count">顯示 {{ detailData.length }} / {{ detailTotal }} 筆</span>
    </div>

    <el-table
      :data="detailData"
      border
      stripe
      size="small"
      v-loading="loadingDetail"
      :row-class-name="rowClassName"
      style="margin-top:12px"
    >
      <el-table-column prop="visit_date" label="參觀日期" min-width="120">
        <template #default="{ row }">
          {{ row.visit_date || row.month || '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="child_name" label="姓名" width="90" />
      <el-table-column prop="grade" label="班別" width="80" />
      <el-table-column label="入學學期" width="110" :formatter="(row: Record<string, unknown>) => enrollTermText(row)" />
      <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.address || row.district || '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="source" label="來源" min-width="100" />
      <el-table-column prop="referrer" label="介紹者" width="90" />
      <el-table-column label="預繳" align="center" width="104">
        <template #default="{ row }">
          <el-tag :type="row.has_deposit ? 'success' : 'danger'" size="small">
            {{ row.has_deposit ? '是' : '否' }}
          </el-tag>
          <!-- 收款對帳（2026-09-06）：招生端旗標與學費模組的預繳金是兩個真相，
               不連動。落差直接標在這一欄，不必兩個模組對開才看得出來。 -->
          <el-tooltip
            v-if="mismatchLabel(row.deposit_mismatch)"
            :content="mismatchTitle(row.deposit_mismatch)"
            placement="top"
          >
            <el-tag
              type="warning"
              size="small"
              effect="plain"
              class="mismatch-tag"
              data-test="row-deposit-mismatch"
            >{{ mismatchLabel(row.deposit_mismatch) }}</el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="已註冊" align="center" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.enrolled" type="success" size="small">是</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="轉學期" align="center" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.transfer_term" type="warning" size="small">是</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="娃娃車" align="center" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.rides_bus" type="info" size="small">要搭</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="no_deposit_reason" label="未預繳原因" min-width="120" show-overflow-tooltip />
      <el-table-column prop="notes" label="備註" min-width="120" show-overflow-tooltip />
      <el-table-column prop="parent_response" label="電訪回應" min-width="120" show-overflow-tooltip />
      <!-- 操作欄（2026-09-06 重整）：一列六顆按鈕要 360px，釘在右側會蓋掉「預繳」
           之後的所有欄位。常用的三顆留在外面，其餘收進「更多」，欄寬縮回 210px。
           手機上不釘住——窄視窗裡釘住的操作欄會蓋掉整個表格，反而看不到是誰。 -->
      <el-table-column
        v-if="canWrite || canConvert"
        label="操作"
        width="248"
        :fixed="isMobile ? false : 'right'"
      >
        <template #default="{ row }">
          <div class="row-actions">
          <el-button v-if="canWrite" size="small" @click="$emit('edit', row)">編輯</el-button>
          <el-button size="small" @click="$emit('journey', row)">歷程</el-button>
          <el-button
            v-if="canConvert && row.has_deposit && !row.enrolled"
            size="small"
            type="success"
            @click="$emit('convert', row)"
          >轉為學生</el-button>
          <el-dropdown v-if="canWrite" trigger="click" @command="(c: string) => onRowCommand(c, row)">
            <el-button size="small" text data-test="row-more">更多<el-icon class="more-caret"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="row.has_deposit" command="reserve">
                  {{ row.provisional_grade_id ? '變更座位' : '保留座位' }}
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="!row.withdrawn_at && (row.has_deposit || row.enrolled)"
                  command="withdraw"
                  data-test="row-withdraw"
                >{{ row.enrolled ? '退註冊' : '退預繳' }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="detailTotal > (filters.page_size ?? 0)"
      class="pagination"
      :current-page="filters.page"
      :page-size="filters.page_size"
      :total="detailTotal"
      layout="prev, pager, next"
      @current-change="$emit('page-change', $event)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { currentRocYear } from '@/utils/academic'
import { formatSemester } from '@/utils/classHistory'

interface DetailFilters {
  month?: string | null
  grade?: string | null
  source?: string | null
  referrer?: string | null
  has_deposit?: boolean | null
  no_deposit_reason?: string | null
  keyword?: string | null
  page?: number
  page_size?: number
  school_year?: number | null
  semester?: number | null
  [key: string]: unknown
}

interface DetailOptions {
  months?: string[]
  grades?: string[]
  sources?: string[]
  referrers?: string[]
  no_deposit_reasons?: string[]
  [key: string]: unknown
}

withDefaults(defineProps<{
  canWrite: boolean
  canConvert?: boolean
  options: DetailOptions
  filters: DetailFilters
  detailData: Record<string, unknown>[]
  detailTotal: number
  loadingDetail: boolean
  rowClassName: (row: Record<string, unknown>) => string
}>(), {
  canConvert: false,
})

const emit = defineEmits<{
  'update-filter': [value: Record<string, unknown>]
  'filter-change': []
  'keyword-input': []
  'clear-filter': []
  'page-change': [page: number]
  'edit': [row: Record<string, unknown>]
  'convert': [row: Record<string, unknown>]
  'reserve': [row: Record<string, unknown>]
  'journey': [row: Record<string, unknown>]
  'withdraw': [row: Record<string, unknown>]
  'delete': [id: unknown]
}>()

const { isMobile } = useIsMobile()

/** 操作欄「更多」下拉：把次要與危險動作收進來，欄寬才不會蓋掉表格中段。 */
function onRowCommand(command: string, row: Record<string, unknown>): void {
  if (command === 'reserve') emit('reserve', row)
  else if (command === 'withdraw') emit('withdraw', row)
  else if (command === 'delete') emit('delete', row.id)
}

/** 招生旗標與學費模組收款紀錄的落差（後端 services/recruitment_prepayment_link 算好）。 */
const MISMATCH_LABEL: Record<string, string> = {
  flag_without_credit: '查無收款',
  credit_without_flag: '未標記',
}
const MISMATCH_TITLE: Record<string, string> = {
  flag_without_credit: '標記為已預繳，但學費管理查不到對應的預繳金，請確認收款是否漏登。',
  credit_without_flag: '學費管理已有這筆的預繳金，但招生狀態還停在未預繳，請到漏斗看板推進到「已預繳」。',
}
const mismatchLabel = (key: unknown): string =>
  MISMATCH_LABEL[typeof key === 'string' ? key : ''] ?? ''
const mismatchTitle = (key: unknown): string =>
  MISMATCH_TITLE[typeof key === 'string' ? key : ''] ?? ''

const termYearOptions = computed(() => {
  const y = currentRocYear()
  return [y + 1, y, y - 1, y - 2]
})

const enrollTermText = (row: Record<string, unknown>): string => {
  const sy = row.target_school_year as number | null
  const sem = row.target_semester as number | null
  return sy != null && sem != null ? formatSemester(sy, sem) : '—'
}

const updateFilter = (field: string, value: unknown) => {
  emit('update-filter', { [field]: value })
}
</script>

<style scoped>
/* 收款對帳標籤跟在「預繳」tag 後面，靠 margin 與它拉開，不另佔一欄 */
.mismatch-tag {
  margin-left: 4px;
}
.more-caret {
  margin-left: 2px;
}
/* 四個元素（編輯／歷程／轉為學生／更多）維持單行，不因欄寬臨界值折行 */
.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
