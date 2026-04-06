import { useReducer } from 'react'

export const MIC_MODE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  FINALIZING: 'finalizing',
  THINKING: 'thinking',
  NO_SPEECH: 'no-speech',
  TIMED_OUT: 'timed-out',
  ERROR: 'error',
}

const initialState = {
  active: false,
  busy: false,
  micMode: MIC_MODE.IDLE,
  voiceError: '',
  interimText: '',
  confirmedText: '',
  replyPending: false,
}

function voiceSessionReducer(state, action) {
  switch (action.type) {
    case 'REQUEST_START':
      return {
        ...state,
        active: true,
        micMode: MIC_MODE.CONNECTING,
        voiceError: '',
      }
    case 'REQUEST_STOP':
      return {
        ...state,
        active: false,
        micMode:
          state.micMode === MIC_MODE.CONNECTING || state.micMode === MIC_MODE.LISTENING
            ? MIC_MODE.FINALIZING
            : state.micMode,
      }
    case 'BUSY_CHANGED':
      return {
        ...state,
        busy: action.busy,
      }
    case 'VOICE_STATE_CHANGED':
      return {
        ...state,
        micMode: action.micMode,
        voiceError: shouldClearVoiceError(action.micMode) ? '' : state.voiceError,
      }
    case 'PARTIAL_RECEIVED':
      return {
        ...state,
        confirmedText: action.confirmed,
        interimText: action.interim,
      }
    case 'INTERIM_CHANGED':
      return {
        ...state,
        interimText: action.text,
      }
    case 'CONFIRMED_CHANGED':
      return {
        ...state,
        confirmedText: action.text,
        interimText: '',
      }
    case 'FINAL_RECEIVED':
      return {
        ...state,
        active: false,
        replyPending: true,
        micMode: MIC_MODE.THINKING,
        voiceError: '',
        interimText: '',
        confirmedText: action.text,
      }
    case 'REPLY_STARTED':
      return {
        ...state,
        active: false,
        replyPending: true,
        micMode: MIC_MODE.THINKING,
        voiceError: '',
        interimText: '',
        confirmedText: '',
      }
    case 'REPLY_STOPPED':
      return {
        ...state,
        active: false,
        replyPending: false,
        micMode: MIC_MODE.IDLE,
        interimText: '',
      }
    case 'REPLY_FINISHED':
      return {
        ...state,
        replyPending: false,
        micMode: MIC_MODE.IDLE,
      }
    case 'VOICE_ERROR':
      return {
        ...state,
        active: false,
        replyPending: false,
        micMode: action.micMode,
        voiceError: action.message,
        interimText: '',
      }
    case 'MODE_RESET':
      return {
        ...state,
        micMode: MIC_MODE.IDLE,
      }
    case 'DISMISS_ERROR':
      return {
        ...state,
        voiceError: '',
      }
    case 'RESET_STATUS':
      return {
        ...state,
        active: false,
        busy: false,
        replyPending: false,
        micMode: MIC_MODE.IDLE,
        voiceError: '',
        interimText: '',
      }
    case 'RESET_ALL':
      return {
        ...initialState,
      }
    default:
      return state
  }
}

function shouldClearVoiceError(micMode) {
  return [
    MIC_MODE.IDLE,
    MIC_MODE.CONNECTING,
    MIC_MODE.LISTENING,
    MIC_MODE.FINALIZING,
    MIC_MODE.THINKING,
  ].includes(micMode)
}

function mapVoiceErrorKindToMode(kind) {
  if (kind === MIC_MODE.NO_SPEECH) return MIC_MODE.NO_SPEECH
  if (kind === 'timeout' || kind === MIC_MODE.TIMED_OUT) return MIC_MODE.TIMED_OUT
  return MIC_MODE.ERROR
}

export function useVoiceSession() {
  const [state, dispatch] = useReducer(voiceSessionReducer, initialState)

  return {
    ...state,
    requestStart() {
      dispatch({ type: 'REQUEST_START' })
    },
    requestStop() {
      dispatch({ type: 'REQUEST_STOP' })
    },
    setBusy(busy) {
      dispatch({ type: 'BUSY_CHANGED', busy })
    },
    setVoiceState(micMode) {
      dispatch({ type: 'VOICE_STATE_CHANGED', micMode })
    },
    setPartial(confirmed, interim) {
      dispatch({ type: 'PARTIAL_RECEIVED', confirmed, interim })
    },
    setInterimText(text) {
      dispatch({ type: 'INTERIM_CHANGED', text })
    },
    setConfirmedText(text) {
      dispatch({ type: 'CONFIRMED_CHANGED', text })
    },
    receiveFinalTranscript(text) {
      dispatch({ type: 'FINAL_RECEIVED', text })
    },
    beginReply() {
      dispatch({ type: 'REPLY_STARTED' })
    },
    stopReply() {
      dispatch({ type: 'REPLY_STOPPED' })
    },
    finishReply() {
      dispatch({ type: 'REPLY_FINISHED' })
    },
    setVoiceError(kind, message) {
      dispatch({
        type: 'VOICE_ERROR',
        micMode: mapVoiceErrorKindToMode(kind),
        message,
      })
    },
    resetMode() {
      dispatch({ type: 'MODE_RESET' })
    },
    dismissError() {
      dispatch({ type: 'DISMISS_ERROR' })
    },
    resetStatus() {
      dispatch({ type: 'RESET_STATUS' })
    },
    resetAll() {
      dispatch({ type: 'RESET_ALL' })
    },
  }
}
