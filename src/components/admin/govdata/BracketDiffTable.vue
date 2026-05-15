<template>
  <table class="diff-table">
    <thead>
      <tr>
        <th>狀態</th>
        <th>amount</th>
        <th>欄位</th>
        <th>原值</th>
        <th>新值</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in modifiedRows" :key="`m-${row.amount}-${row.field}`" class="row-modified">
        <td>變更</td>
        <td>{{ row.amount }}</td>
        <td>{{ row.field }}</td>
        <td>{{ row.old }}</td>
        <td>{{ row.new }}</td>
      </tr>
      <tr v-for="row in addedRows" :key="`a-${row.amount}`" class="row-added">
        <td>新增</td>
        <td>{{ row.amount }}</td>
        <td colspan="3">完整新增</td>
      </tr>
      <tr v-for="row in removedRows" :key="`r-${row.amount}`" class="row-removed">
        <td>刪除</td>
        <td>{{ row.amount }}</td>
        <td colspan="3">已從新版移除</td>
      </tr>
      <tr v-if="!hasAny" class="row-noop">
        <td colspan="5">與現行版本完全一致（無變化）</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  diffSummary: { type: Object, required: true },
})

const modifiedRows = computed(() => props.diffSummary.modified || [])
const addedRows = computed(() => props.diffSummary.added || [])
const removedRows = computed(() => props.diffSummary.removed || [])
const hasAny = computed(
  () => modifiedRows.value.length || addedRows.value.length || removedRows.value.length
)
</script>

<style scoped>
.row-added { background: #e8f5e9; }
.row-removed { background: #ffebee; }
.row-modified { background: #fff8e1; }
.row-noop { color: var(--text-tertiary); }
.diff-table { width: 100%; border-collapse: collapse; }
.diff-table th, .diff-table td {
  border: 1px solid #ddd;
  padding: 6px 10px;
  text-align: left;
  font-size: 13px;
}
.diff-table th { background: #f5f5f5; }
</style>
