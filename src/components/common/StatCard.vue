<template>
  <div class="stat-card" :class="[`stat-card--${variant}`, `stat-card--${color}`]">
    <div class="stat-card__body">
      <div class="stat-card__content">
        <span class="stat-card__label">{{ label }}</span>
        <div class="stat-card__value">{{ value }}</div>
      </div>
      <div class="stat-card__icon-wrap">
        <el-icon :size="20"><component :is="icon" /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: string | number
  icon: string | object
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  variant?: 'default' | 'filled'
}>(), {
  color: 'primary',
  variant: 'default',
})
</script>

<style scoped>
.stat-card {
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 24px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  height: 100%;
  box-sizing: border-box;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: var(--neutral-300);
}

.stat-card__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.stat-card__content {
  min-width: 0;
}

.stat-card__label {
  font-size: 13px;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  white-space: nowrap;
}

.stat-card__value {
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.stat-card__icon-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── default variant ── */
.stat-card--default.stat-card--primary .stat-card__icon-wrap { background: var(--brand-primary-soft); color: var(--brand-primary); }
.stat-card--default.stat-card--success .stat-card__icon-wrap { background: var(--color-success-soft); color: var(--color-success); }
.stat-card--default.stat-card--warning .stat-card__icon-wrap { background: var(--color-warning-soft); color: var(--color-warning); }
.stat-card--default.stat-card--danger  .stat-card__icon-wrap { background: var(--color-danger-soft); color: var(--color-danger); }
.stat-card--default.stat-card--info    .stat-card__icon-wrap { background: var(--color-info-soft); color: var(--color-info); }

/* ── filled variant (Material 3 tonal) ── */
.stat-card--filled { border-color: transparent; }

.stat-card--filled.stat-card--primary { background: #eef0fd; }
.stat-card--filled.stat-card--success  { background: #e7faf3; }
.stat-card--filled.stat-card--warning  { background: #fef8ec; }
.stat-card--filled.stat-card--danger   { background: #fff1f1; }
.stat-card--filled.stat-card--info     { background: var(--color-info-soft); }

.stat-card--filled .stat-card__label { color: var(--neutral-600); }

.stat-card--filled.stat-card--primary .stat-card__value { color: var(--brand-primary-hover); }
.stat-card--filled.stat-card--success  .stat-card__value { color: var(--color-success-hover); }
.stat-card--filled.stat-card--warning  .stat-card__value { color: var(--color-warning-hover); }
.stat-card--filled.stat-card--danger   .stat-card__value { color: var(--color-danger-hover); }
.stat-card--filled.stat-card--info     .stat-card__value { color: var(--color-info-hover); }

.stat-card--filled.stat-card--primary .stat-card__icon-wrap { background: rgba(79,70,229,0.12);  color: var(--brand-primary-hover); }
.stat-card--filled.stat-card--success  .stat-card__icon-wrap { background: rgba(16,185,129,0.12); color: var(--color-success-hover); }
.stat-card--filled.stat-card--warning  .stat-card__icon-wrap { background: rgba(245,158,11,0.12); color: var(--color-warning-hover); }
.stat-card--filled.stat-card--danger   .stat-card__icon-wrap { background: rgba(239,68,68,0.12);  color: var(--color-danger-hover); }
.stat-card--filled.stat-card--info     .stat-card__icon-wrap { background: rgba(59,130,246,0.12); color: var(--color-info-hover); }

.stat-card--filled:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
</style>
