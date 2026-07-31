import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn(),
  updateApprovalPolicies: vi.fn().mockResolvedValue({ data: {} }),
}))

const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

// vuedraggable stub：渲染 item slot、v-model 直通（拖拉重排以直接改 chainDraft 模擬）
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'handle', 'disabled'],
    emits: ['update:modelValue'],
    template: `<div data-test="draggable"><template v-for="(el, i) in modelValue" :key="el.uid"><slot name="item" :element="el" :index="i" /></template></div>`,
  },
}))

import { getApprovalPolicies, updateApprovalPolicies } from '@/api/approvalSettings'
import ApprovalChainEditor from '../ApprovalChainEditor.vue'
import type { RolesDefinition } from '../types'

const definition: RolesDefinition = {
  permissions: {},
  groups: [],
  roles: {
    admin: { label: '管理員', description: '', permissions: ['*'], flags: ['super_admin'] },
    supervisor: { label: '主管', description: '', permissions: [], flags: [] },
    hr: { label: '人資', description: '', permissions: [], flags: [] },
    teacher: { label: '教師', description: '', permissions: [], flags: ['portal_only'] },
    parent: { label: '家長', description: '', permissions: [], flags: ['parent', 'portal_only'] },
  },
}

const basePolicies = [
  { id: 1, doc_type: 'all', submitter_role: 'teacher', approver_roles: 'supervisor,hr', is_active: true },
  { id: 2, doc_type: 'leave', submitter_role: 'teacher', approver_roles: 'supervisor', is_active: true },
  { id: 3, doc_type: 'all', submitter_role: 'hr', approver_roles: 'admin', is_active: true },
]

type Vm = {
  activeDocType: string
  chainDraft: { uid: number; role: string }[]
  overrideEditing: boolean
  startOverride: () => void
  stageToAdd: string
  addStage: () => void
  removeStage: (i: number) => void
  saveChain: () => Promise<void>
  removeOverride: () => Promise<void>
  warnings: string[]
  candidateRoles: { code: string }[]
  isChainDirty: boolean
  switchDocType: (next: string) => Promise<void>
}

