import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Portal from '@mui/material/Portal'
import VoiceInput from '../VoiceInput'
import { MIC_MODE, useVoiceSession } from '../../hooks/useVoiceSession'
import { normalizeTranscriptForRouting, normalizeTranscriptForUi } from '../../utils/voiceTranscript'
import { CHAT_STORAGE_KEY, CHAT_STORAGE_TS_KEY, getOrCreateChatSessionId, resetChatClientState } from '../../utils/chatSession'
import { useCart } from '../../state/useCart'

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8000'
const CHAT_TTL_MS = 24 * 60 * 60 * 1000
const PARTIAL_TRANSCRIPT_DEBOUNCE_MS = 120
const CHAT_PANEL_WIDTH = 420

// Collapse internal-only states into their user-facing equivalents:
// connecting → listening (mic setup is a detail the user doesn't need to see)
// finalizing → thinking (transcription finishing is indistinguishable from bot processing)
function getDisplayMode(mode) {
  if (mode === MIC_MODE.CONNECTING) return MIC_MODE.LISTENING
  if (mode === MIC_MODE.FINALIZING) return MIC_MODE.THINKING
  return mode
}

function getMicLabel(mode) {
  const display = getDisplayMode(mode)
  if (display === MIC_MODE.LISTENING) return 'Listening'
  if (display === MIC_MODE.THINKING) return 'Thinking...'
  if (display === MIC_MODE.NO_SPEECH) return 'No speech detected'
  if (display === MIC_MODE.TIMED_OUT) return 'Timed out'
  if (display === MIC_MODE.ERROR) return 'Voice error'
  return 'tap to speak'
}

function getMicAriaLabel(mode) {
  const display = getDisplayMode(mode)
  if (display === MIC_MODE.LISTENING) return 'Listening, tap to stop'
  if (display === MIC_MODE.THINKING) return 'Processing your message'
  if (display === MIC_MODE.NO_SPEECH) return 'No speech detected, tap to try again'
  if (display === MIC_MODE.TIMED_OUT) return 'Voice input timed out, tap to try again'
  if (display === MIC_MODE.ERROR) return 'Voice input error, tap to try again'
  return 'Tap to speak'
}

function joinTranscript(a, b) {
  if (!a) return b
  if (!b) return a
  return /^[.,!?:;]/.test(b) ? a + b : a + ' ' + b
}

const formatLL = (amount) => 'LBP ' + Number(amount).toLocaleString('en-US')

