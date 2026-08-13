<script setup lang="ts">
import { computed, ref } from 'vue'
import { View } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import GuardianManager from '@/components/student/GuardianManager.vue'
import MedicalReasonDialog from '@/components/MedicalReasonDialog.vue'

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

// P0d-3b 法規/個資 §6 reason-gated 醫療欄位
const canReadHealth = computed(() => hasPermission('STUDENTS_HEALTH_READ'))
const showMedicalDialog = ref(false)
const studentName = computed(() => (basic.value?.name as string) || '')
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

    <div class="health-header">
      <h3 class="section-title">健康資訊</h3>
      <!-- P0d-3b 法規/個資 §6 reason-gated detail：另開 dialog 含 reason 寫稽核 -->
      <el-button
        v-if="canReadHealth && studentId"
        type="primary"
        size="small"
        @click="showMedicalDialog = true"
      >
        <!-- admin 入口不載 Material Symbols 字型（僅家長端載），這裡必須用 EP 圖示，
             否則 render 成 verified_user 原文 -->
        <el-icon><View /></el-icon>
        以稽核紀錄查看詳情
      </el-button>
    </div>
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

    <MedicalReasonDialog
      v-if="studentId"
      v-model="showMedicalDialog"
      :student-id="studentId"
      :student-name="studentName"
    />

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
.health-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 10px;
}
.health-header .section-title {
  margin: 0;
}
</style>
