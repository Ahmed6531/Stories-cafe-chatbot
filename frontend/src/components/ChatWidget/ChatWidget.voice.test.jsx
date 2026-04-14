import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import axios from 'axios'
import ChatWidget from './ChatWidget'

const voiceInputMock = vi.hoisted(() => ({
  onEvent: null,
}))

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    isCancel: vi.fn(() => false),
  },
}))

vi.mock('../VoiceInput', () => ({
  default: (props) => {
    voiceInputMock.onEvent = props.onEvent
    return null
  },
}))

vi.mock('../../state/useCart', () => ({
  useCart: () => ({
    state: { items: [] },
    cartCount: 1,
  }),
}))

function renderChatWidget(props = {}) {
  return render(
    <ChatWidget
      chatClosing={false}
      chatRouteClosing={false}
      isChatAllowedRoute
      onCloseComplete={vi.fn()}
      onClose={vi.fn()}
      onVoiceSessionBusyChange={vi.fn()}
      onConfirm={vi.fn()}
      isOnline
      refreshCart={vi.fn()}
      isSuccessRoute={false}
      {...props}
    />,
  )
}

function makeStorage() {
  const store = new Map()
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value))
    }),
    removeItem: vi.fn((key) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ChatWidget voice routing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    voiceInputMock.onEvent = null
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeStorage(),
      configurable: true,
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: makeStorage(),
      configurable: true,
    })
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: vi.fn(() => 'session-voice-test') },
      configurable: true,
    })
    globalThis.localStorage.setItem('cartId', 'cart-existing')
    axios.post.mockResolvedValue({
      data: {
        session_id: 'session-voice-test',
        status: 'ok',
        reply: 'Added 1 latte.',
        intent: 'add_items',
        cart_updated: true,
        cart_id: 'cart-updated',
        suggestions: [],
        metadata: {},
      },
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    globalThis.localStorage.clear()
    globalThis.sessionStorage.clear()
  })

  it('sends a final voice transcript through the chatbot message endpoint', async () => {
    const refreshCart = vi.fn()
    renderChatWidget({ refreshCart })

    await act(async () => {
      voiceInputMock.onEvent({ type: 'final', text: 'add one latte' })
      vi.advanceTimersByTime(151)
      await flushPromises()
    })

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8000/chat/message',
      {
        session_id: 'session-voice-test',
        message: 'add one latte',
        cart_id: 'cart-existing',
      },
      { withCredentials: true },
    )
    expect(refreshCart).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('cartId')).toBe('cart-updated')
  })

  it('does not call the chatbot when voice returns no_speech', () => {
    renderChatWidget()

    act(() => {
      voiceInputMock.onEvent({
        type: 'error',
        kind: 'no_speech',
        message: 'No speech detected.',
      })
      vi.advanceTimersByTime(1500)
    })

    expect(axios.post).not.toHaveBeenCalled()
  })
})
