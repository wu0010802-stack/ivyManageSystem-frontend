<script setup lang="ts">
type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

withDefaults(defineProps<{
  title: string
  count?: number | null
  countType?: ElTagType
  loading?: boolean
  errorMessage?: string
  emptyDescription?: string
  showEmpty?: boolean
  openFullRoute?: Record<string, unknown> | null
  hideHeader?: boolean
}>(), {
  count: null,
  countType: 'primary',
  loading: false,
  errorMessage: '',
  emptyDescription: '沒有資料',
  showEmpty: false,
  openFullRoute: null,
  hideHeader: false,
})

defineEmits<{ 'retry': [] }>()
</script>

<template>
  <el-card shadow="never" class="section-card">
    <template v-if="!hideHeader" #header>
      <div class="section-head">
        <div class="section-title">
          <span class="title-text">{{ title }}</span>
          <el-tag v-if="$slots.titleExtra" size="small" type="info">
            <slot name="titleExtra" />
          </el-tag>
          <el-badge v-if="count != null" :value="count" :type="countType" />
        </div>
        <div class="section-actions">
          <slot name="actions" />
          <router-link
            v-if="openFullRoute"
            :to="openFullRoute"
            target="_blank"
            rel="noopener"
            class="open-full-link"
            :title="`開啟完整 ${title} 頁`"
          >
            ↗
          </router-link>
        </div>
      </div>
    </template>

    <slot name="summary" />

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="section-alert"
    >
      <template #default>
        <div>
          {{ errorMessage }}
          <el-button link type="primary" size="small" @click="$emit('retry')">重試</el-button>
        </div>
      </template>
    </el-alert>

    <div v-if="loading && !errorMessage" class="section-skeleton">
      <el-skeleton :rows="4" animated />
    </div>

    <slot v-else-if="!errorMessage" />

    <el-empty
      v-if="!loading && !errorMessage && showEmpty"
      :description="emptyDescription"
      :image-size="48"
    >
      <slot name="empty-action" />
    </el-empty>
  </el-card>
</template>

<style scoped>
.section-card {
  border-radius: var(--radius-lg);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
}
.title-text {
  font-size: var(--text-lg);
}
.section-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.open-full-link {
  font-size: var(--text-xl);
  color: var(--text-secondary);
  text-decoration: none;
  padding: 0 6px;
}
.open-full-link:hover {
  color: var(--color-info-darker);
}
.section-alert {
  margin-top: var(--space-2);
}
.section-skeleton {
  padding: var(--space-2) var(--space-1);
}
</style>
