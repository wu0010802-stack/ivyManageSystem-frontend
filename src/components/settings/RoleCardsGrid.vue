<script setup lang="ts">
import { computed } from 'vue'
import { isSuperAdmin } from '@/utils/auth'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, type RolesDefinition } from './roles/types'

// 核心角色排序沿舊 UI；自訂角色 code 字母序附後（角色卡不放 icon——業主 2026-07-13 裁定移除）
const CORE_ORDER = ['admin', 'principal', 'supervisor', 'hr', 'accountant', 'teacher']

const props = defineProps<{
  modelValue: string
  definition: RolesDefinition
}>()
const emit = defineEmits<{ 'update:modelValue': [role: string] }>()

const roleOptions = computed(() => {
  const order = (code: string) => {
    const i = CORE_ORDER.indexOf(code)
    return i === -1 ? CORE_ORDER.length : i
  }
  return Object.entries(props.definition.roles)
    // 家長角色不可指派給員工帳號（spec §5.1；後端 assert_role_assignable 兜底)
    .filter(([, r]) => !(r.flags ?? []).includes(FLAG_PARENT))
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([code, r]) => ({
      code,
      label: r.label || code,
      description: r.description || '',
      permCount: r.permissions.includes('*') ? '全部' : `${r.permissions.length} 條`,
      // super_admin flag 角色：非超級管理員不可指派（後端 _assert_can_manage_user 兜底）
      locked: (r.flags ?? []).includes(FLAG_SUPER_ADMIN) && !isSuperAdmin(),
      isAdminLike: (r.flags ?? []).includes(FLAG_SUPER_ADMIN),
    }))
})

const select = (code: string, locked: boolean) => {
  if (locked) return
  emit('update:modelValue', code)
}

const onKeydown = (e: KeyboardEvent, code: string, locked: boolean) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(code, locked)
  }
}
</script>

<template>
  <div class="role-cards-grid">
    <div
      v-for="opt in roleOptions"
      :key="opt.code"
      class="role-card"
      role="button"
      :tabindex="0"
      :data-role="opt.code"
      :class="{ 'role-card--active': modelValue === opt.code, 'is-disabled': opt.locked }"
      :aria-pressed="modelValue === opt.code ? 'true' : 'false'"
      :aria-disabled="opt.locked ? 'true' : undefined"
      :title="opt.locked ? '僅超級管理員可指派此角色' : ''"
      @click="select(opt.code, opt.locked)"
      @keydown="onKeydown($event, opt.code, opt.locked)"
    >
      <div class="role-card__label">{{ opt.label }}</div>
      <div class="role-card__desc">{{ opt.description }}</div>
      <div class="role-card__count">
        <el-tag size="small" :type="opt.isAdminLike ? 'danger' : 'info'">{{ opt.permCount }}</el-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 樣式自 SettingsAccountsTab 搬入（該檔同步移除） */
.role-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  width: 100%;
}

@media (max-width: 720px) {
  .role-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.role-card {
  padding: 12px;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  background: var(--el-bg-color);
  text-align: center;
}

.role-card:hover:not(.is-disabled) {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.role-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.role-card--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

/* dark mode：html.ivy-admin（main.css）把 --el-color-primary-light-9 釘死成 light hex
   （#e6f3f9），不隨 html.dark 翻轉，導致選中卡片背景幾乎融入白底、卡片內文字對比不足。
   窄覆寫成 dark 下已翻好的 brand primary alpha tint（--brand-primary-soft，見
   a11y.css 的 html.dark），與 MonthlyPnLPanel.vue 同一 pattern。 */
html.dark .role-card--active {
  background: var(--brand-primary-soft);
}

.role-card.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.role-card__label {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.role-card__desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 6px 0 8px;
  min-height: 28px;
  line-height: 1.3;
}

.role-card__count {
  display: flex;
  justify-content: center;
}
</style>
