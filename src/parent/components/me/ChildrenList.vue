<script setup>
defineProps({
  children: { type: Array, required: true },
})
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
          <span class="avatar" aria-hidden="true">👶</span>
          <span class="meta">
            <span class="name">{{ c.name }}</span>
            <span v-if="c.classroom_name" class="cls">{{ c.classroom_name }}</span>
          </span>
          <span class="chev" aria-hidden="true">›</span>
        </router-link>
      </li>
    </ul>

    <router-link to="/bind-additional" class="add-row">
      <span class="add-icon" aria-hidden="true">＋</span>
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
.avatar { font-size: 22px; }
.meta { flex: 1; display: flex; flex-direction: column; }
.name { font-weight: var(--font-weight-semibold, 600); }
.cls { color: var(--m3-on-surface-variant, var(--pt-text-muted)); font-size: var(--text-xs, 11px); }
.chev { color: var(--m3-on-surface-variant, var(--pt-text-placeholder)); font-size: 20px; }
.add-row {
  display: flex; align-items: center; gap: var(--space-2, 8px);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-top: var(--m3-outline-variant, var(--pt-hairline));
  color: var(--m3-primary, var(--brand-primary));
  text-decoration: none;
  font-weight: var(--font-weight-semibold, 600);
}
.add-icon { font-size: 20px; }
</style>