const mountEditor = async (submitterRole = 'teacher', accountCounts: Record<string, number> | null = { teacher: 5, supervisor: 2, hr: 1, admin: 1 }) => {
  vi.mocked(getApprovalPolicies).mockResolvedValue({ data: basePolicies } as never)
  const w = mount(ApprovalChainEditor, {
    props: { submitterRole, definition, accountCounts },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return { w, vm: w.vm as unknown as Vm }
}

describe('ApprovalChainEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('all：草稿載入現有鏈序（supervisor→hr）並顯示 ①②', async () => {
    const { w, vm } = await mountEditor()
    expect(vm.chainDraft.map((s) => s.role)).toEqual(['supervisor', 'hr'])
    expect(w.text()).toContain('①')
    expect(w.text()).toContain('②')
  })

  it('切到 leave（有覆寫）→ 草稿載入覆寫鏈；切到 overtime（無覆寫）→ 顯示沿用 all 預覽與建立按鈕', async () => {
    const { w, vm } = await mountEditor()
    vm.activeDocType = 'leave'
    await flushPromises()
    expect(vm.chainDraft.map((s) => s.role)).toEqual(['supervisor'])
    vm.activeDocType = 'overtime'
    await flushPromises()
    expect(w.text()).toContain('沿用共同設定')
    expect(w.find('[data-testid="start-override"]').exists()).toBe(true)
  })

  it('建立覆寫：複製 all 鏈為草稿', async () => {
    const { vm } = await mountEditor()
    vm.activeDocType = 'overtime'
    await flushPromises()
    vm.startOverride()
    expect(vm.overrideEditing).toBe(true)
    expect(vm.chainDraft.map((s) => s.role)).toEqual(['supervisor', 'hr'])
  })

  it('候選角色排除 parent flag（teacher/portal_only 可入鏈、parent 不可）', async () => {
    const { vm } = await mountEditor()
    const codes = vm.candidateRoles.map((c) => c.code)
    expect(codes).toContain('teacher')
    expect(codes).toContain('admin')
    expect(codes).not.toContain('parent')
  })

  it('增刪＋調序後儲存：CSV 依草稿順序、confirm 先行', async () => {
    const { vm } = await mountEditor()
    vm.stageToAdd = 'admin'
    vm.addStage()
    // 模擬拖拉：hr 移到第一關
    const [a, b, c] = vm.chainDraft
    vm.chainDraft.splice(0, 3, b, a, c)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.saveChain()
    await flushPromises()
    expect(vi.mocked(updateApprovalPolicies)).toHaveBeenCalledWith([
      { submitter_role: 'teacher', doc_type: 'all', approver_roles: 'hr,supervisor,admin', is_active: true },
    ])
    confirmSpy.mockRestore()
  })

  it('空鏈儲存：警告且不送 API', async () => {
    const { vm } = await mountEditor()
    vm.removeStage(0)
    vm.removeStage(0)
    await vm.saveChain()
    expect(vi.mocked(updateApprovalPolicies)).not.toHaveBeenCalled()
  })

  it('移除覆寫：送 is_active:false 原 CSV', async () => {
    const { vm } = await mountEditor()
    vm.activeDocType = 'leave'
    await flushPromises()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.removeOverride()
    await flushPromises()
    expect(vi.mocked(updateApprovalPolicies)).toHaveBeenCalledWith([
      { submitter_role: 'teacher', doc_type: 'leave', approver_roles: 'supervisor', is_active: false },
    ])
    confirmSpy.mockRestore()
  })

  it('死鎖偵測：關卡角色 0 帳號、submitter 同角色單人 → 各出 warning', async () => {
    const { vm } = await mountEditor('hr', { hr: 1, admin: 0 })
    // hr 的 all 鏈 = admin（0 帳號）→ warning(a)；再加 hr 自己（1 帳號）→ warning(b)
    vm.stageToAdd = 'hr'
    vm.addStage()
    expect(vm.warnings.some((x) => x.includes('沒有任何帳號'))).toBe(true)
    expect(vm.warnings.some((x) => x.includes('自審死鎖'))).toBe(true)
  })

  it('回歸：submitter 同角色但 0 帳號時，只出「沒有帳號」，不重複觸發「自審死鎖」', async () => {
    const { vm } = await mountEditor('hr', { hr: 0, admin: 5 })
    // hr 預設鏈已含 admin（5 帳號，不觸發警示）；再加 hr 自己（0 帳號，非「submitter 為唯一成員」情境）
    vm.stageToAdd = 'hr'
    vm.addStage()
    expect(vm.warnings.filter((x) => x.includes('沒有任何帳號'))).toHaveLength(1)
    expect(vm.warnings.some((x) => x.includes('自審死鎖'))).toBe(false)
  })

  it('accountCounts null：不出 warning', async () => {
    const { vm } = await mountEditor('hr', null)
    expect(vm.warnings).toEqual([])
  })

  it('非 super_admin：唯讀（無儲存鈕、有唯讀 alert）', async () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const { w } = await mountEditor()
    expect(w.find('[data-testid="save-chain"]').exists()).toBe(false)
    expect(w.text()).toContain('僅超級管理員可修改審核流程')
  })

  it('GET 403：降級 alert', async () => {
    vi.mocked(getApprovalPolicies).mockRejectedValueOnce(new Error('403'))
    const w = mount(ApprovalChainEditor, {
      props: { submitterRole: 'teacher', definition, accountCounts: null },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('無法載入審核政策')
  })

  it('super_admin 固定說明列常駐', async () => {
    const { w } = await mountEditor()
    expect(w.text()).toContain('任何關卡皆可代簽')
  })

  it('連 all 都沒有：fail-safe 文案', async () => {
    vi.mocked(getApprovalPolicies).mockResolvedValue({ data: [] } as never)
    const w = mount(ApprovalChainEditor, {
      props: { submitterRole: 'supervisor', definition, accountCounts: null },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('僅超級管理員可核准')
  })

  // ── 角色設定頁稽核 2026-07-31：關卡鏈草稿的未儲存保護 ──

  it('isChainDirty：草稿與已儲存的鏈一致為 false，改順序／加關卡後為 true', async () => {
    const { vm } = await mountEditor()
    expect(vm.isChainDirty).toBe(false)
    // 順序有意義（逐級簽核），故重排也算變更
    vm.chainDraft.reverse()
    await flushPromises()
    expect(vm.isChainDirty).toBe(true)
  })

  it('切換簽呈類型會重建草稿：dirty 時先問過，選「留在此頁」則不切', async () => {
    const { vm } = await mountEditor()
    vm.stageToAdd = 'admin'
    vm.addStage()
    await flushPromises()
    expect(vm.isChainDirty).toBe(true)

    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await vm.switchDocType('leave')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(vm.activeDocType).toBe('all') // 未切走，草稿保住
    confirmSpy.mockRestore()
  })

  it('切換簽呈類型：選「捨棄變更」才真的切過去', async () => {
    const { vm } = await mountEditor()
    vm.stageToAdd = 'admin'
    vm.addStage()
    await flushPromises()

    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.switchDocType('leave')
    await flushPromises()
    expect(vm.activeDocType).toBe('leave')
    confirmSpy.mockRestore()
  })

  it('未變更時切換簽呈類型不彈確認', async () => {
    const { vm } = await mountEditor()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
    await vm.switchDocType('leave')
    await flushPromises()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(vm.activeDocType).toBe('leave')
    confirmSpy.mockRestore()
  })
})
