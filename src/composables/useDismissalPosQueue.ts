/**
 * 接送管理 POS 佈局：右側佇列合併與 5 秒倒數邏輯（T-003）。
 *
 * 管理本地 staging（倒數中、尚未送出後端的項目）＋接收外部傳入的後端 active
 * calls，合併排序成單一 PosQueueItem[] 供右欄渲染。0 秒到時才呼叫既有
 * createDismissalCall（D1：倒數期間不打 API），API 呼叫結束後（無論成功/失敗）
 * 才把該項目從 staging 移除——成功則等呼叫端既有 fetch/WS 補入 active 清單；
 * 失敗則以 ElMessage 呈現錯誤（比照既有 handleQuickCreate/submitCreate 慣例），
 * 學生卡片回到可再次點擊發起的狀態，不會靜默消失卻沒真的建立通知。
 * addToQueue 同時防呆：該生已在 staging 倒數中，或已有後端 active（pending/
 * acknowledged）通知（重用 useDismissalRoster.ts 的 activeCallStudentIds）皆會
 * 被忽略，避免重複發起。active 清單排序為 POS 專屬的「接送時間先後」單一排序
 * （見 pickupTimeMs）——已抵達與家長預約未抵達合併比時間，刻意不同於教師端
 * sortActiveQueue 的「已抵達一律優先」兩段式語意，該共用函式維持原樣不動。
 * 傳入的 activeCalls 不保證只含 pending/acknowledged（呼叫端可能為了 D5 的
 * guardian_picked 徽章連 completed 記錄都一起傳進來），本檔依
 * useDismissalRoster.ACTIVE_STATUSES 過濾出進行中項目；今日 completed 記錄
 * 不丟棄，改以 phase='done' 保留在佇列尾端供回顧（cancelled 仍然不顯示）。
 *
 * 送出後的持續顯示：submit() 成功後不能只等呼叫端的 activeCalls（WS 廣播／
 * fallback 輪詢）補上這筆——WS 延遲或斷線期間會讓卡片在 staging 移除後短暫
 * （最長到下次輪詢）從右欄整個消失，使用者會誤以為通知遺失。改用既有
 * createDismissalCall 的 response（後端已回傳建立好的紀錄，見
 * api/dismissal_calls.py::create_dismissal_call）直接建立一筆本地 active
 * 項目、立即持續顯示；一旦 activeCalls 真的追上（該 id 出現，不論任何狀態）
 * 就視為外部單一事實來源已接手，移除本地暫存版本，避免兩邊資料漂移。
 */

import { reactive, computed, watch, onScopeDispose, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createDismissalCall, cancelDismissalCall } from '@/api/dismissalCalls'
import type { Schema } from '@/api/_generated/typed'
import { parseTaipeiDate, type DismissalCallView } from '@/composables/useDismissalUrgency'
import { activeCallStudentIds, ACTIVE_STATUSES } from '@/composables/useDismissalRoster'
import type { PosQueueItem, PosQueueSource } from '@/types/dismissalPos'

/** 倒數總長度（毫秒）。 */
export const STAGING_DURATION_MS = 5000

const STAGING_ID_PREFIX = 'staging:'

/** 中欄卡片發起 quick-dispatch 時需要的最小學生形狀。 */
export interface PosDispatchStudent {
  id: number
  name: string
  classroomId: number
  classroomName: string
  /** 預設 'onsite'（現場發起）；家長預約項目不會經由這個入口加入。 */
  source?: PosQueueSource
}

interface StagingEntry {
  student: PosDispatchStudent
  startedAt: number
  timer: ReturnType<typeof setTimeout>
}

function stagingItemId(studentId: number): string {
  return `${STAGING_ID_PREFIX}${studentId}`
}

/** 後端 active call → PosQueueItem（phase='active'）。request_source 對齊 D2：staff=現場／parent=預約。 */
function toActiveItem(call: DismissalCallView): PosQueueItem {
  const source: PosQueueSource = call.request_source === 'parent' ? 'reservation' : 'onsite'
  return {
    id: call.id,
    phase: 'active',
    studentId: Number(call.student_id ?? 0),
    studentName: call.student_name ?? '',
    classroomName: call.classroom_name ?? '',
    source,
    countdown: null,
    call,
  }
}

/**
 * 接送時間排序鍵（毫秒）：已抵達（含 staff 現場，migration 已回填 arrived_at=
 * requested_at）用實際到門口時間 arrived_at；家長預約未抵達用預計抵達時間
 * expected_arrival_at；都缺時 fallback requested_at。無法解析排最後。
 */
function pickupTimeMs(call: DismissalCallView): number {
  const iso = call.arrived_at || call.expected_arrival_at || call.requested_at
  return parseTaipeiDate(iso)?.getTime() ?? Number.MAX_SAFE_INTEGER
}

/** 今日 completed call → PosQueueItem（phase='done'）：保留在佇列尾端供回顧，不可取消。 */
function toDoneItem(call: DismissalCallView): PosQueueItem {
  return { ...toActiveItem(call), phase: 'done' }
}

