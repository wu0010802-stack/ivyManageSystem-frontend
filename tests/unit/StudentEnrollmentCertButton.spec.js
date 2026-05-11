import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentEnrollmentCertButton from '@/components/student/StudentEnrollmentCertButton.vue'

vi.mock('@/api/govMoe', () => ({
  generateCertificate: vi.fn().mockResolvedValue({
    data: { serial: 'EC-2026-0001', pdf_base64: btoa('%PDF-1.4\n%%EOF') },
  }),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

describe('StudentEnrollmentCertButton', () => {
  it('renders trigger button when user has permission', () => {
    const w = mount(StudentEnrollmentCertButton, { props: { studentId: 7 } })
    expect(w.text()).toContain('開立在學證明')
  })
})
