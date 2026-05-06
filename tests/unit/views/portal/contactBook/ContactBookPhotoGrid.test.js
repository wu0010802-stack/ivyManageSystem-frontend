import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookPhotoGrid from '@/views/portal/components/contactBook/ContactBookPhotoGrid.vue'

const PHOTOS = [
  { id: 1, url: 'https://example.com/p1.jpg' },
  { id: 2, url: 'https://example.com/p2.jpg' },
]

const STUBS = {
  LazyImage: { template: '<img :src="src" />', props: ['src', 'alt'] },
  ElIcon: { template: '<i><slot /></i>' },
}

describe('ContactBookPhotoGrid', () => {
  it('renders one cell per photo', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: PHOTOS },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.photo-cell').length).toBe(2)
  })

  it('renders upload cell', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [] },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="upload-cell"]').exists()).toBe(true)
  })

  it('renders LazyImage with photo url', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: PHOTOS },
      global: { stubs: STUBS },
    })
    const imgs = w.findAll('img')
    expect(imgs[0].attributes('src')).toBe('https://example.com/p1.jpg')
  })

  it('emits delete with photo id on delete button click', async () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: PHOTOS },
      global: { stubs: STUBS },
    })
    await w.findAll('[data-test="delete-btn"]')[0].trigger('click')
    expect(w.emitted('delete')[0]).toEqual([1])
  })

  it('emits upload on file selection', async () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [] },
      global: { stubs: STUBS },
    })
    const input = w.find('input[type="file"]')
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(w.emitted('upload')[0][0]).toBe(file)
  })

  it('shows uploading text when uploading=true', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [], uploading: true },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('上傳中')
    expect(w.find('[data-test="upload-cell"]').classes()).toContain('is-uploading')
  })

  it('handles empty photos array', () => {
    const w = mount(ContactBookPhotoGrid, {
      props: { photos: [] },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.photo-cell').length).toBe(0)
    expect(w.find('[data-test="upload-cell"]').exists()).toBe(true)
  })
})
