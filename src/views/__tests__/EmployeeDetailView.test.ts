import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import ElementPlus from 'element-plus'

// ── Mocks（比照 EmployeeHubView.spec.ts / EmployeeListView.cardview.spec.ts 既有慣例）──
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
vi.mock('@/stores/employee', () => ({ useEmployeeStore: () => ({ fetchEmployees: vi.fn() }) }))
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: ref(false) }) }))
// EmployeeFormDialog（雖被 stub，但 <script> 仍會靜態 import 到 @/stores/config → @/api/config，
// 需完整 named export 集合；用 importOriginal 只覆寫本測試會用到的 getPositionSalary）
vi.mock('@/api/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/config')>()
  return { ...actual, getPositionSalary: vi.fn(() => Promise.resolve({ data: {} })) }
})

// useEmployeeDetail 整批 mock：各測試以 buildDetail() 灌入不同 employee/certificates/contracts 資料，
// 不驗證 composable 內部載入邏輯（已有 useEmployeeDetail.test.ts 覆蓋），只驗證頁面層排版與待辦邏輯。
const mockUseEmployeeDetail = vi.fn()
vi.mock('@/composables/useEmployeeDetail', () => ({
  useEmployeeDetail: (...args: unknown[]) => mockUseEmployeeDetail(...args),
}))

import EmployeeDetailView from '../EmployeeDetailView.vue'

function buildDetail(overrides: {
  employee?: Record<string, unknown> | null
  certificates?: Record<string, unknown>[]
  contracts?: Record<string, unknown>[]
  subResourceErrors?: number
} = {}) {
  return {
    employee: ref(
      overrides.employee !== undefined
        ? overrides.employee
        : { id: 1, name: '測試員工', is_active: true, employee_type: 'regular', base_salary: 30000 },
    ),
    educations: ref([]),
    certificates: ref(overrides.certificates ?? []),
    contracts: ref(overrides.contracts ?? []),
    classHistory: ref([]),
    loading: ref(false),
    error: ref(null),
    subResourceErrors: ref(overrides.subResourceErrors ?? 0),
    load: vi.fn(),
    reloadCore: vi.fn(),
    reloadEducations: vi.fn(),
    reloadCertificates: vi.fn(),
    reloadContracts: vi.fn(),
  }
}

// 子區塊元件與 modal 全部 stub：本測試只驗證頁面層排版順序/收合/待辦邏輯，不驗證各子元件內部渲染。
// BasicSection 給可辨識的 marker，用來驗證「收合時看不到個資內容」。
const SECTION_STUBS = {
  JobSection: true,
  SalarySection: true,
  CredentialsSection: true,
  AttendanceSection: true,
  ClassHistorySection: true,
  OffboardingModal: true,
  EmployeeFormDialog: true,
  BasicSection: { template: '<div class="basic-content-marker">個資內容標記</div>' },
}

function mountDetail(overrides: Parameters<typeof buildDetail>[0] = {}) {
  mockUseEmployeeDetail.mockReturnValue(buildDetail(overrides))
  return mount(EmployeeDetailView, {
    props: { id: 1 },
    global: { plugins: [ElementPlus], stubs: SECTION_STUBS },
  })
}

// 相對「現在」建構本地日期字串，與元件內 expiryStatus 預設 today=new Date() 對齊；
// 手法沿用 CredentialsSection.test.ts 既有慣例。
function localISOOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('EmployeeDetailView 第一屏重排', () => {
  beforeEach(() => vi.clearAllMocks())

  it('右欄 section 順序為 職務→個資→薪資→證照合約→出勤', () => {
    const w = mountDetail()
    const ids = w.findAll('.detail-section').map((s) => s.attributes('id'))
    expect(ids).toEqual(['emp-sec-job', 'emp-sec-basic', 'emp-sec-salary', 'emp-sec-credentials', 'emp-sec-attendance'])
  })

  it('錨點導覽順序與文字同步（含「基本資料」改名「個資・聯絡」）', () => {
    const w = mountDetail()
    const labels = w.findAll('.anchor-link').map((a) => a.text())
    expect(labels).toEqual(['職務・班級', '個資・聯絡', '薪資・投保', '學歷・證照・合約', '出勤紀錄'])
  })

  it('個資 section 標題改為「個資・聯絡」', () => {
    const w = mountDetail()
    const basicSection = w.find('#emp-sec-basic')
    expect(basicSection.find('.section-title').text()).toBe('個資・聯絡')
  })

  it('個資 section 預設收合，看不到聯絡電話等個資內容（aria-hidden=true）', () => {
    const w = mountDetail()
    const wrap = w.find('#emp-sec-basic .el-collapse-item__wrap')
    expect(wrap.exists()).toBe(true)
    expect(wrap.attributes('aria-hidden')).toBe('true')
  })

  it('點擊個資 section 標題展開後可見個資內容', async () => {
    const w = mountDetail()
    await w.find('#emp-sec-basic .el-collapse-item__header').trigger('click')
    await nextTick()
    const wrap = w.find('#emp-sec-basic .el-collapse-item__wrap')
    expect(wrap.attributes('aria-hidden')).toBe('false')
    expect(w.find('.basic-content-marker').exists()).toBe(true)
  })

  // #5：收合列文案須隨狀態變化——收合時提示可展開的內容，展開後改為可收合的動作文案，
  // 否則展開後標題仍寫「展開查看…」與實際狀態矛盾、誤導使用者。
  it('個資收合標題隨狀態切換（收合「展開查看…」→ 展開「收合個資」）', async () => {
    const w = mountDetail()
    const headerText = () => w.find('#emp-sec-basic .el-collapse-item__header').text()
    expect(headerText()).toContain('展開查看聯絡電話・身分證・地址・緊急聯絡人')
    await w.find('#emp-sec-basic .el-collapse-item__header').trigger('click')
    await nextTick()
    expect(headerText()).toContain('收合個資')
    expect(headerText()).not.toContain('展開查看')
  })
})

