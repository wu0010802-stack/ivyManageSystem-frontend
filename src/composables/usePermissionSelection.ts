// 權限勾選狀態模型：自 PermissionPicker.vue 抽出的純狀態運算（勾選邏輯與渲染分離好測）。
// modelValue 契約零改動：進出都是扁平 string[]（含 'CODE:own_class' scope 後綴與 '*' wildcard）。
//
// 級聯規則（前端架構詳設 §4.2 行為決策）：
// 1. 勾群組只級聯「檢視」碼（scope-aware 預設落 :own_class 最小授權，全園須經 scope radio
//    顯式選取），不連動 actions——操作碼含 APPRAISAL_FINALIZE / ACTIVITY_PAYMENT_APPROVE
//    等高風險簽核碼，一鍵群組全給違反最小授權。已勾碼（含已選 scope）保持原樣不重設。
// 2. 取消群組 = 清掉群組全部 owned 碼（views + actions、bare 與 scoped 形態一併過濾），
//    撤權要撤乾淨。
// 3. 取消頁面檢視：帶 requiresView 的 action 跟隨指定 view 一併移除；未帶者於「頁面全部
//    views 皆未勾」時移除（只持 WRITE 不持 READ 是「能寫不能看」殘缺狀態，留著誤導稽核）。
//    views 為空的 actions-only 節點（教師端預覽、家園溝通等）永不 disable。
// 4. wildcard ['*'] 行為原樣：整棵樹顯示全勾 + scope 顯示「全園」；任何一次修改先
//    expandWildcard()（bare = 全園，對齊後端 resolve_grant）再操作＝by-design 去升權。
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { permissionsCombine } from '@/utils/auth'

/** 群組節點最小結構（結構相容 @/constants/navigation 的 PickerGroup）。 */
export interface SelectionGroup {
  /** 群組級聯勾選對象：全部頁面 views 碼（不含 actions）。 */
  viewCodes: readonly string[]
  /** 群組取消時要清掉的全部 owned 碼（views + actions）。 */
  ownedCodes: readonly string[]
}

export interface SelectionAction {
  code: string
  /** 此操作依附的檢視碼；省略 = 依附「頁面全部 views」。 */
  requiresView?: string
}

/** 頁面節點最小結構（結構相容 @/constants/navigation 的 PickerPage）。 */
export interface SelectionPage {
  views: readonly { code: string }[]
  actions: readonly SelectionAction[]
}

export function usePermissionSelection(
  modelValue: Ref<string[]> | ComputedRef<string[]>,
  emitUpdate: (next: string[]) => void,
  /** 碼的 scope 選項（勾選預設 own_class 用）；非 scope-aware 碼回空陣列。 */
  scopeOptionsFor: (code: string) => string[],
  /** wildcard 展開的碼全集（現行 = definition.permissions keys，對齊後端可授權集合）。 */
  allCodes: () => string[],
) {
  const isWildcard = computed(() => modelValue.value.includes('*'))

  function splitPermKey(key: string): { code: string; scope: string | null } {
    const idx = key.indexOf(':')
    if (idx === -1) return { code: key, scope: null }
    return { code: key.slice(0, idx), scope: key.slice(idx + 1) }
  }

  /** wildcard 展開成所有 bare code（bare = 全園，對齊後端 resolve_grant）。 */
  function expandWildcard(): string[] {
    return permissionsCombine([allCodes()])
  }

  function isChecked(code: string): boolean {
    if (isWildcard.value) return true
    return modelValue.value.some((k) => splitPermKey(k).code === code)
  }

  /** bare scope-aware code → 顯示 'all'；scoped → 該 scope；wildcard → 'all'。 */
  function currentScope(code: string): string | null {
    if (isWildcard.value) return 'all'
    const found = modelValue.value.find((k) => splitPermKey(k).code === code)
    if (!found) return null
    return splitPermKey(found).scope ?? 'all'
  }

  function baseList(): string[] {
    return isWildcard.value ? expandWildcard() : [...modelValue.value]
  }

  function withoutCode(list: string[], code: string): string[] {
    return list.filter((k) => splitPermKey(k).code !== code)
  }

  /** 加入碼的預設形態：scope-aware 預設 own_class（最小授權），否則 bare。 */
  function withDefault(list: string[], code: string): string[] {
    const opts = scopeOptionsFor(code)
    if (opts.length > 0) {
      return [...list, `${code}:${opts.includes('own_class') ? 'own_class' : opts[0]}`]
    }
    return [...list, code]
  }

  // 勾選時 scope-aware 碼預設 own_class、取消時清掉該 code 的所有形態（bare 與 scoped）。
  function toggle(code: string, checked: boolean) {
    let base = withoutCode(baseList(), code)
    if (checked) base = withDefault(base, code)
    emitUpdate(base)
  }

  function setScope(code: string, scope: string) {
    const base = baseList()
    emitUpdate(base.map((k) => (splitPermKey(k).code === code ? `${code}:${scope}` : k)))
  }

  /** checked = 全部 view 碼已勾；indeterminate = 任一 owned 碼已勾但未達全 view。 */
  function groupState(g: SelectionGroup): { checked: boolean; indeterminate: boolean } {
    const allViews = g.viewCodes.length > 0 && g.viewCodes.every((c) => isChecked(c))
    const any = g.ownedCodes.some((c) => isChecked(c))
    return { checked: allViews, indeterminate: any && !allViews }
  }

  function toggleGroup(g: SelectionGroup, checked: boolean) {
    let list = baseList()
    if (checked) {
      // 只級聯 views；已勾碼（含使用者已選的 scope）保持原樣，不降不升。
      for (const code of g.viewCodes) {
        if (!list.some((k) => splitPermKey(k).code === code)) list = withDefault(list, code)
      }
    } else {
      for (const code of g.ownedCodes) list = withoutCode(list, code)
    }
    emitUpdate(list)
  }

  function togglePageView(page: SelectionPage, code: string, checked: boolean) {
    if (checked) {
      toggle(code, true)
      return
    }
    let list = withoutCode(baseList(), code)
    // 帶 requiresView 且依附此 view 的 action 一併移除。
    for (const a of page.actions) {
      if (a.requiresView === code) list = withoutCode(list, a.code)
    }
    // 頁面所有 views 皆未勾時，未帶 requiresView 的 action 也移除。
    const anyViewLeft = page.views.some((v) => list.some((k) => splitPermKey(k).code === v.code))
    if (!anyViewLeft) {
      for (const a of page.actions) {
        if (!a.requiresView) list = withoutCode(list, a.code)
      }
    }
    emitUpdate(list)
  }

  /**
   * 操作區/單一操作是否 disable：
   * - views 為空的 actions-only 節點永不 disable；
   * - 帶 requiresView 的 action 跟隨指定 view；
   * - 未帶 action（或整區判斷，不傳 action）= 頁面全部 views 皆未勾才 disable。
   */
  function actionsDisabled(page: SelectionPage, action?: SelectionAction): boolean {
    if (page.views.length === 0) return false
    if (action?.requiresView) return !isChecked(action.requiresView)
    return !page.views.some((v) => isChecked(v.code))
  }

  function selectAll() {
    emitUpdate(['*'])
  }

  function clearAll() {
    emitUpdate([])
  }

  return {
    isWildcard,
    expandWildcard,
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
  }
}
