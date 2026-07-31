<script setup lang="ts">
// 權限編輯器（manifest 化改造，2026-07-31）：改渲染 derivePickerTree(NAVIGATION_MANIFEST,
// definition) 的「群組 → 頁面 → 檢視/操作」三層樹；勾選狀態運算抽至
// usePermissionSelection。props / emit 契約不變（modelValue 進出仍是扁平 string[]，
// 含 'CODE:own_class' 與 '*'）。definition.groups / split_permissions 不再被使用
//（後端 API 不用改，欄位變 dead payload，日後可清）。
//
// 折疊與搜尋（同日追加）純屬顯示層：只決定「哪些節點被渲染」，不碰 modelValue、不進
// usePermissionSelection——折疊/過濾中的群組與頁面，checkbox 的 checked / indeterminate
// 一律以完整樹的碼集合運算（groupState 拿的是原始 group、togglePageView 拿的是原始
// page），避免「看不到的碼被靜默漏掉」。折疊狀態不持久化。
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { NAVIGATION_MANIFEST, derivePickerTree } from '@/constants/navigation'
import type { PickerGroup, PickerNode, PickerPage } from '@/constants/navigation'
import { SCOPE_AWARE_CODES } from '@/utils/auth'
import { usePermissionSelection } from '@/composables/usePermissionSelection'

export interface PermissionPickerDefinition {
  permissions: Record<string, { value: string; label: string; scope_options?: string[] | null }>
  groups: { name: string; permissions?: string[]; split_permissions?: { module: string; read: string; write: string }[] }[]
}

const props = defineProps<{
  modelValue: string[]
  definition: PermissionPickerDefinition
}>()
const emit = defineEmits<{ 'update:modelValue': [next: string[]] }>()

const SCOPE_LABELS: Record<string, string> = { own_class: '僅自班', all: '全園' }

// definition 為非同步 prop（後端 GET /auth/permissions），故走 computed；
// manifest 本身靜態。孤兒碼（後端有、manifest 沒有）由 derivePickerTree 自動
// 歸入尾端「其他權限（未分類）」群組，不得靜默消失。
const tree = computed<PickerGroup[]>(() => derivePickerTree(NAVIGATION_MANIFEST, props.definition))

// scope radio 渲染與 toggle 預設 scope：後端 definition.scope_options 優先，
// SCOPE_AWARE_CODES fallback（definition 落後時 scope-aware 碼仍 fail-safe 預設 own_class）。
function scopeOptionsFor(code: string): string[] {
  const opts = props.definition.permissions[code]?.scope_options ?? []
  if (opts.length > 0) return opts
  return SCOPE_AWARE_CODES.has(code) ? ['own_class', 'all'] : []
}

const {
  isChecked,
  currentScope,
  toggle,
  setScope,
  groupState,
  toggleGroup,
  togglePageView,
  actionsDisabled,
  selectAll,
  clearAll,
} = usePermissionSelection(
  computed(() => props.modelValue),
  (next) => emit('update:modelValue', next),
  scopeOptionsFor,
  () => Object.keys(props.definition.permissions),
)

// ── 折疊（預設全展開，故記「已收合」的 key）──
const collapsedGroups = ref<Set<string>>(new Set())
const collapsedPages = ref<Set<string>>(new Set())

function toggleCollapse(collapsed: Set<string>, key: string) {
  if (collapsed.has(key)) collapsed.delete(key)
  else collapsed.add(key)
}

// ── 搜尋 ──
const keyword = ref('')
const searching = computed(() => keyword.value.trim().length > 0)

// 搜尋中一律強制展開（手動折疊狀態原封不動保留，清空搜尋即恢復）。
const groupExpanded = (key: string): boolean => searching.value || !collapsedGroups.value.has(key)
const pageExpanded = (key: string): boolean => searching.value || !collapsedPages.value.has(key)

/**
 * 過濾後的渲染樹：命中節點連同祖先保留；**祖先命中則整棵子樹保留**（搜尋群組名或頁名
 * 時看到空殼群組沒有意義）。回傳的 group / page 都是原始物件參照，勾選運算照常吃完整
 * 碼集合；views / actions 才是過濾後的渲染清單。
 */
const visibleTree = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const hit = (text: string): boolean => text.toLowerCase().includes(kw)
  const nodeHit = (n: PickerNode): boolean => hit(n.label) || hit(n.code)
  return tree.value
    .map((group) => {
      const groupHit = kw === '' || hit(group.title)
      const pages = group.pages
        .map((page) => {
          const pageHit = groupHit || hit(page.title)
          return {
            page,
            views: pageHit ? page.views : page.views.filter(nodeHit),
            actions: pageHit ? page.actions : page.actions.filter(nodeHit),
          }
        })
        .filter((p) => p.views.length > 0 || p.actions.length > 0)
      return { group, pages }
    })
    .filter((g) => g.pages.length > 0)
})

// 單檢視頁顯示「檢視」（頁名已載語意）；多檢視頁與未分類群組顯示各碼 label。
function viewLabel(page: PickerPage, view: PickerNode): string {
  if (page.key === 'uncategorized') return view.label
  return page.views.length > 1 ? view.label : '檢視'
}

function sharedHintViews(views: PickerNode[]): PickerNode[] {
  return views.filter((v) => v.sharedPageTitles.length > 0)
}

defineExpose({
  toggle,
  setScope,
  isChecked,
  currentScope,
  selectAll,
  clearAll,
  groupState,
  toggleGroup,
  togglePageView,
})
</script>

