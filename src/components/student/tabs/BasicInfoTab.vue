<script setup lang="ts">
import { computed } from 'vue'
import { hasPermission } from '@/utils/auth'
import GuardianManager from '@/components/student/GuardianManager.vue'

const props = defineProps<{
  profile: Record<string, unknown>
}>()
const emit = defineEmits<{
  'guardians-changed': []
}>()

const basic = computed(() => (props.profile?.basic as Record<string, unknown>) || {})
const health = computed(() => (props.profile?.health as Record<string, unknown>) || {})
const studentId = computed(() => (basic.value?.id as number | null) || null)
const canGuardiansRead = computed(() => hasPermission('GUARDIANS_READ'))
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

    <el-collapse v-if="canGuardiansRead && studentId" class="guardians-collapse" :model-value="['guardians']">
      <el-collapse-item title="監護人 / 緊急聯絡人" name="guardians">
        <GuardianManager :student-id="studentId" @change="emit('guardians-changed')" />
      </el-collapse-item>
    </el-collapse>
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
.guardians-collapse {
  margin-top: 18px;
}
</style>
