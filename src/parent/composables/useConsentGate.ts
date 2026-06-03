/**
 * P2-4：家長 consent gate composable（module-singleton）。
 *
 * 當家長 LIFF interceptor 攔截到 403 + X-Consent-Required header 時，
 * 呼叫 require(scope) 彈出 re-consent modal。
 * modal 簽署完成後呼叫 resolve() 關閉。
 *
 * module-singleton 設計：整個 parent app 只有一個 gate 實例，
 * 確保不同 axios 並發請求的 403 不會疊加出多個 modal。
 */
import { ref, type Ref } from 'vue'

export interface ConsentGate {
  visible: Ref<boolean>
  pendingScope: Ref<string | null>
  require: (scope: string) => void
  resolve: () => void
  reset: () => void
}

const visible = ref(false)
const pendingScope = ref<string | null>(null)

function require(scope: string): void {
  pendingScope.value = scope
  visible.value = true
}

function resolve(): void {
  visible.value = false
  pendingScope.value = null
}

function reset(): void {
  visible.value = false
  pendingScope.value = null
}

const gate: ConsentGate = { visible, pendingScope, require, resolve, reset }

export function useConsentGate(): ConsentGate {
  return gate
}