/** staging entry → PosQueueItem（phase='staging'）。 */
function toStagingItem(studentId: number, entry: StagingEntry): PosQueueItem {
  return {
    id: stagingItemId(studentId),
    phase: 'staging',
    studentId,
    studentName: entry.student.name,
    classroomName: entry.student.classroomName,
    source: entry.student.source ?? 'onsite',
    countdown: { startedAt: entry.startedAt, durationMs: STAGING_DURATION_MS },
    call: null,
  }
}

/**
 * @param activeCalls 呼叫端既有的今日 active calls（沿用既有 fetch/WS 更新結果，本 composable 不重造）。
 */
export function useDismissalPosQueue(activeCalls: Ref<DismissalCallView[]>) {
  const staging = reactive(new Map<number, StagingEntry>())
  // submit() 成功後的本地樂觀 active 項目（key＝call id），在呼叫端的 activeCalls
  // 真正追上（該 id 出現，不論任何狀態）前頂替它持續顯示於右欄，見檔頭註解。
  const localActiveCalls = reactive(new Map<number, DismissalCallView>())

  // 外部 activeCalls 一旦包含某個 id（不論狀態），代表 WS/輪詢已經追上該筆紀錄的
  // 最新狀態，本地樂觀版本已無存在必要（不清掉的話兩邊資料會漂移，例如後續
  // acknowledged/completed 都不會反映到這裡）。
  watch(
    activeCalls,
    (calls) => {
      if (localActiveCalls.size === 0) return
      for (const call of calls) {
        if (localActiveCalls.has(call.id)) localActiveCalls.delete(call.id)
      }
    },
    { deep: true },
  )

  const queue = computed<PosQueueItem[]>(() => {
    // 呼叫端傳入的 activeCalls 不保證只含 pending/acknowledged——D5 要求中欄
    // 「家長已接送」徽章要吃得到今日 completed 記錄，呼叫端因此可能把完整的
    // 今日 calls（含 completed/cancelled）一起傳進來。這裡用全 repo 單一事實
    // 來源 ACTIVE_STATUSES 過濾出「還在流程中」的通知（completed 另走下方
    // done 分支保留顯示、cancelled 不顯示），不然 completed/cancelled 的舊紀錄
    // 會被誤畫成「已通知教師端，等待確認」。
    const knownIds = new Set(activeCalls.value.map(c => c.id))
    const localOnly = Array.from(localActiveCalls.values()).filter(c => !knownIds.has(c.id))
    // 進行中項目（含家長預約）依「接送時間先後」單一排序：已抵達比 arrived_at、
    // 預約未抵達比 expected_arrival_at，時間早的在前——預約 16:00 的孩子會排在
    // 16:05 才到門口的家長前面，讓老師照時間順序備妥孩子。
    const activeItems = [...activeCalls.value, ...localOnly]
      .filter(c => ACTIVE_STATUSES.has(c.status ?? ''))
      .sort((a, b) => pickupTimeMs(a) - pickupTimeMs(b))
      .map(toActiveItem)
    // WS 推播與本地 createDismissalCall 的 HTTP response 是不同通道，前者偶爾會
    // 更早抵達：這個瞬間 activeCalls 已經有這個學生、但 submit() 的 finally 還沒
    // 跑完把 staging 清掉，此處按 studentId 排除，避免同一學生短暫同時出現
    // staging + active 兩張卡（重複渲染，非重複發起——不影響 API 呼叫次數）。
    const activeStudentIds = new Set(activeItems.map(i => i.studentId))
    const stagingItems = Array.from(staging.entries())
      .filter(([studentId]) => !activeStudentIds.has(studentId))
      .map(([studentId, entry]) => toStagingItem(studentId, entry))
    // 今日 completed 記錄保留在佇列尾端（phase='done'）供回顧，不再從右欄消失。
    // 同一學生若正被再次通知（staging 倒數中或已有 active call），舊的 completed
    // 卡先讓位給進行中的那張，避免同一學生同時出現兩張卡；同一學生多筆
    // completed 只留 completed_at 最新的一筆，依 completed_at 新→舊排序。
    const stagingStudentIds = new Set(stagingItems.map(i => i.studentId))
    const latestDoneByStudent = new Map<number, DismissalCallView>()
    for (const call of activeCalls.value) {
      if (call.status !== 'completed') continue
      const sid = Number(call.student_id ?? 0)
      if (activeStudentIds.has(sid) || stagingStudentIds.has(sid)) continue
      const prev = latestDoneByStudent.get(sid)
      if (!prev || String(call.completed_at ?? '') > String(prev.completed_at ?? '')) {
        latestDoneByStudent.set(sid, call)
      }
    }
    const doneItems = Array.from(latestDoneByStudent.values())
      .sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')))
      .map(toDoneItem)
    // staging（倒數中尚未送出）排最前面，符合『加入後立即出現在合併清單中』；
    // done（已放學）殿後。
    return [...stagingItems, ...activeItems, ...doneItems]
  })

  /**
   * 0 秒到時才呼叫 createDismissalCall；只有成功才視為「已送出」，失敗時把錯誤
   * 呈現給使用者（比照既有 DismissalQueueView.vue handleQuickCreate/submitCreate
   * 的 try/catch + ElMessage 慣例，409 特別處理），不讓卡片靜默消失卻沒真的建立
   * 接送通知。無論成功或失敗，staging 都在 API 呼叫「結束後」才移除（finally），
   * 失敗時學生會回到可再次點擊發起的狀態。
   *
   * finally 用「entry 身分」而非單純 studentId 這把 key 判斷要不要刪除：await
   * 期間使用者可能 cancel() 掉這張卡（entry 已被移除）再重新 addToQueue（同一
   * studentId 產生新的 entry）——這種情況下 map 裡目前這把 key 對應的已經是
   * 「別次」倒數，此次呼叫不該把它一併刪掉，否則新倒數會無預警消失、且它自己
   * 的 timer 到期時 staging.get 已 undefined 而靜默 return，使用者對第二次點擊
   * 完全沒有任何回饋。
   *
   * 成功時直接用 response 建一筆本地 active 項目（見檔頭註解），讓卡片從
   * staging 移除的瞬間立刻以持續存在的 active 卡呈現，不必等 WS/輪詢。
   */
  async function submit(studentId: number) {
    const entry = staging.get(studentId)
    if (!entry) return
    try {
      const res = await createDismissalCall({
        student_id: studentId,
        classroom_id: entry.student.classroomId,
      })
      // TODO(ts-strict): waiting on backend response_model for POST /dismissal-calls（現為 unknown，
      // 這個 cast 完全不受型別系統保護——OpenAPI schema 對這個 response 給的就是 unknown，下面的
      // id 存在性檢查是唯一的執行期防線，未來後端回應形狀跑掉時 fail-safe 為「不做本地樂觀顯示、
      // 靜默交回 WS/輪詢」，不會把畸形資料塞進佇列或用 NaN 呼叫後續的 cancel）。
      const created = res.data as Schema<'DismissalCallOut'>
      if (typeof created?.id !== 'number') return
      localActiveCalls.set(created.id, {
        id: created.id,
        student_id: created.student_id,
        student_name: created.student_name,
        classroom_name: created.classroom_name,
        status: created.status,
        requested_at: created.requested_at,
        request_source: created.request_source,
        expected_arrival_at: created.expected_arrival_at,
        arrived_at: created.arrived_at,
      })
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      if (err.response?.status === 409) {
        ElMessage.info(`${entry.student.name} 已有進行中的接送通知`)
      } else {
        ElMessage.error(err.response?.data?.detail || `建立接送通知失敗：${entry.student.name}`)
      }
    } finally {
      if (staging.get(studentId) === entry) {
        staging.delete(studentId)
      }
    }
  }

  /**
   * 加入佇列（開始 5 秒倒數）。同一學生已在倒數中，或已有後端 active（pending/
   * acknowledged）通知時忽略，避免重複發起——後者重用既有 useDismissalRoster.ts
   * 的 activeCallStudentIds（與既有點名單 chip.is-notifying 同一份判斷邏輯），
   * 不另外定義一套「進行中」規則。
   */
  function addToQueue(student: PosDispatchStudent) {
    if (staging.has(student.id)) return
    if (activeCallStudentIds(activeCalls.value).has(student.id)) return
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      void submit(student.id)
    }, STAGING_DURATION_MS)
    staging.set(student.id, { student, startedAt, timer })
  }

  /**
   * 取消：staging 項目純前端丟棄（不打 API，D1）；已送出的後端 active call 呼叫
   * 既有 cancelDismissalCall，失敗時比照既有 DismissalQueueView.vue handleCancel
   * 的 try/catch + ElMessage 慣例呈現錯誤——不讓卡片在使用者眼中「已取消」卻其實
   * 後端沒動，靜默留下錯誤認知。
   */
  async function cancel(item: PosQueueItem) {
    // done（已放學）純回顧顯示，後端 completed 狀態沒有取消語意；卡片本身已
    // 停用 swipe（見 DismissalPosQueueCard），這裡再防呆一層避免誤打 API 收 409。
    if (item.phase === 'done') return
    if (item.phase === 'staging') {
      const entry = staging.get(item.studentId)
      if (entry) {
        clearTimeout(entry.timer)
        staging.delete(item.studentId)
      }
      return
    }
    try {
      await cancelDismissalCall(Number(item.id))
      // 取消成功即移除本地樂觀版本：POS active 檢視下 WS/輪詢對「已取消」是直接
      // 從 calls.value 濾除、不是 upsert（見 DismissalQueueView.vue handleWsEvent），
      // 該 id 可能永遠不會再出現在 activeCalls，若不主動清會讓這張卡卡死在右欄。
      localActiveCalls.delete(Number(item.id))
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      ElMessage.error(err.response?.data?.detail || `取消失敗：${item.studentName}`)
    }
  }

  // onScopeDispose（非 onUnmounted）：元件卸載與純 effectScope.stop() 皆會觸發，方便測試與非元件場景重用。
  onScopeDispose(() => {
    for (const entry of staging.values()) {
      clearTimeout(entry.timer)
    }
    staging.clear()
    localActiveCalls.clear()
  })

  return { queue, addToQueue, cancel }
}
