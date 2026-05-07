<script setup>
/**
 * 家長首頁今日待辦中心。
 *
 * 接受 pre-flattened todos 陣列，逐列渲染（icon + 文字 + arrow）。
 * 為純呈現元件，路由由父層透過 `@navigate="go"` 接住。
 * 排序由父層（HomeView）依 KEY_PRIORITY 預先處理，本元件直接依陣列順序渲染。
 *
 * todos item shape:
 *   { key, icon, tint, primaryText, count?, suffix?, warn?, path }
 *
 * 渲染時 `count` 會以 <strong> 強調（紅色 / tabular-nums）保留原有設計。
 * 若 todos 為空陣列，仍渲染區塊但顯示「目前沒有待辦 ✨」（IA v2 Phase 3）。
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
  <section class="todos-card">
    <h3 class="section-title todos-title">需要你處理（{{ todos.length }}）</h3>
    <template v-if="todos.length">
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
    </template>
    <p v-else class="todos-empty-msg">目前沒有待辦 ✨</p>
  </section>
</template>

<style scoped>
.section-title {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-muted);
  margin: 0 0 8px 4px;
  letter-spacing: 0.02em;
}

.todos-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 6px 0 4px;
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  overflow: hidden;
}
.todos-title { margin: 12px 16px 6px; }
.todo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--pt-border-light);
  text-align: left;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
  cursor: pointer;
}
.todos-card .todo-row:first-of-type {
  border-top: none;
}
.todo-row:active { background: var(--pt-surface-mute-soft); }

.todo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  flex-shrink: 0;
}
.todo-icon.tint-money       { background: var(--pt-tint-money);        color: var(--pt-tint-money-fg);        border: 2px solid var(--pt-tint-money-fg); }
.todo-icon.tint-message     { background: var(--pt-tint-message);      color: var(--pt-tint-message-fg);      border: 2px solid var(--pt-tint-message-fg); }
.todo-icon.tint-event       { background: var(--pt-tint-event);        color: var(--pt-tint-event-fg);        border: 2px solid var(--pt-tint-event-fg); }
.todo-icon.tint-announcement{ background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); border: 2px solid var(--pt-tint-announcement-fg); }
.todo-icon.tint-leave       { background: var(--pt-tint-leave);        color: var(--pt-tint-leave-fg);        border: 2px solid var(--pt-tint-leave-fg); }
.todo-icon.tint-activity    { background: var(--pt-tint-activity);     color: var(--pt-tint-activity-fg);     border: 2px solid var(--pt-tint-activity-fg); }

.todo-text { flex: 1; line-height: 1.45; }
.todo-text strong {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold, 700);
  margin: 0 2px;
  font-variant-numeric: tabular-nums;
}
.todo-warn { color: var(--color-danger); font-size: var(--text-xs, 12px); }
.todo-arrow { color: var(--pt-text-disabled); flex-shrink: 0; }

.todos-empty-msg {
  margin: 4px 16px 14px;
  padding: 12px 14px;
  text-align: center;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-placeholder);
  background: var(--pt-surface-mute-soft, transparent);
  border-radius: var(--radius-md, 8px);
}
</style>
