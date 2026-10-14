/**
 * 家長端長表單的「離開前確認」。
 *
 * 家長常在通勤或接送時單手操作，誤觸返回鍵／LINE 返回、點到背景就會把填到一半的
 * 用藥單、接送授權、手寫簽名整份丟掉。兩種情境：
 *
 * - 全頁表單（/medications/new、/pickup/new、/events/:id/ack）：`useLeaveConfirm`
 *   掛 onBeforeRouteLeave，有修改時暫停導覽、開 ConfirmDialog，家長選「離開」才放行。
 * - BottomSheet 內的表單（請假、常用接送人）：`useSheetCloseGuard` 提供
 *   ParentBottomSheet 的 `before-close`，點背景／ESC／下拉關閉時改在 sheet 內顯示
 *   放棄確認（不再疊一層 AppModal：AppModal 的 body lock 不計數，關掉時會把 sheet
 *   底下的頁面一起解鎖）。
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useLeaveConfirm(isDirty: () => boolean) {
  const open = ref(false)
  let resolver: ((leave: boolean) => void) | null = null
  // 送出成功後程式自己導頁時跳過確認
  let bypass = false

  function settle(leave: boolean): void {
    const resolve = resolver
    resolver = null
    open.value = false
    resolve?.(leave)
  }

  onBeforeRouteLeave(() => {
    if (bypass || !isDirty()) return true
    // 連按兩次返回：前一個還在等的確認視為「留下」
    if (resolver) settle(false)
    open.value = true
    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  })

  onBeforeUnmount(() => {
    if (resolver) settle(false)
  })

  /**
   * 給 ConfirmDialog 的 v-model:open。ConfirmDialog 先 emit confirm 再 emit
   * update:open(false)，所以 confirm 先把 resolver 用掉，這裡的 settle(false) 會是 no-op；
   * 點背景／ESC／「繼續填寫」則只會走到這裡＝留在原頁。
   */
  const dialogOpen = computed({
    get: () => open.value,
    set: (v: boolean) => {
      if (!v) settle(false)
    },
  })

  return {
    dialogOpen,
    confirmLeave: () => settle(true),
    allowLeave: () => {
      bypass = true
    },
  }
}

export function useSheetCloseGuard(sheetOpen: Ref<boolean>, isDirty: () => boolean) {
  const promptVisible = ref(false)

  /** ParentBottomSheet 的 before-close：回傳 false 時 sheet 不關，改顯示放棄確認。 */
  function beforeClose(): boolean {
    if (!isDirty()) return true
    promptVisible.value = true
    return false
  }

  /** 表單自己的「取消」鈕也走同一套。 */
  function requestClose(): void {
    if (beforeClose()) sheetOpen.value = false
  }

  function keepEditing(): void {
    promptVisible.value = false
  }

  function discard(): void {
    promptVisible.value = false
    sheetOpen.value = false
  }

  watch(sheetOpen, (v) => {
    if (!v) promptVisible.value = false
  })

  return { promptVisible, beforeClose, requestClose, keepEditing, discard }
}
