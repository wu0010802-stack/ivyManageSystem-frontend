<script setup>
import { computed } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'

const props = defineProps({
  summary: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  showMenu: { type: Boolean, default: true },
})
const emit = defineEmits(['update:selected', 'action'])

function onCheckboxChange(v) { emit('update:selected', v) }
function onMenuClick(action) { emit('action', { action, summary: props.summary }) }
</script>

<template>
  <div class="summary-card" :class="{ selected }">
    <div class="card-header">
      <el-checkbox :model-value="selected" @update:model-value="onCheckboxChange"
                   :data-test="`card-checkbox-${summary.id}`" />
      <span class="employee-name">{{ summary.employee_name }}</span>
      <el-dropdown v-if="showMenu" trigger="click" @command="onMenuClick">
        <el-icon class="menu-icon"><MoreFilled /></el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="sign">簽核</el-dropdown-item>
            <el-dropdown-item command="reject">退簽</el-dropdown-item>
            <el-dropdown-item command="comment">留言</el-dropdown-item>
            <el-dropdown-item command="log">看 log</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="card-body">
      <div>總分：<strong>{{ Number(summary.total_score).toFixed(2) }}</strong></div>
      <div>等第：<el-tag size="small">{{ summary.grade }}</el-tag></div>
      <div>獎金：{{ Number(summary.bonus_amount).toLocaleString() }}</div>
    </div>
  </div>
</template>

<style scoped>
.summary-card {
  border: 1px solid var(--el-border-color); border-radius: 6px;
  padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
  background: var(--el-bg-color);
}
.summary-card.selected { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.card-header { display: flex; align-items: center; gap: 8px; }
.employee-name { flex: 1; font-weight: 600; }
.menu-icon { cursor: pointer; padding: 4px; }
.card-body { font-size: 12px; display: flex; flex-direction: column; gap: 2px; color: var(--el-text-color-regular); }
</style>
