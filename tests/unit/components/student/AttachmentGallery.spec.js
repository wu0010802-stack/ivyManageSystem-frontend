import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ElementPlus from 'element-plus'
import AttachmentGallery from '@/components/student/AttachmentGallery.vue'

describe('AttachmentGallery', () => {
  it('renders thumbnails for each item', () => {
    const w = mount(AttachmentGallery, {
      props: {
        items: [
          { id: 1, thumb_url: '/x/1.jpg', display_url: '/x/1d.jpg', url: '/x/1.jpg', created_at: '2026-05-15T00:00:00' },
          { id: 2, thumb_url: '/x/2.jpg', display_url: '/x/2d.jpg', url: '/x/2.jpg', created_at: '2026-05-14T00:00:00' },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    expect(w.findAll('.thumb')).toHaveLength(2)
  })

  it('opens preview when thumb clicked', async () => {
    const w = mount(AttachmentGallery, {
      props: {
        items: [
          { id: 1, thumb_url: '/x/1.jpg', display_url: '/x/1d.jpg', url: '/x/1.jpg', created_at: '2026-05-15' },
        ],
      },
      global: { plugins: [ElementPlus] },
    })
    await w.find('.thumb-open').trigger('click')
    // previewVisible is exposed via defineExpose
    expect(w.vm.previewVisible).toBe(true)
  })

  it('deletable=false（預設）不顯示刪除鈕', () => {
    const w = mount(AttachmentGallery, {
      props: { items: [{ id: 1, url: '/x/1.jpg' }] },
      global: { plugins: [ElementPlus] },
    })
    expect(w.find('.thumb-delete').exists()).toBe(false)
  })

  it('deletable 時點刪除鈕 emit delete，且不開啟預覽', async () => {
    const item = { id: 7, url: '/x/7.jpg', owner_type: 'observation' }
    const w = mount(AttachmentGallery, {
      props: { items: [item], deletable: true },
      global: { plugins: [ElementPlus] },
    })
    await w.find('.thumb-delete').trigger('click')
    expect(w.emitted('delete')).toEqual([[item]])
    expect(w.vm.previewVisible).toBe(false)
  })
})
