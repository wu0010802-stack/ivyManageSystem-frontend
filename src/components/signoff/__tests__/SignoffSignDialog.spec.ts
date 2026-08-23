import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/utils/imageCompress', () => ({
  compressImageToDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,BBB'),
}))

import { ElMessage } from 'element-plus'
import { VENDOR_SIGNOFF_MODULE, type SignoffModuleConfig } from '@/config/signoffModules'
import SignoffSignDialog from '../SignoffSignDialog.vue'

const globalStubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="dialog-stub" :data-title="title"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title'],
  },
  'el-tabs': { template: '<div><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div><slot /></div>', props: ['label', 'name'] },
  'el-upload': { template: '<div class="el-upload-stub"><slot /></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
}

interface DialogVm {
  activeTab: string
  submit: () => Promise<void>
  startDraw: (e: MouseEvent) => void
  draw: (e: MouseEvent) => void
  endDraw: () => void
  handleUploadChange: (file: { raw?: File; size?: number; name?: string }) => void
}

function makeConfig(signMock: ReturnType<typeof vi.fn>): SignoffModuleConfig {
  return { ...VENDOR_SIGNOFF_MODULE, api: { ...VENDOR_SIGNOFF_MODULE.api, sign: signMock } }
}

function mountDialog(signMock: ReturnType<typeof vi.fn>) {
  return mount(SignoffSignDialog, {
    props: { modelValue: true, recordId: 3, config: makeConfig(signMock) },
    global: { stubs: globalStubs },
  })
}

describe('SignoffSignDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '', fillRect: vi.fn(), lineCap: '', lineJoin: '', lineWidth: 0,
      strokeStyle: '', beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA')
    if (!('createObjectURL' in URL)) {
      Object.assign(URL, { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} })
    }
  })

  it('dialog 標題來自 config.texts.signTitle（內控改版後為「付款憑證」）', () => {
    const wrapper = mountDialog(vi.fn())
    expect(wrapper.find('.dialog-stub').attributes('data-title')).toBe('付款憑證')
  })

  it('photo tab 未選照片就送出 → 警告且不打 API', async () => {
    const signMock = vi.fn()
    const wrapper = mountDialog(signMock)
    await (wrapper.vm as unknown as DialogVm).submit()
    expect(ElMessage.warning).toHaveBeenCalledWith('請選擇照片')
    expect(signMock).not.toHaveBeenCalled()
  })

  it('drawn tab 未簽名就送出 → 警告且不打 API', async () => {
    const signMock = vi.fn()
    const wrapper = mountDialog(signMock)
    const vm = wrapper.vm as unknown as DialogVm
    vm.activeTab = 'drawn'
    await vm.submit()
    expect(ElMessage.warning).toHaveBeenCalledWith('請先簽名')
    expect(signMock).not.toHaveBeenCalled()
  })

  it('drawn 簽名後送出 → 以 canvas dataURL 呼叫 config.api.sign 並 emit signed', async () => {
    const signMock = vi.fn().mockResolvedValue({ data: { message: 'ok' } })
    const wrapper = mountDialog(signMock)
    const vm = wrapper.vm as unknown as DialogVm
    vm.activeTab = 'drawn'
    vm.startDraw({ clientX: 1, clientY: 1 } as MouseEvent)
    vm.draw({ clientX: 5, clientY: 5 } as MouseEvent)
    vm.endDraw()
    await vm.submit()
    await flushPromises()
    expect(signMock).toHaveBeenCalledWith(3, {
      signature_kind: 'drawn',
      signature_data: 'data:image/png;base64,AAA',
    })
    expect(wrapper.emitted('signed')).toHaveLength(1)
  })

  it('photo 選檔後送出 → 走壓縮結果呼叫 sign', async () => {
    const signMock = vi.fn().mockResolvedValue({ data: { message: 'ok' } })
    const wrapper = mountDialog(signMock)
    const vm = wrapper.vm as unknown as DialogVm
    vm.handleUploadChange({ raw: new File(['x'], 'a.png', { type: 'image/png' }), name: 'a.png', size: 3 })
    await vm.submit()
    await flushPromises()
    expect(signMock).toHaveBeenCalledWith(3, {
      signature_kind: 'photo',
      signature_data: 'data:image/jpeg;base64,BBB',
    })
  })
})
