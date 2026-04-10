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
      <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.address || row.district || '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="source" label="來源" min-width="100" />
      <el-table-column prop="referrer" label="介紹者" width="90" />
      <el-table-column label="預繳" align="center" width="70">
        <template #default="{ row }">
          <el-tag :type="row.has_deposit ? 'success' : 'danger'" size="small">
            {{ row.has_deposit ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="已報到" align="center" width="70">
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
      <el-table-column prop="no_deposit_reason" label="未預繳原因" min-width="120" show-overflow-tooltip />
      <el-table-column prop="notes" label="備註" min-width="120" show-overflow-tooltip />
      <el-table-column prop="parent_response" label="電訪回應" min-width="120" show-overflow-tooltip />
      <el-table-column v-if="canWrite" label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="$emit('edit', row)">編輯</el-button>
          <el-button size="small" type="danger" @click="$emit('delete', row.id)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="detailTotal > filters.page_size"
      class="pagination"
      :current-page="filters.page"
      :page-size="filters.page_size"
      :total="detailTotal"
      layout="prev, pager, next"
      @current-change="$emit('page-change', $event)"
    />
  </el-card>
</template>

<script setup>
const props = defineProps({
  canWrite: { type: Boolean, required: true },
  options: { type: Object, required: true },
  filters: { type: Object, required: true },
  detailData: { type: Array, required: true },
  detailTotal: { type: Number, required: true },
  loadingDetail: { type: Boolean, required: true },
  rowClassName: { type: Function, required: true },
})

const emit = defineEmits([
  'update-filter',
  'filter-change',
  'keyword-input',
  'clear-filter',
  'page-change',
  'edit',
  'delete',
])

const updateFilter = (field, value) => {
  emit('update-filter', { [field]: value })
}
</script>
