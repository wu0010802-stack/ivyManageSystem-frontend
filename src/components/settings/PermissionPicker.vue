<script setup lang="ts">
import { computed } from 'vue'
import { permissionsAdd, permissionsRemove, permissionsCombine } from '@/utils/auth'

export interface PermissionPickerDefinition {
  permissions: Record<string, { value: string; label: string; is_core?: boolean; scope_options?: string[] | null }>
  groups: { name: string; permissions?: string[]; split_permissions?: { module: string; read: string; write: string }[] }[]
}

const props = defineProps<{
  modelValue: string[]
  definition: PermissionPickerDefinition
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [next: string[]] }>()

const SCOPE_LABELS: Record<string, string> = { own_class: '僅自班', all: '全園' }

const isWildcard = computed(() => props.modelValue.includes('*'))

function splitPermKey(key: string): { code: string; scope: string | null } {
  const idx = key.indexOf(':')
  if (idx === -1) return { code: key, scope: null }
  return { code: key.slice(0, idx), scope: key.slice(idx + 1) }
}

function scopeOptionsFor(code: string): string[] {
  return props.definition.permissions[code]?.scope_options ?? []
}

/** wildcard 展開成所有 bare code（bare = 全園，對齊後端 resolve_grant）。 */
function expandWildcard(): string[] {
  return permissionsCombine([Object.keys(props.definition.permissions)])
}

function isChecked(code: string): boolean {
  if (isWildcard.value) return true
  return props.modelValue.some((k) => splitPermKey(k).code === code)
}

/** bare scope-aware code → 顯示 'all'；scoped → 該 scope；wildcard → 'all'。 */
function currentScope(code: string): string | null {
  if (isWildcard.value) return 'all'
  const found = props.modelValue.find((k) => splitPermKey(k).code === code)
  if (!found) return null
  return splitPermKey(found).scope ?? 'all'
}

function isSplitChecked(perm: string): boolean {
  if (isWildcard.value) return true
  return props.modelValue.includes(perm)
}

function toggle(code: string, checked: boolean) {
  let base = isWildcard.value ? expandWildcard() : [...props.modelValue]
  base = base.filter((k) => splitPermKey(k).code !== code)
  if (checked) {
    const opts = scopeOptionsFor(code)
    if (opts.length > 0) {
      base.push(`${code}:${opts.includes('own_class') ? 'own_class' : opts[0]}`)
    } else {
      base.push(code)
    }
  }
  emit('update:modelValue', base)
}

function setScope(code: string, scope: string) {
  const base = isWildcard.value ? expandWildcard() : [...props.modelValue]
  emit('update:modelValue', base.map((k) => (splitPermKey(k).code === code ? `${code}:${scope}` : k)))
}

function toggleSplit(perm: string, checked: boolean) {
  const base = isWildcard.value ? expandWildcard() : [...props.modelValue]
  emit('update:modelValue', checked ? permissionsAdd(base, perm) : permissionsRemove(base, perm))
}

function selectAll() {
  emit('update:modelValue', ['*'])
}
function clearAll() {
  emit('update:modelValue', [])
}

function labelFor(code: string): string {
  return props.definition.permissions[code]?.label || code
}

defineExpose({ toggle, setScope, toggleSplit, isChecked, currentScope, isSplitChecked, selectAll, clearAll })
</script>

<template>
  <div class="permission-picker">
    <div v-if="disabled" class="readonly-hint">核心角色的權限不可修改</div>
    <template v-else>
      <div class="picker-actions">
        <el-button size="small" @click="selectAll">全選</el-button>
        <el-button size="small" @click="clearAll">清除</el-button>
      </div>
      <div v-for="group in definition.groups" :key="group.name" class="perm-group">
        <div class="perm-group-name">{{ group.name }}</div>
        <div v-for="code in (group.permissions || [])" :key="code" class="perm-row">
          <el-checkbox :model-value="isChecked(code)" @change="(v) => toggle(code, !!v)">
            {{ labelFor(code) }}
          </el-checkbox>
          <div
            v-if="isChecked(code) && scopeOptionsFor(code).length > 0"
            :data-perm-scope="code"
            class="perm-scope-row"
          >
            <el-radio-group
              :model-value="currentScope(code) ?? undefined"
              size="small"
              @update:model-value="(v) => setScope(code, String(v))"
            >
              <el-radio v-for="opt in scopeOptionsFor(code)" :key="opt" :value="opt">
                {{ SCOPE_LABELS[opt] || opt }}
              </el-radio>
            </el-radio-group>
          </div>
        </div>
        <div v-for="sp in (group.split_permissions || [])" :key="sp.read" class="split-row">
          <span class="split-label">{{ sp.module }}</span>
          <el-checkbox :model-value="isSplitChecked(sp.read)" @change="(v) => toggleSplit(sp.read, !!v)">檢視</el-checkbox>
          <el-checkbox :model-value="isSplitChecked(sp.write)" @change="(v) => toggleSplit(sp.write, !!v)">編輯</el-checkbox>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.picker-actions {
  margin-bottom: 12px;
}
.perm-group {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 6px;
}
.perm-group-name {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}
.perm-row {
  margin-bottom: 4px;
}
.perm-scope-row {
  margin-left: 24px;
  margin-top: 2px;
  margin-bottom: 6px;
}
.split-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 0;
}
.split-label {
  min-width: 80px;
  font-size: 14px;
  color: var(--text-secondary);
}
.readonly-hint {
  color: var(--text-tertiary);
  padding: 6px 0;
}
</style>
