<script setup>
import { computed } from 'vue'

const props = defineProps({
  profile: { type: Object, required: true },
})

const basic = computed(() => props.profile?.basic || {})
const health = computed(() => props.profile?.health || {})
</script>

<template>
  <div class="basic-info-tab">
    <h3 class="section-title">基本資料</h3>
    <el-descriptions :column="2" border>
      <el-descriptions-item label="姓名">{{ basic.name }}</el-descriptions-item>
      <el-descriptions-item label="學號">{{ basic.student_id }}</el-descriptions-item>
      <el-descriptions-item label="性別">{{ basic.gender || '—' }}</el-descriptions-item>
      <el-descriptions-item label="生日">{{ basic.birthday || '—' }}</el-descriptions-item>
      <el-descriptions-item label="班級">{{ basic.classroom_name || '未分班' }}</el-descriptions-item>
      <el-descriptions-item label="是否在籍">
        <el-tag :type="basic.is_active ? 'success' : 'info'" size="small">
          {{ basic.is_active ? '在籍' : '已離園' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="地址" :span="2">{{ basic.address || '—' }}</el-descriptions-item>
      <el-descriptions-item label="備註" :span="2">{{ basic.notes || '—' }}</el-descriptions-item>
    </el-descriptions>

    <h3 class="section-title">健康資訊</h3>
    <el-descriptions :column="2" border>
      <el-descriptions-item label="過敏">{{ health.allergy || '—' }}</el-descriptions-item>
      <el-descriptions-item label="用藥">{{ health.medication || '—' }}</el-descriptions-item>
      <el-descriptions-item label="特殊需求" :span="2">{{ health.special_needs || '—' }}</el-descriptions-item>
      <el-descriptions-item label="緊急聯絡人">
        {{ health.emergency_contact_name || '—' }}
        <span v-if="health.emergency_contact_relation">（{{ health.emergency_contact_relation }}）</span>
      </el-descriptions-item>
      <el-descriptions-item label="緊急聯絡電話">{{ health.emergency_contact_phone || '—' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 8px 0 10px;
  color: var(--el-text-color-primary);
}
.section-title:not(:first-child) {
  margin-top: 18px;
}
</style>
