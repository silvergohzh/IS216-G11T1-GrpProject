/* ProofUpload.spec.js  Owner: M6 (Myat)
 Component tests for ProofUpload.vue (the photo proof box: the hawker's "Mark ready" photo
 and the diner's "Collected" photo).
 The component receives buttonText, label and busy via props and:
   1. Shows the label and the button text from its props
   2. Keeps the button disabled until a photo is picked
   3. Shrinks the picked photo, shows a preview, and sends it with the "send" event
   4. Keeps the button disabled while busy (so nobody presses it twice)
   5. Shows an error if the photo can't be read
 shrinkPhoto is replaced with a fake, so the test doesn't need a real image or a canvas.
*/
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ProofUpload from '../ProofUpload.vue'
import { shrinkPhoto } from '../../services/places'

// Fake shrinkPhoto: returns a tiny pretend photo instead of really resizing an image
vi.mock('../../services/places', () => ({ shrinkPhoto: vi.fn() }))
const FAKE_PHOTO = 'data:image/jpeg;base64,AAAA'

// Pretend the user picked a file in the file box
async function pickFile(wrapper, file = new File(['x'], 'food.jpg', { type: 'image/jpeg' })) {
  const input = wrapper.find('[data-testid="proof-input"]')
  Object.defineProperty(input.element, 'files', { value: [file] })
  await input.trigger('change')
  await flushPromises() // wait for shrinkPhoto to finish
  return file
}

describe('ProofUpload', () => {
  beforeEach(() => {
    shrinkPhoto.mockReset()
    shrinkPhoto.mockResolvedValue(FAKE_PHOTO)
  })

  // Verify the label and button text come from the props (and the label has a default)
  it('shows the label and button text from its props', () => {
    const wrapper = mount(ProofUpload, { props: { buttonText: 'Mark ready' } })
    expect(wrapper.find('label').text()).toBe('Photo proof')
    expect(wrapper.find('button').text()).toBe('Mark ready')

    const other = mount(ProofUpload, { props: { buttonText: 'Collected', label: 'Photo of your food' } })
    expect(other.find('label').text()).toBe('Photo of your food')
    expect(other.find('button').text()).toBe('Collected')
  })

  // Verify nothing can be sent before a photo is picked
  it('disables the button until a photo is picked', () => {
    const wrapper = mount(ProofUpload, { props: { buttonText: 'Mark ready' } })

    expect(wrapper.find('button').element.disabled).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  // Verify a picked photo is shrunk, previewed, and sent with the "send" event
  it('shrinks the photo, shows a preview and sends it', async () => {
    const wrapper = mount(ProofUpload, { props: { buttonText: 'Mark ready' } })
    const file = await pickFile(wrapper)

    expect(shrinkPhoto).toHaveBeenCalledWith(file, 800)
    expect(wrapper.find('img').attributes('src')).toBe(FAKE_PHOTO)
    expect(wrapper.find('button').element.disabled).toBe(false)

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('send')).toEqual([[FAKE_PHOTO]])
  })

  // Verify the button stays disabled while the parent is busy, even with a photo
  it('disables the button while busy', async () => {
    const wrapper = mount(ProofUpload, { props: { buttonText: 'Mark ready', busy: true } })
    await pickFile(wrapper)

    expect(wrapper.find('button').element.disabled).toBe(true)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('send')).toBeUndefined()
  })

  // Verify a photo that can't be read shows the error, and still can't be sent
  it('shows an error when the photo cannot be read', async () => {
    shrinkPhoto.mockRejectedValue(new Error('That file is not a photo'))
    const wrapper = mount(ProofUpload, { props: { buttonText: 'Mark ready' } })
    await pickFile(wrapper)

    expect(wrapper.find('.error').text()).toBe('That file is not a photo')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('button').element.disabled).toBe(true)
  })
})
