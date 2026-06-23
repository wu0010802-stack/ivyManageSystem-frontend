// src/composables/useUnsavedChangesGuard.ts
import { onMounted, onScopeDispose } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'

/**
 * dirty 時攔截離開（路由 + 關閉分頁）。
 * 注意：與 useFormDraft 不同——後者是草稿持久化，本 composable 只負責警告/攔截。
 */
export function useUnsavedChangesGuard(isDirty: () => boolean): {
  confirmDiscard: () => Promise<boolean>
} {
  async function confirmDiscard(): Promise<boolean> {
    if (!isDirty()) return true
    try {
      await ElMessageBox.confirm('尚有未儲存的變更，確定離開並捨棄？', '未儲存變更', {
        type: 'warning',
        confirmButtonText: '捨棄變更',
        cancelButtonText: '留在此頁',
      })
      return true
    } catch {
      return false
    }
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