describe('EmployeeDetailView 員工待辦列', () => {
  beforeEach(() => vi.clearAllMocks())

  it('全部條件不成立 → 待辦列整列不渲染', () => {
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 } })
    expect(w.find('.employee-todos').exists()).toBe(false)
  })

  it('正職在職且底薪為 0 → 顯示「待補薪資」', () => {
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 0 } })
    const tags = w.findAll('.employee-todos .el-tag').map((t) => t.text())
    expect(tags).toContain('待補薪資')
  })

  it('底薪為 null（遮罩顯示）不觸發待補薪資 —— 嚴格 === 0 判定', () => {
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: null } })
    expect(w.find('.employee-todos').exists()).toBe(false)
  })

  it('離職員工底薪為 0 → 不顯示待補薪資', () => {
    const w = mountDetail({ employee: { id: 1, is_active: false, employee_type: 'regular', base_salary: 0 } })
    expect(w.find('.employee-todos').exists()).toBe(false)
  })

  it('時薪制員工底薪為 0 → 不顯示待補薪資', () => {
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'hourly', base_salary: 0 } })
    expect(w.find('.employee-todos').exists()).toBe(false)
  })

  it('證照逾期與 30 天內到期分別計數顯示', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 },
      certificates: [
        { id: 1, expiry_date: localISOOffset(-3) },
        { id: 2, expiry_date: localISOOffset(-1) },
        { id: 3, expiry_date: localISOOffset(10) },
        { id: 4, expiry_date: localISOOffset(90) }, // ok，不計入
      ],
    })
    const tags = w.findAll('.employee-todos .el-tag').map((t) => t.text())
    expect(tags).toContain('證照已逾期 2')
    expect(tags).toContain('證照 30 天內到期 1')
  })

  it('合約已逾期 → 顯示「合約已到期」', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 },
      contracts: [{ id: 1, end_date: localISOOffset(-2) }],
    })
    const tags = w.findAll('.employee-todos .el-tag').map((t) => t.text())
    expect(tags).toContain('合約已到期')
  })

  it('合約 30 天內到期（無逾期）→ 顯示「合約將到期」', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 },
      contracts: [{ id: 1, end_date: localISOOffset(5) }],
    })
    const tags = w.findAll('.employee-todos .el-tag').map((t) => t.text())
    expect(tags).toContain('合約將到期')
  })

  it('合約結束日為 null（未定）不觸發任何合約 tag', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 },
      contracts: [{ id: 1, end_date: null }],
    })
    expect(w.find('.employee-todos').exists()).toBe(false)
  })

  it('點擊證照到期 tag → 捲動至學歷・證照・合約 section', async () => {
    const scrollIntoView = vi.fn()
    const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView } as unknown as HTMLElement)
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 },
      certificates: [{ id: 1, expiry_date: localISOOffset(-3) }],
    })
    await w.find('.employee-todos .el-tag').trigger('click')
    expect(getByIdSpy).toHaveBeenCalledWith('emp-sec-credentials')
    expect(scrollIntoView).toHaveBeenCalled()
    getByIdSpy.mockRestore()
  })

  it('點擊待補薪資 tag → 捲動至薪資・投保 section', async () => {
    const scrollIntoView = vi.fn()
    const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView } as unknown as HTMLElement)
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 0 } })
    await w.find('.employee-todos .el-tag').trigger('click')
    expect(getByIdSpy).toHaveBeenCalledWith('emp-sec-salary')
    getByIdSpy.mockRestore()
  })

  // ── 子資源載入失敗（reviewer Important）：certificates/contracts rejected 時停留空陣列，
  // 待辦掃不到資料 → 必須在待辦列位置浮出「可能不完整」提示，否則是持久假陰性。
  it('子資源載入失敗（subResourceErrors > 0）且無其他待辦 → 待辦列仍渲染並顯示不完整提示', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 30000 },
      subResourceErrors: 2,
    })
    const todos = w.find('.employee-todos')
    expect(todos.exists()).toBe(true)
    expect(todos.text()).toContain('部分資料載入失敗，待辦可能不完整')
  })

  it('子資源載入失敗且另有待辦 → 提示與待辦 tag 並存', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 0 },
      subResourceErrors: 1,
    })
    const tags = w.findAll('.employee-todos .el-tag').map((t) => t.text())
    expect(tags).toContain('待補薪資')
    expect(tags).toContain('部分資料載入失敗，待辦可能不完整')
  })

  it('子資源全數成功（subResourceErrors = 0）→ 不顯示不完整提示', () => {
    const w = mountDetail({
      employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 0 },
      subResourceErrors: 0,
    })
    const tags = w.findAll('.employee-todos .el-tag').map((t) => t.text())
    expect(tags).not.toContain('部分資料載入失敗，待辦可能不完整')
  })

  // ── 可存取性（finding #3）：待辦 tag 為可點控制項，需鍵盤可達 ──
  it('待辦 tag 具鍵盤可達性（role=button、tabindex=0）', () => {
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 0 } })
    const tag = w.find('.employee-todos .todo-tag')
    expect(tag.attributes('role')).toBe('button')
    expect(tag.attributes('tabindex')).toBe('0')
  })

  it('待辦 tag 支援鍵盤 Enter 觸發捲動', async () => {
    const scrollIntoView = vi.fn()
    const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView } as unknown as HTMLElement)
    const w = mountDetail({ employee: { id: 1, is_active: true, employee_type: 'regular', base_salary: 0 } })
    await w.find('.employee-todos .todo-tag').trigger('keydown.enter')
    expect(getByIdSpy).toHaveBeenCalledWith('emp-sec-salary')
    getByIdSpy.mockRestore()
  })
})

