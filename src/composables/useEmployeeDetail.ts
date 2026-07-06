import { ref, watch, type Ref } from 'vue'
import {
  getEmployee, listEmployeeEducations, listEmployeeCertificates,
  listEmployeeContracts, listEmployeeClassHistory,
} from '@/api/employees'
import type { ClassHistoryRow } from '@/utils/classHistory'

/**
 * 員工詳情頁資料層：主資料必須成功（失敗 → error 擋頁）；
 * 四個子資源並行載入、單項失敗不擋頁（subResourceErrors 供 UI 顯示部分載入警示）。
 * 深連結直接進 /employees/:id 時不經清單 store，自行打 API。
 * load() 有過期守衛：id 快速切換時，舊回應以 loadSeq 比對後整批丟棄，不會覆蓋新資料。
 */
export function useEmployeeDetail(employeeId: Ref<number>) {
  const employee = ref<Record<string, unknown> | null>(null)
  const educations = ref<Record<string, unknown>[]>([])
  const certificates = ref<Record<string, unknown>[]>([])
  const contracts = ref<Record<string, unknown>[]>([])
  const classHistory = ref<ClassHistoryRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const subResourceErrors = ref(0)

  const reloadCore = async () => {
    employee.value = (await getEmployee(employeeId.value)).data as Record<string, unknown>
  }
  const reloadEducations = async () => {
    educations.value = (await listEmployeeEducations(employeeId.value)).data as Record<string, unknown>[]
  }
  const reloadCertificates = async () => {
    certificates.value = (await listEmployeeCertificates(employeeId.value)).data as Record<string, unknown>[]
  }
  const reloadContracts = async () => {
    contracts.value = (await listEmployeeContracts(employeeId.value)).data as Record<string, unknown>[]
  }

  let loadSeq = 0
  const load = async () => {
    const seq = ++loadSeq
    const id = employeeId.value
    loading.value = true
    error.value = null
    subResourceErrors.value = 0
    employee.value = null
    let core: Record<string, unknown>
    try {
      core = (await getEmployee(id)).data as Record<string, unknown>
    } catch {
      if (seq !== loadSeq) return
      error.value = '載入員工資料失敗'
      loading.value = false
      return
    }
    if (seq !== loadSeq) return
    employee.value = core
    const results = await Promise.allSettled([
      listEmployeeEducations(id),
      listEmployeeCertificates(id),
      listEmployeeContracts(id),
      listEmployeeClassHistory(id),
    ])
    if (seq !== loadSeq) return
    const [edu, cert, contract, history] = results
    if (edu.status === 'fulfilled') educations.value = edu.value.data as Record<string, unknown>[]
    if (cert.status === 'fulfilled') certificates.value = cert.value.data as Record<string, unknown>[]
    if (contract.status === 'fulfilled') contracts.value = contract.value.data as Record<string, unknown>[]
    if (history.status === 'fulfilled') classHistory.value = (history.value.data.rows ?? []) as ClassHistoryRow[]
    subResourceErrors.value = results.filter((r) => r.status === 'rejected').length
    loading.value = false
  }

  watch(employeeId, load, { immediate: true })

  return {
    employee, educations, certificates, contracts, classHistory,
    loading, error, subResourceErrors,
    load, reloadCore, reloadEducations, reloadCertificates, reloadContracts,
  }
}
