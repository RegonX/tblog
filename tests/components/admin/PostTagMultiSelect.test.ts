import { mount } from '@vue/test-utils'
import PostTagMultiSelect from '../../../components/admin/PostTagMultiSelect.vue'

const tags = [
  { id: 'tag-1', name: 'Nuxt' },
  { id: 'tag-2', name: 'Cloudflare' }
]

describe('PostTagMultiSelect', () => {
  it('shows selected tags in the closed control and emits updated selections', async () => {
    const wrapper = mount(PostTagMultiSelect, {
      props: {
        modelValue: ['tag-1'],
        tags,
        emptyLabel: 'None'
      }
    })

    expect(wrapper.get('[data-test="metadata-tag-select"]').text()).toContain('Nuxt')

    await wrapper.get('[data-test="metadata-tag-tag-2"]').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[['tag-1', 'tag-2']]])
  })
})
