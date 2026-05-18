<script setup>
defineProps({
  items: { type: Array, required: true },
})

const signClass = (sign, delta) => {
  const n = Number(delta)
  if (n > 0) return 'sign-positive'
  if (n < 0) return 'sign-negative'
  return 'sign-neutral'
}
</script>

<template>
  <el-table :data="items" stripe size="small">
    <el-table-column label="項目" min-width="160">
      <template #default="{ row }">
        <span>{{ row.label }}</span>
      </template>
    </el-table-column>
    <el-table-column label="性質" width="80">
      <template #default="{ row }">
        <el-tag
          :type="row.sign === 'POSITIVE' ? 'success' : row.sign === 'NEGATIVE' ? 'danger' : 'info'"
          size="small"
        >
          {{ row.sign === 'POSITIVE' ? '加分' : row.sign === 'NEGATIVE' ? '扣分' : '中性' }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="加減分" width="100" align="right">
      <template #default="{ row }">
        <span :class="signClass(row.sign, row.score_delta)">
          {{ Number(row.score_delta) > 0 ? '+' : '' }}{{ row.score_delta }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="原始值" width="90" align="right">
      <template #default="{ row }">
        <span v-if="row.raw_value !== null && row.raw_value !== undefined">{{ row.raw_value }}</span>
        <span v-else class="empty">—</span>
      </template>
    </el-table-column>
    <el-table-column label="備註" min-width="120">
      <template #default="{ row }">
        <span v-if="row.note">{{ row.note }}</span>
        <span v-else class="empty">—</span>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.sign-positive { color: #1e7e34; font-weight: 600; }
.sign-negative { color: #b91c1c; font-weight: 600; }
.sign-neutral { color: var(--pt-text-muted, #6b7280); }
.empty { color: var(--neutral-300, #cbd5e1); }
</style>
