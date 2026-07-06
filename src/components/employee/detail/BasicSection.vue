<script setup lang="ts">
defineProps<{ employee: Record<string, unknown> }>()
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="聯絡電話">{{ employee.phone || '—' }}</el-descriptions-item>
    <el-descriptions-item label="生日">{{ employee.birthday || '—' }}</el-descriptions-item>
    <el-descriptions-item label="身分證">{{ employee.id_number || '—' }}</el-descriptions-item>
    <el-descriptions-item label="眷屬人數">{{ employee.dependents ?? '—' }}</el-descriptions-item>
    <el-descriptions-item label="Email">{{ employee.email || '—' }}</el-descriptions-item>
    <el-descriptions-item label="性別">{{ employee.gender || '—' }}</el-descriptions-item>
    <el-descriptions-item label="通訊地址" :span="2">{{ employee.address || '—' }}</el-descriptions-item>
    <el-descriptions-item label="緊急聯絡人">{{ employee.emergency_contact_name || '—' }}</el-descriptions-item>
    <el-descriptions-item label="緊急聯絡電話">{{ employee.emergency_contact_phone || '—' }}</el-descriptions-item>
  </el-descriptions>
</template>
