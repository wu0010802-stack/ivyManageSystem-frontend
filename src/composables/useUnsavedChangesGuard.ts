// src/composables/useUnsavedChangesGuard.ts
import { onMounted, onScopeDispose } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'

/**
 * dirty 時攔截離開（路由 + 關閉分頁）。
 * 注意：與 useFormDraft 不同——後者是草稿持久化，本 composable 只負責警告/攔截。
 */
/**
 * 詢問是否捨棄未儲存變更；回傳 true 代表可以繼續（使用者選擇捨棄）。
 *
 * 獨立於 composable 匯出，供「元件內部切換分頁／切換選取項」這類不經路由的離開點共用，
 * 免得各處自己刻一套文案不一致的對話框。
 */
export async function confirmDiscardChanges(): Promise<boolean> {
  try {
    // 「捨棄變更」是破壞性動作（改動無法復原），故標成 danger 而非預設 primary——
    // 原本它以主色出現在視覺主位，等於把不可逆的那一邊做成建議選項。
    await ElMessageBox.confirm('尚有未儲存的變更，確定離開並捨棄？', '未儲存變更', {
      type: 'warning',
      confirmButtonText: '捨棄變更',
      confirmButtonClass: 'el-button--danger',
      cancelButtonText: '留在此頁',
    })
    return true
  } catch {
    return false
  }
}

export function useUnsavedChangesGuard(isDirty: () => boolean): {
  confirmDiscard: () => Promise<boolean>
} {
  async function confirmDiscard(): Promise<boolean> {
    if (!isDirty()) return true
    return confirmDiscardChanges()
  }

  onBeforeRouteLeave(async () => confirmDiscard())

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (isDirty()) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))

  return { confirmDiscard }
}
