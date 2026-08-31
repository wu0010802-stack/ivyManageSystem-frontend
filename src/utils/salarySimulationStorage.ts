/**
 * 薪資試算結果含員工身分與薪資金額，只能存活於目前管理端身分世代。
 * key 集中定義，避免試算頁與登出／代操作清理邏輯各自維護後漂移。
 */
export const SALARY_SIMULATION_LAST_KEY = 'salary_simulate_last_v2'
export const SALARY_SIMULATION_CACHE_KEY = 'salary_simulate_cache_v2'

export function clearSalarySimulationStorage(): void {
  try {
    sessionStorage.removeItem(SALARY_SIMULATION_LAST_KEY)
    sessionStorage.removeItem(SALARY_SIMULATION_CACHE_KEY)
  } catch {
    /* storage 被停用時不阻斷其餘身分隔離措施 */
  }
}
