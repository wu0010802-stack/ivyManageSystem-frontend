<script setup lang="ts">
import { formatSemester, roleLabel, formatCoTeachers, formatHeadcount, formatNetChange, type ClassHistoryRow } from '@/utils/classHistory'

defineProps<{ rows: ClassHistoryRow[]; loading: boolean }>()
</script>

<template>
  <el-table v-if="rows.length" :data="rows" style="width: 100%;" size="small">
    <el-table-column label="學年 / 學期" width="150">
      <template #default="scope">
        {{ formatSemester(scope.row.school_year, scope.row.semester) }}
        <el-tag v-if="scope.row.is_current" type="success" size="small">現在</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="班級（年級）">
      <template #default="scope">
        {{ scope.row.classroom_name }}<span v-if="scope.row.grade_name">（{{ scope.row.grade_name }}）</span>
      </template>
    </el-table-column>
    <el-table-column label="角色" width="90">
      <template #default="scope">
        <el-tag :type="scope.row.role === 'head' ? 'primary' : 'warning'" size="small">
          {{ roleLabel(scope.row.role) }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="同班搭檔">
      <template #default="scope">{{ formatCoTeachers(scope.row.co_teachers) }}</template>
    </el-table-column>
    <el-table-column label="期初 → 期末" width="140">
      <template #default="scope">{{ formatHeadcount(scope.row) }}</template>
    </el-table-column>
    <el-table-column label="淨變化" width="100">
      <template #default="scope">
        <span :class="`net-${formatNetChange(scope.row.net_change).type}`">
          {{ formatNetChange(scope.row.net_change).text }}
        </span>
      </template>
    </el-table-column>
  </el-table>
  <el-empty v-else-if="!loading" description="尚無帶班紀錄" />
</template>

<style scoped>
.net-up { color: var(--el-color-success); }
.net-down { color: var(--el-color-danger); }
.net-flat,
.net-none { color: var(--el-text-color-secondary); }
</style>
