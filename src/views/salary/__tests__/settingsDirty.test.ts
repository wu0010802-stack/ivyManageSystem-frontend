import { describe, it, expect } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { provideSettingsDirty, useSettingsDirty } from '../settingsDirty'

// 薪資設定各分頁以 v-if 掛載，切走就卸載、改到一半的值會消失；各面板把自己的
// dirty 狀態登記到殼層，殼層在切頁籤／離開路由前一次問完。
describe('settingsDirty 登記表', () => {
  it('收集已掛載面板中有未儲存變更者的名稱；卸載後自動移除', async () => {
    const aDirty = ref(false)
    const showB = ref(true)
    let dirtyLabels: () => string[] = () => []
    const PanelA = defineComponent({ setup() { useSettingsDirty('獎金設定', () => aDirty.value); return () => h('div') } })
    const PanelB = defineComponent({ setup() { useSettingsDirty('系統設定', () => true); return () => h('div') } })
    const Shell = defineComponent({
      setup() {
        dirtyLabels = provideSettingsDirty().dirtyLabels
        return () => h('div', [h(PanelA), showB.value ? h(PanelB) : null])
      },
    })
    mount(Shell)
    expect(dirtyLabels()).toEqual(['系統設定'])
    aDirty.value = true
    expect(dirtyLabels()).toEqual(['獎金設定', '系統設定'])
    showB.value = false
    await nextTick()
    expect(dirtyLabels()).toEqual(['獎金設定'])
  })

  it('沒有殼層 provide 時（面板單獨掛載）不報錯', () => {
    const Lone = defineComponent({ setup() { useSettingsDirty('x', () => true); return () => h('div') } })
    expect(() => mount(Lone)).not.toThrow()
  })
})
