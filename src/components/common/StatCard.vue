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

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  icon: { type: [String, Object], required: true },
  color: { type: String, default: 'primary', validator: v => ['primary', 'success', 'warning', 'danger', 'info'].includes(v) },
  variant: { type: String, default: 'default', validator: v => ['default', 'filled'].includes(v) }
})
</script>

<style scoped>
.stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px 24px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  height: 100%;
  box-sizing: border-box;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
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
  color: #64748b;
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  white-space: nowrap;
}

.stat-card__value {
  font-size: 30px;
  font-weight: 700;
  color: #1e293b;
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
.stat-card--default.stat-card--primary .stat-card__icon-wrap { background: #e0e7ff; color: #4f46e5; }
.stat-card--default.stat-card--success .stat-card__icon-wrap { background: #dcfce7; color: #10b981; }
.stat-card--default.stat-card--warning .stat-card__icon-wrap { background: #fef3c7; color: #f59e0b; }
.stat-card--default.stat-card--danger  .stat-card__icon-wrap { background: #fee2e2; color: #ef4444; }
.stat-card--default.stat-card--info    .stat-card__icon-wrap { background: #dbeafe; color: #3b82f6; }

/* ── filled variant (Material 3 tonal) ── */
.stat-card--filled { border-color: transparent; }

.stat-card--filled.stat-card--primary { background: #eef0fd; }
.stat-card--filled.stat-card--success  { background: #e7faf3; }
.stat-card--filled.stat-card--warning  { background: #fef8ec; }
.stat-card--filled.stat-card--danger   { background: #fff1f1; }
.stat-card--filled.stat-card--info     { background: #eff6ff; }

.stat-card--filled .stat-card__label { color: #475569; }

.stat-card--filled.stat-card--primary .stat-card__value { color: #4338ca; }
.stat-card--filled.stat-card--success  .stat-card__value { color: #059669; }
.stat-card--filled.stat-card--warning  .stat-card__value { color: #d97706; }
.stat-card--filled.stat-card--danger   .stat-card__value { color: #dc2626; }
.stat-card--filled.stat-card--info     .stat-card__value { color: #2563eb; }

.stat-card--filled.stat-card--primary .stat-card__icon-wrap { background: rgba(79,70,229,0.12);  color: #4338ca; }
.stat-card--filled.stat-card--success  .stat-card__icon-wrap { background: rgba(16,185,129,0.12); color: #059669; }
.stat-card--filled.stat-card--warning  .stat-card__icon-wrap { background: rgba(245,158,11,0.12); color: #d97706; }
.stat-card--filled.stat-card--danger   .stat-card__icon-wrap { background: rgba(239,68,68,0.12);  color: #dc2626; }
.stat-card--filled.stat-card--info     .stat-card__icon-wrap { background: rgba(59,130,246,0.12); color: #2563eb; }

.stat-card--filled:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
</style>
