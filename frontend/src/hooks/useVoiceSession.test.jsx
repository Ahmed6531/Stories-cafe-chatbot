import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { MIC_MODE, useVoiceSession } from './useVoiceSession'

function HookHarness({ onRender }) {
  const voice = useVoiceSession()
  onRender(voice)
  return null
}

function renderVoiceSession() {
  let current
  render(<HookHarness onRender={(voice) => { current = voice }} />)
  return {
    get voice() {
      return current
    },
  }
}

describe('useVoiceSession state machine', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('moves through connecting, listening, finalizing, thinking, and idle', () => {
    const harness = renderVoiceSession()

    expect(harness.voice.micMode).toBe(MIC_MODE.IDLE)
    expect(harness.voice.active).toBe(false)

    act(() => {
      harness.voice.requestStart()
    })
    expect(harness.voice.active).toBe(true)
    expect(harness.voice.micMode).toBe(MIC_MODE.CONNECTING)

    act(() => {
      harness.voice.setVoiceState(MIC_MODE.LISTENING)
    })
    expect(harness.voice.micMode).toBe(MIC_MODE.LISTENING)

    act(() => {
      harness.voice.requestStop()
    })
    expect(harness.voice.active).toBe(false)
    expect(harness.voice.micMode).toBe(MIC_MODE.FINALIZING)

    act(() => {
      harness.voice.receiveFinalTranscript('add one latte')
    })
    expect(harness.voice.replyPending).toBe(true)
    expect(harness.voice.micMode).toBe(MIC_MODE.THINKING)
    expect(harness.voice.confirmedText).toBe('add one latte')

    act(() => {
      harness.voice.finishReply()
    })
    expect(harness.voice.replyPending).toBe(false)
    expect(harness.voice.micMode).toBe(MIC_MODE.IDLE)
  })

  it('maps no_speech and timeout errors to stable mic modes', () => {
    const harness = renderVoiceSession()

    act(() => {
      harness.voice.setVoiceError('no_speech', 'No speech detected.')
    })
    expect(harness.voice.active).toBe(false)
    expect(harness.voice.replyPending).toBe(false)
    expect(harness.voice.micMode).toBe(MIC_MODE.NO_SPEECH)
    expect(harness.voice.voiceError).toBe('No speech detected.')

    act(() => {
      harness.voice.setVoiceError('timeout', 'Voice input timed out.')
    })
    expect(harness.voice.micMode).toBe(MIC_MODE.TIMED_OUT)
    expect(harness.voice.voiceError).toBe('Voice input timed out.')
  })
})
