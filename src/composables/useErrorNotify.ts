import { ElMessage } from 'element-plus'
import {
  ErrorType,
  classifyError,
  getErrorMessage,
  isSilentError,
} from '@/utils/errorHandler'

/**
 * 統一錯誤通知 composable。
 *
 * 使用方式：
 *   const { notify } = useErrorNotify()
 *   try { ... } catch (e) { notify(e, 'EmployeeView:fetch') }
 *   // 帶 fallback
 *   try { ... } catch (e) { notify(e, 'EmployeeView:save', '儲存失敗') }
 *   // 帶 prefix（取代 'X失敗: ' + apiError(...) 模式）
 *   try { ... } catch (e) { notify(e, 'AttendanceView:upload', null, { prefix: '上傳失敗' }) }
 *
 * 特性：
 *  - 401 由 api/index.js interceptor 自動導向登入頁，此處不重複顯示
 *  - CANCELED（AbortController）靜默忽略
 *  - 其他錯誤以 ElMessage 顯示分類後的訊息
 *  - 可選傳入 fallback 蓋過預設訊息
 *  - 可選 prefix 模式: 前綴 + ': ' + (error message 或 fallback)
 */
export function useErrorNotify() {
  const notify = (error: unknown, context = '', fallback: string | null = null, options: { prefix?: string } = {}) => {
    if (isSilentError(error)) return

    const type = classifyError(error)
    if (type === ErrorType.UNAUTHORIZED) {
      // interceptor 會導向登入頁；此處不彈錯訊避免閃爍
      return
    }

    const baseMessage = getErrorMessage(error, fallback)
    const message = options.prefix
      ? `${options.prefix}: ${baseMessage}`
      : baseMessage
    ElMessage.error(message)

    // 保留 hook：未來串接 Sentry / 後端 audit 時在此呼叫 reportError
    if (import.meta.env.DEV && context) {
       
      console.warn(`[${context}] ${type}: ${message}`, error)
    }
  }

  return { notify, classifyError, getErrorMessage }
}
