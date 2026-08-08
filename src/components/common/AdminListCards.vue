<script setup lang="ts">
// 手機用的泛型卡片列表（dumb presentational）。桌機請續用 el-table；
// 由各頁 v-if="!isMobile" 決定何時改用本元件（比照 PortalAttendanceView 範式）。
interface AdminListColumn {
  label: string
  prop: string
  formatter?: (item: Record<string, unknown>) => unknown
  /** 長文字欄（描述、原因、摘要）：標籤在上、內容整寬左對齊，
   *  避免右對齊窄欄把整段文字擠成鋸齒狀 */
  block?: boolean
}

const props = defineProps<{
  items: Record<string, unknown>[]
  columns: AdminListColumn[]
  rowKey: string
  loading?: boolean
  emptyText?: string
}>()

function cellValue(col: AdminListColumn, item: Record<string, unknown>): unknown {
  return col.formatter ? col.formatter(item) : item[col.prop]
}
function titleFallback(item: Record<string, unknown>): unknown {
  return props.columns.length ? item[props.columns[0].prop] : ''
}
</script>

<template>
  <div class="admin-list-cards">
    <template v-if="loading">
      <el-card v-for="n in 3" :key="`sk-${n}`" class="alc-card alc-card--skeleton" shadow="never">
        <el-skeleton :rows="3" animated />
      </el-card>
    </template>

    <div v-else-if="!items.length" class="alc-empty">
      <slot name="empty">{{ emptyText || '目前沒有資料' }}</slot>
    </div>

    <template v-else>
      <el-card
        v-for="item in items"
        :key="String(item[rowKey])"
        class="alc-card"
        shadow="never"
      >
        <header class="alc-card__title">
          <slot name="title" :item="item">{{ titleFallback(item) }}</slot>
        </header>
        <dl class="alc-card__fields">
          <div
            v-for="col in columns"
            :key="col.prop"
            class="alc-field"
            :class="{ 'alc-field--block': col.block }"
          >
            <dt class="alc-field__label">{{ col.label }}</dt>
            <dd class="alc-field__value">
              <slot :name="`cell-${col.prop}`" :item="item">{{ cellValue(col, item) }}</slot>
            </dd>
          </div>
        </dl>
        <footer v-if="$slots.actions" class="alc-card__actions">
          <slot name="actions" :item="item" />
        </footer>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.admin-list-cards {
  display: grid;
  gap: var(--space-3);
}
.alc-card {
  border-radius: var(--radius-lg);
}
.alc-card__title {
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}
.alc-card__fields {
  display: grid;
  gap: var(--space-1);
  margin: 0;
}
.alc-field {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 28px;
  align-items: center;
}
.alc-field__label {
  color: var(--text-secondary);
  flex-shrink: 0;
}
.alc-field__value {
  text-align: right;
  color: var(--text-primary);
  margin: 0;
}
/* 長文字欄：改直向堆疊、整寬左對齊，與前一欄留間距 */
.alc-field--block {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  margin-top: var(--space-1);
}
.alc-field--block .alc-field__value {
  text-align: left;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.alc-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}
/* P3-2：卡片操作觸控目標 ≥44px */
.alc-card__actions :deep(.el-button) {
  min-height: 44px;
}
.alc-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: var(--space-6);
}
</style>
