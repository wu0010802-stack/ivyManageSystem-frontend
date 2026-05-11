<script setup>
/**
 * 家長首頁今日待辦中心。
 *
 * 接受 pre-flattened todos 陣列，逐列渲染（icon + 文字 + arrow）。
 * 為純呈現元件，路由由父層透過 `@navigate="go"` 接住。
 *
 * todos item shape:
 *   { key, icon, tint, primaryText, count?, suffix?, warn?, path }
 *
 * 渲染時 `count` 會以 <strong> 強調（紅色 / tabular-nums）保留原有設計。
 * 若 todos 為空陣列，則顯示「目前沒有待辦事項」空狀態。
 */
import ParentIcon from '../ParentIcon.vue'

defineProps({
  todos: {
    type: Array,
    default: () => [],
    validator: (arr) =>
      arr.every((t) => t && typeof t.key === 'string' && typeof t.path === 'string'),
  },
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <section v-if="todos.length" class="todos-section">
    <div class="pt-section-head">
      <h3 class="pt-section-title">今日待辦</h3>
      <span class="todo-total">{{ todos.length }} 件</span>
    </div>
    <button
      v-for="t in todos"
      :key="t.key"
      class="todo-row press-scale"
      type="button"
      @click="emit('navigate', t.path)"
    >
      <span class="todo-icon" :class="`tint-${t.tint}`">
        <ParentIcon :name="t.icon" size="sm" />
      </span>
      <span class="todo-text">
        {{ t.primaryText }}
        <strong v-if="t.count != null">{{ t.count }}</strong>
        <template v-if="t.suffix">{{ t.suffix }}</template>
        <span v-if="t.warn" class="todo-warn">{{ t.warn }}</span>
      </span>
      <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
    </button>
  </section>
  <section v-else class="todos-empty">
    <span class="todos-empty-icon" aria-hidden="true">
      <ParentIcon name="check" size="sm" />
    </span>
    目前沒有待辦事項
  </section>
</template>

<style scoped>
.todos-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.todo-total {
  color: var(--pt-text-faint);
  font-size: 12px;
  font-weight: 700;
}
.todo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  background: var(--pt-surface-card);
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: var(--pt-card-radius, 14px);
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  text-align: left;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
  cursor: pointer;
}
.todo-row:active { background: var(--pt-surface-mute-soft); }

.todo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  flex-shrink: 0;
}
.todo-icon.tint-money       { background: var(--pt-tint-money);        color: var(--pt-tint-money-fg);        border: 1px solid color-mix(in srgb, var(--pt-tint-money-fg) 34%, transparent); }
.todo-icon.tint-message     { background: var(--pt-tint-message);      color: var(--pt-tint-message-fg);      border: 1px solid color-mix(in srgb, var(--pt-tint-message-fg) 34%, transparent); }
.todo-icon.tint-event       { background: var(--pt-tint-event);        color: var(--pt-tint-event-fg);        border: 1px solid color-mix(in srgb, var(--pt-tint-event-fg) 34%, transparent); }
.todo-icon.tint-announcement{ background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); border: 1px solid color-mix(in srgb, var(--pt-tint-announcement-fg) 34%, transparent); }
.todo-icon.tint-leave       { background: var(--pt-tint-leave);        color: var(--pt-tint-leave-fg);        border: 1px solid color-mix(in srgb, var(--pt-tint-leave-fg) 34%, transparent); }
.todo-icon.tint-activity    { background: var(--pt-tint-activity);     color: var(--pt-tint-activity-fg);     border: 1px solid color-mix(in srgb, var(--pt-tint-activity-fg) 34%, transparent); }

.todo-text { flex: 1; line-height: 1.45; font-weight: 700; }
.todo-text strong {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold, 700);
  margin: 0 2px;
  font-variant-numeric: tabular-nums;
}
.todo-warn { color: var(--color-danger); font-size: var(--text-xs, 12px); }
.todo-arrow { color: var(--pt-text-disabled); flex-shrink: 0; }

.todos-empty {
  background: var(--pt-surface-card);
  border-radius: var(--pt-card-radius, 14px);
  padding: 18px 16px;
  text-align: center;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-placeholder);
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  border: 1px solid var(--pt-page-border, var(--pt-border));
}
.todos-empty-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full, 9999px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  vertical-align: middle;
}
</style>