function BillSummaryCard({ bill, stale = false, onConfirm }) {
  return (
    <div style={{
      width: '100%',
      maxWidth: '310px',
      background: '#fff',
      border: '0.5px solid #e5e7eb',
      borderRadius: '12px',
      overflow: 'hidden',
      marginTop: '8px',
    }}>
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '0.5px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <div style={{
          width: 28, height: 28,
          background: '#e1f5ee',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#0f6e56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>Your order</div>
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 1 }}>
            {bill.item_count} {bill.item_count === 1 ? 'item' : 'items'}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 14px' }}>
        {bill.items.map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '5px 0',
            fontSize: 13,
            borderBottom: i < bill.items.length - 1 ? '0.5px solid #e5e7eb' : 'none',
          }}>
            <span style={{ color: '#111' }}>
              {item.item_name}
              <span style={{ fontSize: 11.5, color: '#9ca3af', marginLeft: 4 }}>×{item.quantity}</span>
            </span>
            <span style={{ color: '#111', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatLL(item.line_total)}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        padding: '8px 14px 12px',
        borderTop: '0.5px solid #e5e7eb',
        background: '#f9fafb',
      }}>
        {[
          ['Subtotal', formatLL(bill.subtotal)],
          [`Tax (${Math.round(bill.tax_rate * 100)}%)`, formatLL(bill.tax_amount)],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 12.5, color: '#6b7280', padding: '3px 0',
          }}>
            <span>{label}</span><span>{value}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 500, color: '#111',
          paddingTop: 7, marginTop: 4,
          borderTop: '0.5px solid #e5e7eb',
        }}>
          <span>Total</span>
          <span>{formatLL(bill.total)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={stale ? undefined : onConfirm}
        disabled={stale}
        style={{
          display: 'block',
          width: 'calc(100% - 28px)',
          margin: '0 14px 12px',
          padding: '9px 0',
          background: stale ? '#9ca3af' : '#1e5631',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: stale ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {stale ? 'Looks like something changed' : 'Go to checkout'}
      </button>
    </div>
  )
}

function CartSummaryCard({ cart }) {
  const items = Array.isArray(cart) ? cart : []
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item?.qty ?? item?.quantity ?? 1)
    const price = Number(item?.price ?? item?.basePrice ?? 0)
    return sum + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0)
  }, 0)

  return (
    <div className="chat-summary-card">
      <div className="chat-summary-card-head">
        <div className="chat-summary-card-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 002 1.58h9.78a2 2 0 001.95-1.57l1.65-7.43H5.12" />
          </svg>
        </div>
        <div>
          <div className="chat-summary-title">Your cart</div>
          <div className="chat-summary-subtitle">
            {items.length} {items.length === 1 ? 'line' : 'lines'}
          </div>
        </div>
      </div>

      <div className="chat-summary-items">
        {items.map((item, i) => {
          const qty = Number(item?.qty ?? item?.quantity ?? 1)
          const name = item?.name || item?.item_name || 'Item'
          const price = Number(item?.price ?? item?.basePrice ?? 0)
          const lineTotal = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0
          return (
            <div className="chat-summary-row" key={`${name}-${i}`}>
              <span className="chat-summary-item-name">
                {name}
                <span className="chat-summary-qty">x{Number.isFinite(qty) ? qty : 1}</span>
              </span>
              {lineTotal > 0 && (
                <span className="chat-summary-price">{formatLL(lineTotal)}</span>
              )}
            </div>
          )
        })}
      </div>

      {subtotal > 0 && (
        <div className="chat-summary-total">
          <span>Subtotal</span>
          <span>{formatLL(subtotal)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Bot message parser / renderer ───────────────────────────────────────────

const _listLineRx = /^-\s+(.+?)\s{1,2}\(L\.L\s+([\d,]+)\)\s*$/
const _legacyGroupLineRx = /^-\s+(.+?)(?:\s+\(currently:\s*(.+?)\))?:\s+(.+)$/
const _groupHeaderRx = /^(.+?)(?:\s+\(currently:\s*(.+?)\)):\s*$/
const CHAT_BUBBLE_FONT_SIZE = 13
const CHAT_OPTION_FONT_SIZE = 12

function _shortenPrice(llStr) {
  const num = parseInt((llStr || '').replace(/,/g, ''), 10)
  return Number.isFinite(num) ? `+${Math.round(num / 1000)}k` : ''
}

function _parseOptions(raw) {
  return raw.split(/,\s+/).map(opt => {
    const m = opt.trim().match(/^(.+?)\s*(?:\(\+L\.L\s*([\d,]+)\))?$/)
    return m ? { label: m[1].trim(), price: m[2] || null } : { label: opt.trim(), price: null }
  }).filter(o => o.label)
}

function _isCustomizationControlLine(line) {
  return /^Got it!/i.test(line)
    || /Would you like to add anything else/i.test(line)
    || /Say ['']done['']/.test(line)
}

function _parseCustomizationGroups(lines) {
  const groups = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue

    const legacy = line.match(_legacyGroupLineRx)
    if (legacy) {
      groups.push({ name: legacy[1], current: legacy[2] || null, options: _parseOptions(legacy[3]) })
      continue
    }

    const header = line.match(_groupHeaderRx)
    if (!header || _isCustomizationControlLine(line)) continue

    const optionLineIndex = lines.findIndex((candidate, index) => index > i && candidate.trim())
    if (optionLineIndex === -1) continue

    const optionLine = lines[optionLineIndex].trim()
    if (_isCustomizationControlLine(optionLine) || _groupHeaderRx.test(optionLine) || _legacyGroupLineRx.test(optionLine)) continue

    groups.push({ name: header[1], current: header[2] || null, options: _parseOptions(optionLine) })
    i = optionLineIndex
  }
  return groups
}

function parseBotMessage(text) {
  if (!text || typeof text !== 'string') return { type: 'plain', text: text || '' }

  const lines3 = text.split('\n')
  const groups = _parseCustomizationGroups(lines3)
  if (groups.length > 0 && (/^Got it!/i.test(text) || groups.length >= 2)) {
    const nonGroup = []
    for (let i = 0; i < lines3.length; i += 1) {
      const line = lines3[i].trim()
      if (!line) continue
      if (_legacyGroupLineRx.test(line)) continue
      const header = line.match(_groupHeaderRx)
      if (header && !_isCustomizationControlLine(line)) {
        const optionLineIndex = lines3.findIndex((candidate, index) => index > i && candidate.trim())
        if (optionLineIndex !== -1) i = optionLineIndex
        continue
      }
      nonGroup.push(line)
    }
    const summaryLine = nonGroup[0] || ''
    const subtext = nonGroup.find(l => /Would you like to add anything else/i.test(l)) || ''
    const hint = nonGroup.find(l => /Say ['']done['']/.test(l)) || ''
    return { type: 'customization_review', summaryLine, subtext, groups, hint }
  }

  // Pattern 4: split — \n\n between at least one structured block and anything else
  const paragraphs = text.split(/\n\n+/)
  if (paragraphs.length >= 2) {
    const sub = paragraphs.map(p => parseBotMessage(p.trim()))
    if (sub.some(p => ['category_list', 'options_prompt', 'customization_review'].includes(p.type))) {
      return { type: 'split', parts: sub }
    }
  }

  // Pattern 1: category list
  if (/Here's what we have in .+:/.test(text)) {
    const lines = text.split('\n')
    const hIdx = lines.findIndex(l => /Here's what we have in .+:/.test(l))
    const items = lines.slice(hIdx + 1).reduce((acc, l) => {
      const m = l.match(_listLineRx)
      if (m) acc.push({ name: m[1], price: m[2] })
      return acc
    }, [])
    if (items.length > 0) return { type: 'category_list', header: lines[hIdx], items }
  }

  // Pattern 2: options prompt "What X? Options: A, B (+L.L X)."
  if (text.includes('Options:') && text.split('Options:').length === 2) {
    const idx = text.indexOf('Options:')
    const question = text.slice(0, idx).trim()
    const optRaw = text.slice(idx + 8).replace(/\.\s*$/, '').trim()
    const options = _parseOptions(optRaw)
    if (question && options.length > 0) return { type: 'options_prompt', question, options }
  }

  return { type: 'plain', text }
}

function renderParsedContent(parsed) {
  if (parsed.type === 'category_list') {
    return (
      <>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{parsed.header}</p>
        <div style={{ borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
          {parsed.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', background: i % 2 === 0 ? '#f9fafb' : '#fff', fontSize: 13,
            }}>
              <span style={{ color: '#111' }}>{item.name}</span>
              <span style={{ color: '#6b7280', whiteSpace: 'nowrap', marginLeft: 12 }}>L.L {item.price}</span>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (parsed.type === 'options_prompt') {
    return (
      <>
        <p style={{ margin: '0 0 10px', fontSize: CHAT_BUBBLE_FONT_SIZE, color: '#111', lineHeight: 1.45 }}>{parsed.question}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, rowGap: 8 }}>
          {parsed.options.map((opt, i) => (
            <span key={i} style={{
              background: '#f3f4f6', border: 'none', borderRadius: 6,
              padding: '5px 9px', fontSize: CHAT_OPTION_FONT_SIZE, color: '#374151',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              lineHeight: 1.35,
            }}>
              {opt.label}
              {opt.price && <span style={{ fontSize: 11, color: '#9ca3af' }}>{_shortenPrice(opt.price)}</span>}
            </span>
          ))}
        </div>
      </>
    )
  }

  if (parsed.type === 'customization_review') {
    return (
      <div className="chat-customization-review" style={{ fontSize: CHAT_BUBBLE_FONT_SIZE, gap: 12 }}>
        {parsed.summaryLine && (
          <p className="chat-customization-summary" style={{ fontSize: CHAT_BUBBLE_FONT_SIZE }}>{parsed.summaryLine}</p>
        )}
        {parsed.subtext && (
          <p className="chat-customization-subtext" style={{ fontSize: CHAT_BUBBLE_FONT_SIZE }}>{parsed.subtext}</p>
        )}
        <div className="chat-customization-groups" style={{ gap: 14 }}>
          {parsed.groups.map((group, i) => (
            <section className="chat-customization-group" key={i}>
              <div className="chat-customization-group-head" style={{ marginBottom: 7 }}>
                <span className="chat-customization-group-name" style={{ fontSize: CHAT_OPTION_FONT_SIZE }}>{group.name}</span>
                {group.current && (
                  <span className="chat-customization-current" style={{ borderRadius: 6, fontSize: CHAT_OPTION_FONT_SIZE, padding: '2px 6px' }}>
                    {group.current}
                  </span>
                )}
              </div>
              <div className="chat-customization-options" style={{ gap: 7, rowGap: 8 }}>
                {group.options.map((opt, j) => (
                  <span
                    className="chat-customization-option"
                    key={j}
                    style={{
                      background: '#f3f4f6',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: CHAT_OPTION_FONT_SIZE,
                      padding: '5px 9px',
                    }}
                  >
                    {opt.label}
                    {opt.price && <span className="chat-customization-price" style={{ fontSize: 11 }}>{_shortenPrice(opt.price)}</span>}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
        {parsed.hint && <p className="chat-customization-footer" style={{ fontSize: CHAT_OPTION_FONT_SIZE, marginTop: 2 }}>{parsed.hint}</p>}
      </div>
    )
  }

  // plain fallback
  const t = parsed.text || ''
  return t.split('\n').map((line, i, arr) => (
    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
  ))
}

// ─────────────────────────────────────────────────────────────────────────────

function Bubble({ msg, prevTime, onSuggestionClick, onConfirm }) {
  const isUser = msg.role === 'user'
  const showTime = msg.time !== prevTime
  const hasAudio = !isUser && typeof msg.audioSrc === 'string' && msg.audioSrc.trim()
  const cartSummary = !isUser && msg.pipelineStage === 'view_cart_done' && Array.isArray(msg.cart) && msg.cart.length > 0
    ? msg.cart
    : null
  const sizeUpgrade = msg.cartUpdated && msg.sizeUpgrade && typeof msg.sizeUpgrade === 'object'
    ? msg.sizeUpgrade
    : null
  const sizeUpgradeMessage = typeof sizeUpgrade?.message === 'string' ? sizeUpgrade.message.trim() : ''
  const sizeUpgradeLabel = typeof sizeUpgrade?.upgrade_size === 'string' && sizeUpgrade.upgrade_size.trim()
    ? sizeUpgrade.upgrade_size.trim()
    : ''
  const sizeUpgradeItemName = typeof sizeUpgrade?.item_name === 'string' && sizeUpgrade.item_name.trim()
    ? sizeUpgrade.item_name.trim()
    : ''
  const hasSizeUpgrade = Boolean(sizeUpgradeMessage && sizeUpgradeLabel)
  const suppressSuggestions = msg.intent === 'list_category_items'
    || msg.pipelineStage === 'list_category_items_done'
  const rawSuggestions = !suppressSuggestions && Array.isArray(msg.suggestions) ? msg.suggestions : []
  const isPostAddSuggestion = (suggestion) => {
    if (!suggestion || typeof suggestion !== 'object') return false
    const suggestionType = String(suggestion.type || '').trim().toLowerCase()
    const itemName = typeof suggestion.item_name === 'string' ? suggestion.item_name.trim() : ''
    return Boolean(
      itemName
      && suggestionType !== 'clarification_option'
      && suggestionType !== 'defaults_confirmation'
      && (
        suggestionType === 'upsell'
        || suggestionType === 'complementary'
        || suggestionType === 'recommendation'
        || suggestion.fun_fact
        || suggestion.menu_item_id != null
        || suggestion.upsell_source
      )
    )
  }
  const postAddSuggestions = msg.cartUpdated
    ? rawSuggestions.filter((suggestion) => isPostAddSuggestion(suggestion))
    : []
  const interactiveSuggestions = rawSuggestions.filter((suggestion) => !isPostAddSuggestion(suggestion))
  const hasInteractiveSuggestions = interactiveSuggestions.length > 0
  const hasPostAddSuggestions = postAddSuggestions.length > 0
  const isChecklistSuggestions = hasInteractiveSuggestions
    && interactiveSuggestions.every((s) => s?.type === 'clarification_option')
  const [selectedChecklist, setSelectedChecklist] = useState({})

  const suggestionText = (suggestion) => {
    if (typeof suggestion?.input_text === 'string' && suggestion.input_text.trim()) {
      return suggestion.input_text.trim()
    }
    if (typeof suggestion?.item_name === 'string' && suggestion.item_name.trim()) {
      return `add ${suggestion.item_name.trim()}`
    }
    return ''
  }

  const suggestionLabel = (suggestion) => {
    if (typeof suggestion?.label === 'string' && suggestion.label.trim()) {
      return suggestion.label.trim()
    }
    if (typeof suggestion?.item_name === 'string' && suggestion.item_name.trim()) {
      return suggestion.item_name.trim()
    }
    return 'Option'
  }

  const suggestionStyle = (suggestion) => {
    if (suggestion?.type === 'defaults_confirmation') {
      if (suggestion?.input_text !== 'change it') {
        return {
          base: { background: '#dcfce7', borderColor: '#86efac', color: '#15803d' },
          hover: { background: '#bbf7d0', borderColor: '#4ade80' },
        }
      }
      return {
        base: { background: '#f9fafb', borderColor: '#d1d5db', color: '#6b7280' },
        hover: { background: '#f3f4f6', borderColor: '#9ca3af' },
      }
    }
    return {
      base: { background: '#f3f4f6', borderColor: '#e5e7eb', color: '#374151' },
      hover: { background: '#e5e7eb', borderColor: '#d1d5db' },
    }
  }

  const isToppingsGroup = (groupName) => {
    const normalized = (groupName || '').toString().trim().toLowerCase()
    return normalized.includes('topping') || normalized.includes('flavor')
  }

  const getGroupMaxSelections = (groupName) => {
    const suggestions = groupedChecklistSuggestions.find(([name]) => name === groupName)?.[1] || []
    const rawMax = Number(suggestions[0]?.maxSelections)
    if (Number.isFinite(rawMax) && rawMax > 0) return rawMax
    return isToppingsGroup(groupName) ? 2 : 1
  }

  const selectChecklistOption = (groupName, value) => {
    if (!value) return
    setSelectedChecklist((prev) => {
      const maxSelections = getGroupMaxSelections(groupName)
      if (maxSelections > 1) {
        const current = Array.isArray(prev[groupName]) ? prev[groupName] : []
        const next = current.includes(value)
          ? current.filter((item) => item !== value)
          : current.length >= maxSelections
            ? [...current.slice(1), value]
            : [...current, value]
        return {
          ...prev,
          [groupName]: next,
        }
      }

      return {
        ...prev,
        [groupName]: value,
      }
    })
  }

  const groupedChecklistSuggestions = (() => {
    if (!isChecklistSuggestions) return []
    const groups = new Map()
    for (const suggestion of interactiveSuggestions) {
      const groupName = (suggestion?.group || 'Options').toString().trim() || 'Options'
      const list = groups.get(groupName) || []
      list.push(suggestion)
      groups.set(groupName, list)
    }
    return Array.from(groups.entries())
  })()

  const selectedChecklistValues = !isChecklistSuggestions
    ? []
    : Object.values(selectedChecklist).flatMap((value) => {
        if (typeof value === 'string' && value.trim()) return [value.trim()]
        if (Array.isArray(value)) {
          return value.filter((item) => typeof item === 'string' && item.trim())
        }
        return []
      })

  const applyChecklistSelections = () => {
    if (!selectedChecklistValues.length) return
    onSuggestionClick(selectedChecklistValues.join(' and '))
  }

  const playMessageAudio = () => {
    if (!hasAudio) return
    try {
      const audio = new Audio(msg.audioSrc)
      audio.play().catch(() => {})
    } catch {
      // Audio playback should never break the chat UI.
    }
  }

  const parsedBot = !isUser && !cartSummary
    ? (() => { try { return parseBotMessage(msg.text) } catch { return null } })()
    : null
  const isSplit = parsedBot?.type === 'split'

  const renderExtras = () => (
    <>
      {hasInteractiveSuggestions && isChecklistSuggestions && (
        <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#f9fafb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: 600 }}>
            Select options, then apply
          </div>
          {groupedChecklistSuggestions.map(([groupName, options]) => (
            <div key={groupName} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                {groupName}
                {getGroupMaxSelections(groupName) > 1 ? ` (choose up to ${getGroupMaxSelections(groupName)})` : ''}
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {options.map((s, idx) => {
                  const key = `${s?.group || groupName}:${s?.input_text || s?.item_name || idx}`
                  const optionValue = suggestionText(s)
                  const isMulti = getGroupMaxSelections(groupName) > 1
                  const checked = isMulti
                    ? Array.isArray(selectedChecklist[groupName]) && selectedChecklist[groupName].includes(optionValue)
                    : selectedChecklist[groupName] === optionValue
                  return (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#111827', cursor: 'pointer' }}>
                      <input
                        type={isMulti ? 'checkbox' : 'radio'}
                        name={isMulti ? undefined : `variant-group-${groupName}`}
                        checked={checked}
                        onChange={() => selectChecklistOption(groupName, optionValue)}
                        style={{ accentColor: '#1e5631', cursor: 'pointer' }}
                      />
                      <span>{suggestionLabel(s)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={applyChecklistSelections}
              disabled={!selectedChecklistValues.length}
              style={{
                padding: '7px 12px', borderRadius: '8px', border: 'none',
                background: selectedChecklistValues.length ? '#1e5631' : '#9ca3af',
                color: '#fff', fontSize: '12px', fontWeight: 600,
                cursor: selectedChecklistValues.length ? 'pointer' : 'not-allowed',
              }}
            >
              Apply selected options
            </button>
            <button
              type="button"
              onClick={() => setSelectedChecklist({})}
              style={{
                padding: '7px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
                background: '#fff', color: '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {hasInteractiveSuggestions && !isChecklistSuggestions && (
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {interactiveSuggestions.map((s, idx) => {
            const sStyle = suggestionStyle(s)
            return (
              <button
                key={idx}
                onClick={() => { const text = suggestionText(s); if (text) onSuggestionClick(text) }}
                style={{
                  padding: '6px 12px', borderRadius: '16px',
                  border: `1px solid ${sStyle.base.borderColor}`,
                  background: sStyle.base.background, color: sStyle.base.color,
                  cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = sStyle.hover.background; e.currentTarget.style.borderColor = sStyle.hover.borderColor }}
                onMouseLeave={(e) => { e.currentTarget.style.background = sStyle.base.background; e.currentTarget.style.borderColor = sStyle.base.borderColor }}
              >
                {suggestionLabel(s)}
              </button>
            )
          })}
        </div>
      )}
      {hasPostAddSuggestions && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '8px', width: '100%', maxWidth: '320px' }}>
          {postAddSuggestions.map((suggestion, idx) => {
            const itemName = suggestionLabel(suggestion)
            const funFact = typeof suggestion?.fun_fact === 'string' ? suggestion.fun_fact.trim() : ''
            return (
              <button
                key={`${suggestion?.menu_item_id ?? itemName}-${idx}`}
                type="button"
                title={funFact || undefined}
                onClick={() => onSuggestionClick(`add a ${itemName}`)}
                style={{
                  display: 'grid', gap: '4px', width: '100%', textAlign: 'left',
                  padding: '10px 12px', borderRadius: '12px', border: '1px solid #d7e6dc',
                  background: '#f4fbf6', color: '#163124', cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(17, 24, 39, 0.05)',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{itemName}</span>
                {funFact && <span style={{ fontSize: '11.5px', lineHeight: 1.4, color: '#4b6355' }}>{funFact}</span>}
              </button>
            )
          })}
        </div>
      )}
      {hasSizeUpgrade && (
        <div style={{
          marginTop: '12px', display: 'grid', gap: '8px', width: '100%', maxWidth: '320px',
          padding: '10px 12px', borderRadius: '12px', border: '1px solid #d7e6dc',
          background: '#f4fbf6', color: '#163124', boxShadow: '0 1px 2px rgba(17, 24, 39, 0.05)',
        }}>
          <span style={{ fontSize: '12.5px', lineHeight: 1.45, color: '#365544' }}>{sizeUpgradeMessage}</span>
          <button
            type="button"
            onClick={() => onSuggestionClick(sizeUpgradeItemName ? `update my ${sizeUpgradeItemName} to ${sizeUpgradeLabel}` : `change that to ${sizeUpgradeLabel}`)}
            style={{
              justifySelf: 'start', padding: '7px 10px', borderRadius: '8px',
              border: '1px solid #b8d8c3', background: '#fff', color: '#1e5631',
              cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
            }}
          >
            Upgrade to {sizeUpgradeLabel}
          </button>
        </div>
      )}
      {hasAudio && (
        <button className="msg-audio-btn" type="button" aria-label="Play message audio" onClick={playMessageAudio}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.5 8.5a5 5 0 010 7" />
            <path d="M18.5 5.5a9 9 0 010 13" />
          </svg>
        </button>
      )}
    </>
  )

  if (isSplit) {
    return (
      <div className="msg-row msg-row-bot">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {parsedBot.parts.map((part, i) => (
            <div key={i} className="msg-bubble msg-bubble-bot">
              {renderParsedContent(part)}
              {i === parsedBot.parts.length - 1 && renderExtras()}
            </div>
          ))}
        </div>
        {showTime && <span className="msg-time">{msg.time}</span>}
      </div>
    )
  }

  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`msg-bubble ${isUser ? 'msg-bubble-user' : 'msg-bubble-bot'}`}>
        {cartSummary ? (
          <span>{msg.text.split('\n')[0]}</span>
        ) : parsedBot ? (
          renderParsedContent(parsedBot)
        ) : (
          msg.text.split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))
        )}
        {renderExtras()}
      </div>
      {cartSummary && <CartSummaryCard cart={cartSummary} />}
      {msg.bill && <BillSummaryCard bill={msg.bill} stale={msg.billStale ?? false} onConfirm={onConfirm} />}
      {showTime && <span className="msg-time">{msg.time}</span>}
    </div>
  )
}

export default function ChatWidget({
  chatClosing,
  chatRouteClosing,
  isChatAllowedRoute,
  onCloseComplete,
  onClose,
  onVoiceSessionBusyChange,
  onConfirm,
  isOnline,
  refreshCart,
  isSuccessRoute,
}) {
  const initialMessages = useMemo(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY)
      if (!saved) return []
      const savedAtRaw = localStorage.getItem(CHAT_STORAGE_TS_KEY)
      const savedAt = Number(savedAtRaw)
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > CHAT_TTL_MS) {
        localStorage.removeItem(CHAT_STORAGE_KEY)
        localStorage.removeItem(CHAT_STORAGE_TS_KEY)
        return []
      }
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.error('Failed to restore chat history:', e)
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(CHAT_STORAGE_TS_KEY)
      return []
    }
  }, [])

  const [messages, setMessages] = useState(initialMessages)
  const [chipsVisible, setChipsVisible] = useState(initialMessages.length === 0)
  const voice = useVoiceSession()
  const { state: cartState, cartCount } = useCart()
  const cartItems = useMemo(() => cartState?.items ?? [], [cartState?.items])

  const msgsRef = useRef(null)
  const inputRef = useRef(null)
  const pendingReplyTimeoutRef = useRef(null)
  const partialTranscriptTimeoutRef = useRef(null)
  const pendingPartialRef = useRef({ confirmed: '', interim: '' })
  const firstPartialRenderedRef = useRef(false)
  const errorResetTimeoutRef = useRef(null)
  const audioCtxRef = useRef(null)

  const hasConversation = messages.length > 0

  const clearPartials = () => {
    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
      partialTranscriptTimeoutRef.current = null
    }
    firstPartialRenderedRef.current = false
    pendingPartialRef.current = { confirmed: '', interim: '' }
    voice.setPartial('', '')
  }

  const flushPartial = () => {
    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
      partialTranscriptTimeoutRef.current = null
    }
    const { confirmed, interim } = pendingPartialRef.current
    voice.setPartial(confirmed, interim)
  }

  const schedulePartial = (confirmed, interim) => {
    pendingPartialRef.current = { confirmed, interim }
    if (!firstPartialRenderedRef.current) {
      firstPartialRenderedRef.current = true
      flushPartial()
      return
    }
    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
    }
    partialTranscriptTimeoutRef.current = window.setTimeout(() => {
      partialTranscriptTimeoutRef.current = null
      flushPartial()
    }, PARTIAL_TRANSCRIPT_DEBOUNCE_MS)
  }

  const stopPendingReply = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    clearPartials()
    voice.stopReply()
  }

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, voice.replyPending])

  useEffect(() => () => {
    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
      partialTranscriptTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(CHAT_STORAGE_TS_KEY)
      return
    }
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        const trimmed = messages.slice(-50)
        try {
          localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed))
        } catch {
          localStorage.removeItem(CHAT_STORAGE_KEY)
        }
      }
    }
    localStorage.setItem(CHAT_STORAGE_TS_KEY, String(Date.now()))
  }, [messages])

  useEffect(() => {
    if (!isSuccessRoute) return
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    voice.resetAll()
    clearPartials()
    setMessages([])
    setChipsVisible(true)
    resetChatClientState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccessRoute])

  useEffect(() => {
    if (!isChatAllowedRoute) {
      if (pendingReplyTimeoutRef.current) {
        window.clearTimeout(pendingReplyTimeoutRef.current)
        pendingReplyTimeoutRef.current = null
      }
      voice.resetStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatAllowedRoute])

  useEffect(() => {
    onVoiceSessionBusyChange?.(voice.busy)
  }, [voice.busy, onVoiceSessionBusyChange])

  useEffect(() => {
    const errorModes = [MIC_MODE.NO_SPEECH, MIC_MODE.TIMED_OUT, MIC_MODE.ERROR]
    if (errorResetTimeoutRef.current) {
      window.clearTimeout(errorResetTimeoutRef.current)
      errorResetTimeoutRef.current = null
    }
    if (errorModes.includes(voice.micMode)) {
      errorResetTimeoutRef.current = window.setTimeout(() => {
        errorResetTimeoutRef.current = null
        voice.resetMode()
      }, 1500)
    }
    return () => {
      if (errorResetTimeoutRef.current) {
        window.clearTimeout(errorResetTimeoutRef.current)
        errorResetTimeoutRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.micMode])

  useEffect(() => {
    if (!isOnline) {
      voice.setVoiceError(MIC_MODE.ERROR, "You're offline. Reconnect to use voice input.")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.some((m) => m.bill && !m.billStale)) return prev
      return prev.map((m) => {
        if (!m.bill || m.billStale) return m
        const optSig = (opts) => (opts || []).map((o) => `${o.groupId || ''}:${o.optionName}:${o.suboptionName || ''}`).sort().join('|')
        const billSig = m.bill.items
          .map((i) => `${i.item_name}:${i.quantity}:${optSig(i.selectedOptions)}:${i.instructions || ''}`)
          .sort()
          .join(',')
        const cartSig = cartItems
          .map((i) => `${i.name}:${i.qty}:${optSig(i.selectedOptions)}:${i.instructions || ''}`)
          .sort()
          .join(',')
        return billSig === cartSig ? m : { ...m, billStale: true }
      })
    })
  }, [cartItems])

  const toggleVoiceCapture = () => {
    if (!isOnline) {
      voice.setVoiceError(MIC_MODE.ERROR, "You're offline. Reconnect to use voice input.")
      return
    }
    if (voice.micMode === MIC_MODE.FINALIZING) {
      return
    }
    if (voice.replyPending || voice.micMode === MIC_MODE.THINKING) {
      stopPendingReply()
      return
    }
    if (voice.active) {
      voice.requestStop()
      return
    }
    // iOS requires AudioContext to be created/resumed synchronously inside the click handler,
    // before any await. VoiceInput reads this ref and reuses the context instead of creating its own.
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    audioCtxRef.current.resume().catch(() => {})
    voice.requestStart()
  }

  const cycleMicMode = () => toggleVoiceCapture()

  const appendMessage = (message) => {
    setChipsVisible(false)
    setMessages((m) => [...m, message])
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    const routedText = normalizeTranscriptForRouting(trimmed) || trimmed
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    clearPartials()
    voice.beginReply()
    appendMessage({ id: Date.now(), role: 'user', text: trimmed, time: now })

    try {
      const cartId = localStorage.getItem('cartId') || null
      const response = await axios.post(`${CHATBOT_URL}/chat/message`, {
        session_id: getOrCreateChatSessionId(),
        message: routedText,
        cart_id: cartId,
      }, {
        withCredentials: true,
      })
      const data = response.data
      if (data.cart_id) localStorage.setItem('cartId', data.cart_id)
      if (data.cart_updated) refreshCart()
      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        cartUpdated: Boolean(data.cart_updated),
        intent: typeof data.intent === 'string' ? data.intent : '',
        pipelineStage: typeof data.metadata?.pipeline_stage === 'string' ? data.metadata.pipeline_stage : '',
        cart: Array.isArray(data.metadata?.cart) ? data.metadata.cart : null,
        bill: data.metadata?.bill || null,
        sizeUpgrade: data.metadata?.size_upgrade || null,
        audioSrc: typeof data.audio_base64 === 'string' ? data.audio_base64 : '',
      })
      if (data.intent === 'confirm_checkout' && data.metadata?.pipeline_stage === 'checkout_redirect') {
        setTimeout(() => onConfirm?.(), 1500)
      }

    } catch (error) {
      if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
        return
      }

      const backendDetail = error?.response?.data?.detail
      const fallbackError = error?.message || "Sorry, I couldn't reach the assistant. Please try again."
      const errorText = typeof backendDetail === 'string' && backendDetail.trim()
        ? backendDetail.trim()
        : fallbackError

      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: errorText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    } finally {
      voice.finishReply()
    }
  }

  const handleBillConfirm = () => {
    if (cartCount === 0) {
      appendMessage({
        id: Date.now(),
        role: 'bot',
        text: "Oops! Your cart is empty now! Add some items and we'll get you checked out.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
      return
    }
    onConfirm?.()
  }

  const handleChipClick = (text) => sendMessage(text)
  const handleSend = () => sendMessage(joinTranscript(voice.confirmedText, voice.interimText).trim())

  const handleCloseClick = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    if (voice.busy) {
      voice.requestStop()
    }
    onClose()
  }

  const adjustHeight = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20
    const maxHeight = lineHeight * 3 + 20
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  useEffect(() => {
    adjustHeight()
  }, [voice.confirmedText, voice.interimText])

  const handleAnimationEnd = (e) => {
    const closingAnimations = ['chatUnitPushOut', 'chatMobileFadeOut']
    if (chatClosing && closingAnimations.includes(e.animationName)) {
      voice.resetStatus()
      onCloseComplete()
    }
  }

  const handleVoiceEvent = (event) => {
    if (!event?.type) return

    if (event.type === 'busy') {
      voice.setBusy(Boolean(event.busy))
      return
    }

    if (event.type === 'state') {
      voice.setVoiceState(event.state)
      return
    }

    if (event.type === 'partial') {
      const confirmed = normalizeTranscriptForUi(event.confirmed ?? '')
      const interim = normalizeTranscriptForUi(event.interim ?? event.text ?? '')
      schedulePartial(confirmed, interim)
      return
    }

    if (event.type === 'final') {
      const finalText = normalizeTranscriptForUi(event.text || '').trim()
      if (!finalText) return
      clearPartials()
      voice.receiveFinalTranscript(finalText)
      if (pendingReplyTimeoutRef.current) {
        window.clearTimeout(pendingReplyTimeoutRef.current)
      }
      pendingReplyTimeoutRef.current = window.setTimeout(() => {
        pendingReplyTimeoutRef.current = null
        void sendMessage(finalText)
      }, 150)
      return
    }

    if (event.type === 'error') {
      clearPartials()
      const kind = event.kind || MIC_MODE.ERROR
      const message = event.message
        ? `Couldn't hear that, try again. ${event.message}`
        : "Couldn't hear that, try again."
      voice.setVoiceError(kind, message)
    }
  }

  return (
    <>
      <div
        className={`chat-unit${chatClosing ? ' chat-unit-closing' : ''}`}
        style={
          chatRouteClosing
            ? {
                '--chat-panel-width': `${CHAT_PANEL_WIDTH}px`,
                position: 'fixed',
                top: 0,
                right: 0,
                height: '100vh',
                zIndex: 700,
              }
            : {
                '--chat-panel-width': `${CHAT_PANEL_WIDTH}px`,
              }
        }
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="resize-handle" aria-hidden="true" />
        <div className="chat-panel-shell">
          <aside className="chat-panel">
            <VoiceInput
              active={voice.active}
              onEvent={handleVoiceEvent}
              audioContextRef={audioCtxRef}
            />
            <div className="cp-header">
              <div className="chat-assistant-meta">
                <span className="chat-assistant-title">Stories Assistant</span>
                <span className="chat-assistant-badge">NEW</span>
              </div>
              <button className="chat-panel-close" type="button" aria-label="Close" onClick={handleCloseClick}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="13" y2="13" />
                  <line x1="13" y1="1" x2="1" y2="13" />
                </svg>
              </button>
            </div>

            <section className="chat-conversation" aria-label="Conversation area">
              {(hasConversation || voice.micMode === MIC_MODE.THINKING || voice.micMode === MIC_MODE.FINALIZING) && (
                <div ref={msgsRef} className="chat-msgs" role="log" aria-live="polite" aria-relevant="additions text">
                  {messages.map((msg, i) => (
                    <Bubble
                      key={msg.id}
                      msg={msg}
                      prevTime={i > 0 ? messages[i - 1].time : null}
                      onSuggestionClick={sendMessage}
                      onConfirm={handleBillConfirm}
                    />
                  ))}
                  {voice.replyPending && (
                    <div className="msg-row msg-row-bot">
                      <div className="msg-bubble msg-bubble-bot msg-typing-dots">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className={`chat-mic-fade ${hasConversation ? 'chat-mic-fade-visible' : ''}`} />

              <div className={`chat-mic-zone ${hasConversation ? 'chat-mic-zone-active' : 'chat-mic-zone-fresh'}`} data-mode={getDisplayMode(voice.micMode)}>
                <div className="voice-mic-wrapper" data-mode={getDisplayMode(voice.micMode)}>
                  <span className="voice-ring voice-ring-1" />
                  <span className="voice-ring voice-ring-2" />
                  <span className="voice-ring voice-ring-3" />
                  <svg className="voice-arc-svg" viewBox="0 0 90 90" fill="none">
                    <circle className="voice-arc-circle" cx="45" cy="45" r="40" stroke="#1a6b3c" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>
                  <svg className="voice-arc-svg-2" viewBox="0 0 90 90" fill="none">
                    <circle className="voice-arc-circle" cx="45" cy="45" r="40" stroke="#1a6b3c" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>
                  <button
                    className="voice-mic-btn"
                    type="button"
                    aria-label={getMicAriaLabel(voice.micMode)}
                    onClick={cycleMicMode}
                    disabled={!isOnline || voice.micMode === MIC_MODE.FINALIZING}
                  >
                    <svg width="26" height="26" viewBox="0 0 100 100" fill="none" overflow="visible">
                      <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
                      <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
                      <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
                    </svg>
                  </button>
                </div>
                <p className="voice-state-label" data-mode={getDisplayMode(voice.micMode)}>
                  {getMicLabel(voice.micMode)}
                </p>
                <div className={`chat-suggestions ${!chipsVisible ? 'chat-suggestions-hidden' : ''}`} role="list" aria-label="Suggestions">
                  <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick("What's good today?")}>
                    &quot;What&apos;s good today?&quot;
                  </button>
                  <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick('Repeat my last order')}>
                    &quot;Repeat my last order&quot;
                  </button>
                  <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick('Surprise me')}>
                    &quot;Surprise me&quot;
                  </button>
                </div>
              </div>
            </section>

            <div className="chat-input-bar">
              <div className="chat-input-wrap">
                <div className="chat-input-composite" onClick={() => inputRef.current?.focus()}>
                  <textarea
                    ref={inputRef}
                    className="chat-input-native"
                    rows={1}
                    value={voice.interimText ? joinTranscript(voice.confirmedText, voice.interimText) : voice.confirmedText}
                    placeholder="Type your order..."
                    onChange={(e) => {
                      if (!voice.interimText) {
                        voice.setConfirmedText(e.target.value)
                        adjustHeight()
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    aria-label="Type your order"
                  />
                </div>
                {(voice.confirmedText || voice.interimText) && (
                  <button className="chat-input-send" type="button" aria-label="Send" onClick={handleSend}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Portal>
        <Snackbar open={Boolean(voice.voiceError)} autoHideDuration={3800} onClose={() => voice.dismissError()} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => voice.dismissError()} severity="error" variant="filled" sx={{ width: '100%' }}>
            {voice.voiceError}
          </Alert>
        </Snackbar>
      </Portal>
    </>
  )
}
