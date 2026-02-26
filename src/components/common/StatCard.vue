<template>
  <el-card shadow="hover" class="stat-card">
    <div class="stat-card__body">
      <div class="stat-card__content">
        <span class="stat-card__label">{{ label }}</span>
        <div class="stat-card__value">{{ value }}</div>
      </div>
      <div class="stat-card__icon" :style="iconStyle">
        <el-icon :size="24" :style="{ color: colorMap[color] }">
          <component :is="icon" />
        </el-icon>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  icon: { type: [String, Object], required: true },
  color: { type: String, default: 'primary', validator: v => ['primary', 'success', 'warning', 'danger', 'info'].includes(v) }
})

const colorMap = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)'
}

const bgMap = {
  primary: 'var(--color-primary-lighter)',
  success: 'var(--color-success-lighter)',
  warning: 'var(--color-warning-lighter)',
  danger: 'var(--color-danger-lighter)',
  info: 'var(--color-info-lighter)'
}

const iconStyle = computed(() => ({
  backgroundColor: bgMap[props.color],
  width: '48px',
  height: '48px',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}))
</script>

<style scoped>
.stat-card__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-card__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  display: block;
  margin-bottom: var(--space-2);
}

.stat-card__value {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text-primary);
}
</style>
