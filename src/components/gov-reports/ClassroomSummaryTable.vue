<script setup lang="ts">
import { computed } from 'vue'

interface ClassroomSummaryRow {
  classroom_id: number | null
  classroom_name: string
  age_group: string
  expected_days: number
  actual_days: number
  attendance_rate_pct: number
  total_count: number
  male_count: number
  female_count: number
  disadvantaged_count: number
  disability_count: number
  indigenous_count: number
  foreign_count: number
}

const props = defineProps<{ rows: ClassroomSummaryRow[] }>()

const totals = computed(() => {
  const t = {
    expected_days: 0,
    actual_days: 0,
    male: 0,
    female: 0,
    disadvantaged: 0,
    disability: 0,
    indigenous: 0,
    foreign: 0,
  }
  for (const r of props.rows) {
    t.expected_days += r.expected_days
    t.actual_days += r.actual_days
    t.male += r.male_count
    t.female += r.female_count
    t.disadvantaged += r.disadvantaged_count
    t.disability += r.disability_count
    t.indigenous += r.indigenous_count
    t.foreign += r.foreign_count
  }
  return t
})

const totalRate = computed(() =>
  totals.value.expected_days
    ? ((totals.value.actual_days / totals.value.expected_days) * 100).toFixed(2)
    : '0.00',
)
</script>

<template>
  <el-table :data="rows" border stripe size="small">
    <el-table-column prop="classroom_name" label="班級" min-width="100" />
    <el-table-column prop="age_group" label="年齡層" width="80">
      <template #default="{ row }">{{ row.age_group }} 歲</template>
    </el-table-column>
    <el-table-column prop="expected_days" label="應到人日" width="90" align="right" />
    <el-table-column prop="actual_days" label="實到人日" width="90" align="right" />
    <el-table-column label="出席率" width="80" align="right">
      <template #default="{ row }">{{ row.attendance_rate_pct.toFixed(2) }}%</template>
    </el-table-column>
    <el-table-column prop="male_count" label="男" width="60" align="right" />
    <el-table-column prop="female_count" label="女" width="60" align="right" />
    <el-table-column prop="disadvantaged_count" label="弱勢" width="60" align="right" />
    <el-table-column prop="disability_count" label="身障" width="60" align="right" />
    <el-table-column prop="indigenous_count" label="原民" width="60" align="right" />
    <el-table-column prop="foreign_count" label="外籍" width="60" align="right" />
    <template #append>
      <div class="totals-row">
        <strong>合計</strong>
        <span>應到 {{ totals.expected_days }} / 實到 {{ totals.actual_days }} ({{ totalRate }}%)</span>
        <span>男 {{ totals.male }} / 女 {{ totals.female }}</span>
        <span>弱勢 {{ totals.disadvantaged }} / 身障 {{ totals.disability }} / 原民 {{ totals.indigenous }} / 外籍 {{ totals.foreign }}</span>
      </div>
    </template>
  </el-table>
</template>

<style scoped>
.totals-row {
  padding: 8px 12px;
  background: #f0f4ff;
  display: flex;
  gap: 24px;
  font-size: 13px;
}
</style>
