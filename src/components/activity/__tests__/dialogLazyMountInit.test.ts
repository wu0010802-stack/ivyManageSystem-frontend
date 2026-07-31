// 回歸測試：父層 ActivityRegistrationView 自 b6476c68（2026-06-23 效能批次）起把這幾支對話框
// 改成 defineAsyncComponent + `v-if="xxxVisible"` 真懶掛載，元件是在 modelValue 已為 true 之後
// 才 setup，之後不再有 false→true 變化。原本的 watch(() => props.modelValue) 沒帶 immediate，
// 初始化因此永遠不觸發：繳費/退費金額與日期空白（送出鈕恆 disabled）、編輯基本資料四欄空白
// （且送出會把 email 清成 null）、用品下拉永遠沒有選項。
//
// 既有測試全部以 modelValue:false 掛載再 setProps(true)，人工製造了真實情境不存在的轉換，
// 所以一路是綠的。本檔一律「直接以 modelValue:true 掛載」＝ v-if 懶掛載的真實情境。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RegistrationPaymentDialog from '../RegistrationPaymentDialog.vue'
import RegistrationEditBasicDialog from '../RegistrationEditBasicDialog.vue'
import RegistrationAddSupplyDialog from '../RegistrationAddSupplyDialog.vue'
import RegistrationCreateDialog from '../RegistrationCreateDialog.vue'
import RegistrationAddCourseDialog from '../RegistrationAddCourseDialog.vue'

const getSuppliesMock = vi.hoisted(() => vi.fn())
const getRefundSuggestionMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  addRegistrationPayment: vi.fn(),
  getRefundSuggestion: getRefundSuggestionMock,
  updateRegistrationBasic: vi.fn(),
  addRegistrationCourse: vi.fn(),
  addRegistrationSupply: vi.fn(),
  createRegistration: vi.fn(),
  getSupplies: getSuppliesMock,
}))

const stubs = { global: { stubs: { teleport: true } } }

describe('對話框懶掛載（v-if）時仍須完成開窗初始化', () => {
  beforeEach(() => {
    getSuppliesMock.mockReset()
    getSuppliesMock.mockResolvedValue({ data: { supplies: [{ id: 1, name: '畫具組', price: 300 }] } })
    getRefundSuggestionMock.mockReset()
    getRefundSuggestionMock.mockResolvedValue({ data: { remaining_suggested_amount: 500 } })
  })

  it('繳費對話框：預填欠款金額、今日日期與 idempotency_key', async () => {
    const w = mount(RegistrationPaymentDialog, {
      props: { modelValue: true, type: 'payment', registrationId: 7, totalAmount: 1200, paidAmount: 200 },
      ...stubs,
    })
    await flushPromises()
    expect(w.vm.form.amount).toBe(1000) // 1200 - 200
    expect(w.vm.form.payment_date).not.toBe('')
    expect(w.vm.form.idempotency_key).toMatch(/^REG-\d+-[a-z0-9]+$/)
  })

  it('退費對話框：載入後端退費建議並套用剩餘建議額', async () => {
    const w = mount(RegistrationPaymentDialog, {
      props: { modelValue: true, type: 'refund', registrationId: 7, totalAmount: 900, paidAmount: 900 },
      ...stubs,
    })
    await flushPromises()
    expect(getRefundSuggestionMock).toHaveBeenCalledWith(7)
    expect(w.vm.form.amount).toBe(500)
  })

  it('編輯基本資料對話框：四欄自 initial 預填（空白送出會把 email 清成 null）', async () => {
    const w = mount(RegistrationEditBasicDialog, {
      props: {
        modelValue: true,
        registrationId: 7,
        initial: { student_name: '王小明', birthday: '2020-01-01', class_name: '天堂鳥', email: 'a@b.co' },
        classroomOptions: [],
      },
      ...stubs,
    })
    await flushPromises()
    expect(w.vm.form.name).toBe('王小明')
    expect(w.vm.form.birthday).toBe('2020-01-01')
    expect(w.vm.form.class_).toBe('天堂鳥')
    expect(w.vm.form.email).toBe('a@b.co')
  })

  it('新增用品對話框：載入用品清單', async () => {
    mount(RegistrationAddSupplyDialog, {
      props: { modelValue: true, registrationId: 7, schoolYear: 115, semester: 1, existingSupplyIds: [] },
      ...stubs,
    })
    await flushPromises()
    expect(getSuppliesMock).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
  })

  it('新增報名對話框：載入用品清單', async () => {
    mount(RegistrationCreateDialog, {
      props: { modelValue: true, schoolYear: 115, semester: 1, classroomOptions: [], courseOptions: [] },
      ...stubs,
    })
    await flushPromises()
    expect(getSuppliesMock).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
  })

  it('新增課程對話框：課程選擇維持未選狀態', async () => {
    const w = mount(RegistrationAddCourseDialog, {
      props: { modelValue: true, registrationId: 7, courseOptions: [{ id: 1, name: '美術' }], enrolledCourseIds: [] },
      ...stubs,
    })
    await flushPromises()
    expect(w.vm.addCourseId).toBeNull()
  })
})
