<script setup lang="ts">
interface StudentDetailRow {
  student_id: number
  student_no: string
  name: string
  id_number: string | null
  classroom_name: string
  age_group: string
  expected_days: number
  actual_days: number
  attendance_rate_pct: number
  is_disadvantaged: boolean
}

defineProps<{ rows: StudentDetailRow[] }>()
</script>

<template>
  <el-table :data="rows" border stripe size="small" max-height="600">
    <el-table-column prop="student_no" label="學號" width="90" sortable />
    <el-table-column prop="name" label="姓名" width="100" />
    <el-table-column label="身分證" width="120">
      <template #default="{ row }">{{ row.id_number || '-' }}</template>
    </el-table-column>
    <el-table-column prop="classroom_name" label="班級" width="100" />
    <el-table-column prop="age_group" label="年齡層" width="80">
      <template #default="{ row }">{{ row.age_group }} 歲</template>
    </el-table-column>
    <el-table-column prop="expected_days" label="應到日數" width="90" align="right" sortable />
    <el-table-column prop="actual_days" label="實到日數" width="90" align="right" sortable />
    <el-table-column label="出席率" width="80" align="right" sortable>
      <template #default="{ row }">{{ row.attendance_rate_pct.toFixed(2) }}%</template>
    </el-table-column>
    <el-table-column label="弱勢" width="60" align="center">
      <template #default="{ row }">
        <el-tag v-if="row.is_disadvantaged" type="warning" size="small">是</el-tag>
        <span v-else>否</span>
      </template>
    </el-table-column>
  </el-table>
</template>
