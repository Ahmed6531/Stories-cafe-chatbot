import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('renders post-add suggestion chips only when cart_updated is true and clicking one quick-adds the item', async () => {
    axios.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-voice-test',
          status: 'ok',
          reply: 'Added 1x Latte (Small, Skim Milk) to your cart.',
          intent: 'add_items',
          cart_updated: true,
          cart_id: 'cart-with-latte',
          suggestions: [
            {
              type: 'upsell',
              item_name: 'Cheese Croissant',
              menu_item_id: 202,
              upsell_source: 'combo',
              fun_fact: 'The creamy body of a latte balances the flaky, salty richness of a cheese croissant.',
            },
          ],
          metadata: {},
        },
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-voice-test',
          status: 'ok',
          reply: 'Added a Cheese Croissant to your cart.',
          intent: 'add_items',
          cart_updated: true,
          cart_id: 'cart-with-latte-and-croissant',
          suggestions: [],
          metadata: {},
        },
      })

    renderChatWidget()

    await act(async () => {
      voiceInputMock.onEvent({ type: 'final', text: 'add one latte' })
      vi.advanceTimersByTime(151)
      await flushPromises()
    })

    expect(screen.getByText('Cheese Croissant')).toBeInTheDocument()
    expect(screen.getByText(/flaky, salty richness of a cheese croissant/i)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cheese Croissant/i }))
      await flushPromises()
    })

    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/chat/message',
      {
        session_id: 'session-voice-test',
        message: 'add a Cheese Croissant',
        cart_id: 'cart-with-latte',
      },
      { withCredentials: true },
    )
  })

  it('does not render post-add suggestion chips when cart_updated is false', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-voice-test',
        status: 'ok',
        reply: 'Removed the latte from your cart.',
        intent: 'remove_item',
        cart_updated: false,
        cart_id: 'cart-existing',
        suggestions: [
          {
            type: 'upsell',
            item_name: 'Cheese Croissant',
            menu_item_id: 202,
            fun_fact: 'Should stay hidden because cart_updated is false.',
          },
        ],
        metadata: {},
      },
    })

    renderChatWidget()

    await act(async () => {
      voiceInputMock.onEvent({ type: 'final', text: 'remove the latte' })
      vi.advanceTimersByTime(151)
      await flushPromises()
    })

    expect(screen.queryByText('Cheese Croissant')).not.toBeInTheDocument()
    expect(screen.queryByText(/should stay hidden/i)).not.toBeInTheDocument()
  })

  it('renders size upgrade prompt from metadata and sends update command', async () => {
    axios.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-voice-test',
          status: 'ok',
          reply: 'Added 1x Latte (Small) to your cart.',
          intent: 'add_items',
          cart_updated: true,
          cart_id: 'cart-with-latte',
          suggestions: [],
          metadata: {
            size_upgrade: {
              type: 'size_upgrade',
              item_name: 'Latte',
              current_size: 'Small',
              upgrade_size: 'Medium',
              price_delta: 50000,
              message: 'Medium is only L.L 50,000 more. Most people go for it.',
              menu_item_id: 101,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-voice-test',
          status: 'ok',
          reply: 'Updated Latte (Medium).',
          intent: 'update_item',
          cart_updated: true,
          cart_id: 'cart-with-medium-latte',
          suggestions: [],
          metadata: {},
        },
      })

    renderChatWidget()

    await act(async () => {
      voiceInputMock.onEvent({ type: 'final', text: 'add one small latte' })
      vi.advanceTimersByTime(151)
      await flushPromises()
    })

    expect(screen.getByText(/Medium is only L\.L 50,000 more/i)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Upgrade to Medium/i }))
      await flushPromises()
    })

    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/chat/message',
      {
        session_id: 'session-voice-test',
        message: 'update my Latte to Medium',
        cart_id: 'cart-with-latte',
      },
      { withCredentials: true },
    )
  })

  it('does not render suggestion chips for category listing replies', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-voice-test',
        status: 'ok',
        reply: 'Here are our pastries.',
        intent: 'list_category_items',
        cart_updated: false,
        cart_id: 'cart-existing',
        suggestions: [
          {
            item_name: 'Chocolate Croissant',
          },
        ],
        metadata: {
          pipeline_stage: 'list_category_items_done',
        },
      },
    })

    renderChatWidget()

    await act(async () => {
      voiceInputMock.onEvent({ type: 'final', text: 'what pastries do you have' })
      vi.advanceTimersByTime(151)
      await flushPromises()
    })

    expect(screen.getByText('Here are our pastries.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chocolate Croissant' })).not.toBeInTheDocument()
  })
})
