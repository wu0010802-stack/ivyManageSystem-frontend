<script setup>
import { hasPermission } from '@/utils/auth'
import GuardianManager from '@/components/student/GuardianManager.vue'

defineProps({
  studentId: { type: Number, required: true },
})
const emit = defineEmits(['changed'])

const canRead = hasPermission('GUARDIANS_READ')
</script>

<template>
  <div class="guardians-tab">
    <GuardianManager
      v-if="canRead && studentId"
      :student-id="studentId"
      @change="emit('changed')"
    />
    <el-empty v-else description="您沒有檢視監護人資料的權限" />
  </div>
</template>
