<script setup lang="ts">
import ParentIcon from '../ParentIcon.vue'

interface Child {
  student_id: number
  name?: string
  classroom_name?: string
}

defineProps<{
  children: Child[]
}>()

function initialOf(name: string | undefined): string {
  return String(name || '孩').slice(0, 1)
}
</script>

<template>
  <section class="children-list" aria-labelledby="children-list-title">
    <header class="header">
      <h2 id="children-list-title" class="title">我的孩子</h2>
    </header>

    <p v-if="children.length === 0" class="empty">尚未綁定子女</p>

    <ul v-else class="list">
      <li v-for="c in children" :key="c.student_id" class="row">
        <router-link :to="`/children/${c.student_id}`" class="row-link">
          <span class="avatar" aria-hidden="true">{{ initialOf(c.name) }}</span>
          <span class="meta">
            <span class="name">{{ c.name }}</span>
            <span v-if="c.classroom_name" class="cls">{{ c.classroom_name }}</span>
          </span>
          <ParentIcon name="chevron-right" size="sm" class="chev" />
        </router-link>
      </li>
    </ul>

    <router-link to="/bind-additional" class="add-row">
      <ParentIcon name="plus" size="sm" class="add-icon" />
      <span>加綁子女</span>
    </router-link>
  </section>
</template>

<style scoped>
.children-list {
  background: var(--m3-surface-container-low, var(--pt-surface-card, var(--neutral-0)));
  border-radius: 12px;
  padding: var(--space-4, 16px);
  box-shadow: var(--m3-elev-1, var(--pt-elev-1));
}
.title { font-size: var(--text-base, 15px); font-weight: var(--font-weight-semibold, 600); margin: 0 0 var(--space-3, 12px); }
.empty { color: var(--m3-on-surface-variant, var(--pt-text-muted)); margin: 0 0 var(--space-3, 12px); }
.list { list-style: none; margin: 0 0 var(--space-2, 8px); padding: 0; display: flex; flex-direction: column; gap: var(--space-1, 4px); }
.row-link {
  display: flex; align-items: center; gap: var(--space-3, 12px);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-md, 10px);
  text-decoration: none; color: inherit;
}
.row-link:active { background: var(--m3-primary-container, var(--brand-primary-soft)); }
.avatar {
  width: 36px; height: 36px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 12px;
  background: var(--brand-primary-soft, var(--ivy-leaf-bg, #f5fbe6));
  color: var(--brand-primary);
  font-weight: 800;
  font-size: 16px;
}
.meta { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.name { font-weight: var(--font-weight-semibold, 600); }
.cls { color: var(--m3-on-surface-variant, var(--pt-text-muted)); font-size: var(--text-xs, 11px); }
.chev { color: var(--m3-on-surface-variant, var(--pt-text-placeholder)); }
.add-row {
  display: flex; align-items: center; gap: var(--space-2, 8px);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-top: var(--m3-outline-variant, var(--pt-hairline));
  color: var(--m3-primary, var(--brand-primary));
  text-decoration: none;
  font-weight: var(--font-weight-semibold, 600);
}
.add-icon { color: var(--brand-primary); }
</style>