<template>
  <div class="permission-picker">
    <div class="picker-toolbar">
      <el-input
        v-model="keyword"
        class="picker-search"
        data-perm-search
        placeholder="搜尋權限名稱或代碼"
        clearable
        size="small"
        :prefix-icon="Search"
      />
      <div class="picker-actions">
        <el-button size="small" @click="selectAll">全選</el-button>
        <el-button size="small" @click="clearAll">清除</el-button>
      </div>
    </div>

    <el-empty
      v-if="searching && visibleTree.length === 0"
      data-perm-empty
      :image-size="60"
      description="找不到符合的權限"
    />

    <div
      v-for="{ group, pages } in visibleTree"
      :key="group.key"
      class="perm-group"
      :data-perm-group="group.key"
    >
      <div class="perm-group-header">
        <button
          v-if="pages.length > 0"
          type="button"
          class="perm-toggle"
          :data-perm-toggle="group.key"
          :aria-expanded="groupExpanded(group.key)"
          :aria-label="`展開或收合 ${group.title}`"
          @click="toggleCollapse(collapsedGroups, group.key)"
        >
          {{ groupExpanded(group.key) ? '▼' : '▶' }}
        </button>
        <el-checkbox
          class="perm-group-name"
          :model-value="groupState(group).checked"
          :indeterminate="groupState(group).indeterminate"
          @change="(v) => toggleGroup(group, !!v)"
        >
          {{ group.title }}
        </el-checkbox>
      </div>

      <template v-if="groupExpanded(group.key)">
        <div
          v-for="{ page, views, actions } in pages"
          :key="page.key"
          class="perm-page"
          :data-perm-page="page.key"
        >
          <div class="perm-page-header">
            <button
              v-if="actions.length > 0"
              type="button"
              class="perm-toggle"
              :data-perm-toggle="page.key"
              :aria-expanded="pageExpanded(page.key)"
              :aria-label="`展開或收合 ${page.title} 的操作`"
              @click="toggleCollapse(collapsedPages, page.key)"
            >
              {{ pageExpanded(page.key) ? '▼' : '▶' }}
            </button>
            <span v-else class="perm-toggle-placeholder" />
            <span class="perm-page-title">{{ page.title }}</span>
            <template v-for="view in views" :key="view.code">
              <el-checkbox
                :model-value="isChecked(view.code)"
                :data-perm-view="view.code"
                @change="(v) => togglePageView(page, view.code, !!v)"
              >
                {{ viewLabel(page, view) }}
              </el-checkbox>
              <div
                v-if="isChecked(view.code) && scopeOptionsFor(view.code).length > 0"
                :data-perm-scope="view.code"
                class="perm-scope-row"
              >
                <el-radio-group
                  :model-value="currentScope(view.code) ?? undefined"
                  size="small"
                  @update:model-value="(v) => setScope(view.code, String(v))"
                >
                  <el-radio v-for="opt in scopeOptionsFor(view.code)" :key="opt" :value="opt">
                    {{ SCOPE_LABELS[opt] || opt }}
                  </el-radio>
                </el-radio-group>
              </div>
            </template>
          </div>
          <div
            v-for="view in sharedHintViews(views)"
            :key="`shared-${view.code}`"
            class="perm-shared-hint"
          >
            同時開通：{{ view.sharedPageTitles.join('、') }}
          </div>
          <div
            v-if="actions.length > 0 && pageExpanded(page.key)"
            class="perm-actions"
            :class="{ 'is-disabled': actionsDisabled(page) }"
          >
            <template v-for="action in actions" :key="action.code">
              <el-checkbox
                :model-value="isChecked(action.code)"
                :disabled="actionsDisabled(page, action)"
                :data-perm-action="action.code"
                @change="(v) => toggle(action.code, !!v)"
              >
                {{ action.label }}
              </el-checkbox>
              <div
                v-if="isChecked(action.code) && scopeOptionsFor(action.code).length > 0"
                :data-perm-scope="action.code"
                class="perm-scope-row"
              >
                <el-radio-group
                  :model-value="currentScope(action.code) ?? undefined"
                  size="small"
                  @update:model-value="(v) => setScope(action.code, String(v))"
                >
                  <el-radio v-for="opt in scopeOptionsFor(action.code)" :key="opt" :value="opt">
                    {{ SCOPE_LABELS[opt] || opt }}
                  </el-radio>
                </el-radio-group>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.picker-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.picker-search {
  max-width: 280px;
}
.picker-actions {
  display: flex;
  gap: 8px;
}
.perm-group {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.perm-group-header {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-bottom: 6px;
}
.perm-group-name :deep(.el-checkbox__label) {
  font-weight: 600;
  color: var(--text-primary);
}
.perm-toggle {
  padding: 0;
  width: 16px;
  border: none;
  background: none;
  font-size: 10px;
  line-height: 1;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.perm-toggle:hover {
  color: var(--el-color-primary);
}
.perm-toggle-placeholder {
  display: inline-block;
  width: 16px;
}
.perm-page {
  margin-bottom: 8px;
  padding: 4px 0 4px 8px;
  border-left: 2px solid var(--el-border-color-lighter);
}
.perm-page-header {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.perm-page-header .perm-toggle,
.perm-page-header .perm-toggle-placeholder {
  margin-right: -8px;
}
.perm-page-title {
  min-width: 96px;
  font-size: 14px;
  color: var(--text-secondary);
}
.perm-scope-row {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
}
.perm-shared-hint {
  margin-left: 124px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.perm-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-left: 124px;
  padding: 2px 0;
}
.perm-actions.is-disabled :deep(.el-checkbox__label) {
  color: var(--el-text-color-disabled);
}
</style>
