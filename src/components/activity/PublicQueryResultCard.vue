<template>
  <div class="pub-card">
    <div class="query-header">
      <div class="query-student">
        <span class="query-name">{{ registration.name }}</span>
        <span class="query-class">{{ registration.class_name }}</span>
      </div>
      <div class="payment-info">
        <el-tag :type="paymentTagType" size="small">{{ paymentLabel }}</el-tag>
        <span v-if="registration.total_amount > 0" class="payment-progress-text">
          NT${{ registration.paid_amount?.toLocaleString() }} /
          NT${{ registration.total_amount?.toLocaleString() }}
        </span>
      </div>
    </div>
    <div class="course-list">
      <div
        v-for="item in registration.courses"
        :key="item.name"
        class="result-course-row"
      >
        <span class="result-course-name">{{ item.name }}</span>
        <el-tag
          :type="item.status === 'enrolled' ? 'success' : 'warning'"
          size="small"
        >
          {{ item.status === 'enrolled' ? '正式' : `候補 #${item.waitlist_position}` }}
        </el-tag>
      </div>
      <div v-if="registration.courses.length === 0" class="empty-hint">尚無報名課程</div>
    </div>
    <div v-if="registration.supplies?.length" class="supply-list">
      <div class="supply-list-title">用品</div>
      <span v-for="s in registration.supplies" :key="s" class="supply-chip">{{ s }}</span>
    </div>
    <div v-if="registration.remark" class="result-notes">備註：{{ registration.remark }}</div>
    <div class="query-actions">
      <el-button v-if="registrationOpen" type="primary" @click="$emit('edit')">修改報名</el-button>
      <el-button @click="$emit('inquiry')">提問</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { PAYMENT_STATUS_TAG_TYPE, PAYMENT_STATUS_LABEL } from '@/constants/activity'

const props = defineProps({
  registration: { type: Object, required: true },
  registrationOpen: { type: Boolean, default: false },
})
defineEmits(['edit', 'inquiry'])

const paymentTagType = computed(() =>
  PAYMENT_STATUS_TAG_TYPE[props.registration.payment_status] || 'info'
)
const paymentLabel = computed(() =>
  PAYMENT_STATUS_LABEL[props.registration.payment_status] || '未繳費'
)
</script>

<style scoped>
.pub-card { background: #fff; border-radius: 12px; padding: 16px; margin: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.query-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.query-student { display: flex; align-items: center; gap: 8px; }
.query-name { font-size: 18px; font-weight: 600; color: #333; }
.query-class { font-size: 14px; color: #888; background: #f0f0f0; padding: 2px 8px; border-radius: 12px; }
.payment-info { display: flex; align-items: center; gap: 6px; }
.payment-progress-text { font-size: 12px; color: #888; }
.result-course-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.result-course-row:last-child { border-bottom: none; }
.result-course-name { font-size: 14px; color: #333; }
.supply-list { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.supply-list-title { font-size: 12px; color: #888; margin-bottom: 6px; }
.supply-chip { display: inline-block; background: #f0f0f0; border-radius: 12px; padding: 2px 10px; font-size: 13px; color: #555; margin-right: 6px; margin-bottom: 4px; }
.result-notes { margin-top: 10px; font-size: 13px; color: #888; }
.query-actions { display: flex; gap: 10px; margin-top: 16px; }
.query-actions .el-button { flex: 1; height: 40px; }
.empty-hint { color: #aaa; font-size: 14px; text-align: center; padding: 16px 0; }
</style>