describe('EmployeeDetailView 錨點導覽升級', () => {
  beforeEach(() => vi.clearAllMocks())

  it('證照 30 天內到期 → 錨點「學歷・證照・合約」帶到期徽章', () => {
    const w = mountDetail({ certificates: [{ id: 1, expiry_date: localISOOffset(10) }] })
    const anchor = w.findAll('.anchor-link').find((a) => a.text().includes('學歷・證照・合約'))
    expect(anchor!.text()).toContain('1 即將到期')
  })

  it('證照已逾期優先於將到期顯示', () => {
    const w = mountDetail({
      certificates: [
        { id: 1, expiry_date: localISOOffset(-5) },
        { id: 2, expiry_date: localISOOffset(10) },
      ],
    })
    const anchor = w.findAll('.anchor-link').find((a) => a.text().includes('學歷・證照・合約'))
    expect(anchor!.text()).toContain('1 已逾期')
    expect(anchor!.text()).not.toContain('即將到期')
  })

  it('無到期證照 → 錨點無徽章（既有文字斷言不變）', () => {
    const w = mountDetail()
    const labels = w.findAll('.anchor-link').map((a) => a.text())
    expect(labels).toEqual(['職務・班級', '個資・聯絡', '薪資・投保', '學歷・證照・合約', '出勤紀錄'])
  })

  it('點擊錨點 → 該錨點取得 is-active（預設第一個 active）', async () => {
    const w = mountDetail()
    expect(w.findAll('.anchor-link')[0].classes()).toContain('is-active')
    await w.findAll('.anchor-link')[2].trigger('click')
    expect(w.findAll('.anchor-link')[2].classes()).toContain('is-active')
    expect(w.findAll('.anchor-link')[0].classes()).not.toContain('is-active')
  })
})

describe('EmployeeDetailView 英文名顯示', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aside 顯示員工英文名', () => {
    const w = mountDetail({
      employee: { id: 1, name: '王小明', english_name: 'Ming Wang', is_active: true, employee_type: 'regular', base_salary: 30000 },
    })
    expect(w.find('.detail-aside').text()).toContain('Ming Wang')
  })

  it('無英文名（null）時 aside 不渲染英文名區塊', () => {
    const w = mountDetail({
      employee: { id: 1, name: '王小明', english_name: null, is_active: true, employee_type: 'regular', base_salary: 30000 },
    })
    expect(w.find('.emp-english-name').exists()).toBe(false)
  })
})

describe('EmployeeDetailView 返回入口收斂', () => {
  beforeEach(() => vi.clearAllMocks())

  it('返回入口已上移至頂列麵包屑，頁內不再重複放返回鍵', () => {
    // 全站唯一的「回上一層」機制是 AdminHeader 的麵包屑父層。
    // 頁內再放一顆等於同一動作兩個入口、位置還各不相同（本次收斂的原因）。
    const w = mountDetail()
    expect(w.text()).not.toContain('返回員工列表')
  })
})
