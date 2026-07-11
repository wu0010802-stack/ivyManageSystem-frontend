import { ElMessageBox } from 'element-plus'

/**
 * 學生重複建檔防呆（架構評估 D4，2026-07-11）配套。
 *
 * 後端 `POST /students`（api/students.py create_student，ivy-backend）以
 * (name, birthday) 精確比對既有「非終態」學生，命中則回 409。detail 為純文字
 * （非結構化 JSON），格式固定含既有學生 id/classroom_id/lifecycle_status 與
 * "allow_duplicate=true" 覆寫提示字樣，例如：
 *
 *   "已有同名同生日的既有學生（id=42, classroom_id=3,
 *    lifecycle_status=enrolled），可能為重複建檔。如確認為不同學生，
 *    請帶 allow_duplicate=true 覆寫。"
 *
 * 以 detail 是否含 "allow_duplicate=true" 字樣辨識此特定 409，與其他 409
 * （如學號配發衝突）區分，避免對非重複建檔的 409 也彈確認框。
 */

export interface DuplicateStudentConflict {
  /** 後端回傳的完整 detail 文字（已含既有學生 id/班級/lifecycle_status） */
  message: string
}

const DUPLICATE_STUDENT_MARKER = 'allow_duplicate=true'

/** 判斷 error 是否為「同名同生日既有學生」409 衝突；非此類 409 回 null。 */
export function parseDuplicateStudentConflict(error: unknown): DuplicateStudentConflict | null {
  if (!error || typeof error !== 'object') return null
  const response = (error as { response?: { status?: unknown; data?: { detail?: unknown } } }).response
  if (!response || response.status !== 409) return null
  const detail = response.data?.detail
  if (typeof detail !== 'string' || !detail.includes(DUPLICATE_STUDENT_MARKER)) return null
  return { message: detail }
}

/**
 * 使用者在重複建檔確認框選擇「取消」時拋出的 sentinel。
 *
 * `silent = true`：`isSilentError`（src/utils/errorHandler.ts）據此判定為
 * 使用者主動放棄的操作，不應顯示錯誤 toast（沿用既有 CANCELED 靜默慣例）。
 */
export class StudentDuplicateCreateCancelled extends Error {
  readonly silent = true
  constructor() {
    super('使用者取消重複建檔確認')
    this.name = 'StudentDuplicateCreateCancelled'
  }
}

/**
 * 預設確認框：ElMessageBox.confirm，訊息body 呈現既有學生資訊（後端 detail 原文，
 * 已含 id/班級/lifecycle_status），title 為「確認為不同學生仍要建立？」，
 * 按鈕文案「仍要建立」/「取消」。
 */
async function defaultConfirm(message: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, '確認為不同學生仍要建立？', {
      confirmButtonText: '仍要建立',
      cancelButtonText: '取消',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

/**
 * 包裝「新增學生」submit：命中重複建檔 409 時呼叫 `confirm` 詢問使用者，
 * 確認後帶 `allow_duplicate: true` 重送同一 payload；取消則拋出
 * {@link StudentDuplicateCreateCancelled}（呼叫端應視為靜默放棄，維持表單
 * 開啟、不顯示錯誤訊息）。非重複建檔的錯誤（其他 409 / 422 / 500 等）原樣
 * 拋出，交由呼叫端既有 catch 處理不變。
 *
 * @param submit  實際送出 API 呼叫（例如 `createStudent`），可能被呼叫兩次
 * @param payload 表單 payload（不含 allow_duplicate，由本函式視情況附加）
 * @param confirm 確認框（預設用 ElMessageBox.confirm；測試可注入假的以避免掛載真元件）
 */
export async function submitStudentCreateWithDuplicateConfirm<T>(
  submit: (payload: Record<string, unknown>) => Promise<T>,
  payload: Record<string, unknown>,
  confirm: (message: string) => Promise<boolean> = defaultConfirm,
): Promise<T> {
  try {
    return await submit(payload)
  } catch (error) {
    const conflict = parseDuplicateStudentConflict(error)
    if (!conflict) throw error
    const confirmed = await confirm(conflict.message)
    if (!confirmed) throw new StudentDuplicateCreateCancelled()
    return await submit({ ...payload, allow_duplicate: true })
  }
}
