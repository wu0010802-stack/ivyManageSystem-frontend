<script setup lang="ts">
defineProps<{ employee: Record<string, unknown> }>()
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="聯絡電話"><span :class="{ 'crisp-empty': !employee.phone }">{{ employee.phone || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="生日"><span :class="{ 'crisp-empty': !employee.birthday }">{{ employee.birthday || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="身分證"><span :class="{ 'crisp-empty': !employee.id_number }">{{ employee.id_number || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="眷屬人數"><span :class="{ 'crisp-empty': employee.dependents == null }">{{ employee.dependents ?? '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="Email"><span :class="{ 'crisp-empty': !employee.email }">{{ employee.email || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="性別"><span :class="{ 'crisp-empty': !employee.gender }">{{ employee.gender || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="通訊地址" :span="2"><span :class="{ 'crisp-empty': !employee.address }">{{ employee.address || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="緊急聯絡人"><span :class="{ 'crisp-empty': !employee.emergency_contact_name }">{{ employee.emergency_contact_name || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="緊急聯絡電話"><span :class="{ 'crisp-empty': !employee.emergency_contact_phone }">{{ employee.emergency_contact_phone || '未填寫' }}</span></el-descriptions-item>
  </el-descriptions>
</template>
