// @vitest-environment jsdom
// DOMPurify 清洗依賴瀏覽器級 HTML parser，happy-dom 解析差異會影響輸出形態，
// 比照 src/parent/components/assistant/__tests__/FaqAnswer.spec.ts 慣例。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { defineComponent, ref } from 'vue'

vi.mock('@/parent/api/signDocuments', () => ({
  getMySignRequest: vi.fn(),
  signMyRequest: vi.fn(),
  mySignPdfUrl: (id: number) => `http://test/api/parent/me/sign-requests/${id}/pdf`,
}))

import { getMySignRequest, signMyRequest } from '@/parent/api/signDocuments'
import SignDetailView from '../SignDetailView.vue'

const mockGet = getMySignRequest as ReturnType<typeof vi.fn>
const mockSign = signMyRequest as ReturnType<typeof vi.fn>

// SignaturePad 依賴真實 canvas 2d context（jsdom 未實作，見
// https://github.com/jsdom/jsdom#canvas-support），無法在測試環境模擬真實
// 畫布手勢。用替身元件取代：root 元素承接 @mouseup/@touchend fallthrough
// （父層 checkSignature 監聽的正是這兩個事件），expose isEmpty/toBlob 供
// SignDetailView 內部透過 padRef 呼叫，與真實元件介面一致。
const FakeSignaturePad = defineComponent({
  setup(_, { expose }) {
    const inked = ref(false)
    expose({
      isEmpty: () => !inked.value,
      toBlob: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    })
    return { inked }
  },
  template: '<div class="fake-signature-pad" @click="inked = true" />',
})

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/sign/:id', component: SignDetailView }, { path: '/sign', component: { template: '<div />' } }],
})

async function mountAt(id: string) {
  router.push(`/sign/${id}`)
  await router.isReady()
  return mount(SignDetailView, {
    global: { plugins: [router], stubs: { SignaturePad: FakeSignaturePad } },
  })
}

/** 模擬「已簽名」：先點擊替身畫布留墨、再觸發 mouseup（父層 checkSignature 監聽的事件）。 */
async function fakeSign(w: ReturnType<typeof mount>) {
  const pad = w.find('.fake-signature-pad')
  await pad.trigger('click')
  await pad.trigger('mouseup')
}

/** blobToDataUrl 內部用 FileReader.readAsDataURL，在 jsdom 經由 macrotask 完成，
 * 純 flushPromises()（只 flush microtask）不足以讓它跑完，須額外等一次真實 tick。 */
async function waitForFileReader() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await flushPromises()
}

const pendingDoc = {
  id: 7,
  student_id: 10,
  student_name: '王小明',
  title: '入學契約',
  doc_type: 'contract',
  status: 'pending',
  sent_at: '2026-08-11T10:00:00',
  signed_at: null,
  has_pdf: false,
  content_md: '### 契約內容\n王小明於 115 學年度入學。',
  content_hash: 'h1',
}

describe('SignDetailView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('已簽署文件顯示完成狀態，不顯示簽名區', async () => {
    mockGet.mockResolvedValue({
      data: { ...pendingDoc, status: 'signed', signed_at: '2026-08-11T12:00:00' },
    })
    const w = await mountAt('7')
    await flushPromises()
    expect(w.text()).toContain('已於')
    expect(w.text()).toContain('完成簽署')
    expect(w.find('canvas').exists()).toBe(false)
  })

  it('待簽文件：內容超出一屏時，未捲動到底「我已閱讀」勾選框 disabled', async () => {
    // jsdom 無真實排版引擎，scrollHeight/clientHeight 預設皆為 0（視為「內容
    // 不足一屏」自動放行）；元件內部 nextTick 檢查發生在 mount 後的微任務，
    // 若等到元件渲染完才覆寫會race輸；改在 prototype 層級覆寫 getter，
    // 不論何時被讀取都回傳「內容超出一屏」的模擬值。
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(2000)
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(400)
    mockGet.mockResolvedValue({ data: pendingDoc })
    const w = await mountAt('7')
    await flushPromises()
    const checkbox = w.find('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).disabled).toBe(true)
    scrollHeightSpy.mockRestore()
    clientHeightSpy.mockRestore()
  })

  it('確認簽署按鈕在未滿足三條件前 disabled', async () => {
    mockGet.mockResolvedValue({ data: pendingDoc })
    const w = await mountAt('7')
    await flushPromises()
    const submitBtn = w.find('.sign-detail-view__submit')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('內容不足一屏時（scrollHeight<=clientHeight，jsdom 預設值）自動視為已讀到底', async () => {
    mockGet.mockResolvedValue({ data: pendingDoc })
    const w = await mountAt('7')
    await flushPromises()
    const checkbox = w.find('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).disabled).toBe(false)
  })

  it('簽署成功後呼叫 signMyRequest 並帶 signature_data + confirmed_read', async () => {
    mockGet.mockResolvedValueOnce({ data: pendingDoc })
    mockSign.mockResolvedValue({ data: { status: 'signed', signed_at: '2026-08-11T12:00:00' } })
    const w = await mountAt('7')
    await flushPromises()

    await w.find('input[type="checkbox"]').setValue(true)
    await fakeSign(w)
    await flushPromises()

    const submitBtn = w.find('.sign-detail-view__submit')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)

    mockGet.mockResolvedValueOnce({
      data: { ...pendingDoc, status: 'signed', signed_at: '2026-08-11T12:00:00' },
    })
    await submitBtn.trigger('click')
    await waitForFileReader()

    expect(mockSign).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ confirmed_read: true }),
    )
    const call = mockSign.mock.calls[0][1]
    expect(call.signature_data).toMatch(/^data:image\/png;base64,/)
  })

  it('409 衝突時提示已由另一位家長完成並導回列表', async () => {
    mockGet.mockResolvedValueOnce({ data: pendingDoc })
    mockSign.mockRejectedValue({ response: { status: 409 } })
    const w = await mountAt('7')
    await flushPromises()
    await w.find('input[type="checkbox"]').setValue(true)
    await fakeSign(w)
    await flushPromises()

    const replaceSpy = vi.spyOn(router, 'replace')
    await w.find('.sign-detail-view__submit').trigger('click')
    await waitForFileReader()

    expect(replaceSpy).toHaveBeenCalledWith('/sign')
  })
})
