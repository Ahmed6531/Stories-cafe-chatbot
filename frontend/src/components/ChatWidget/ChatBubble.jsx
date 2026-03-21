export default function ChatBubble({ msg, prevTime, onSuggestionClick }) {
  const isUser = msg.role === 'user'
  const showTime = msg.time !== prevTime
  const hasSuggestions = msg.suggestions && msg.suggestions.length > 0

  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`msg-bubble ${isUser ? 'msg-bubble-user' : 'msg-bubble-bot'}`}>
        {msg.text.split('\n').map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
        {hasSuggestions && (
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {msg.suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(`add ${s.item_name}`)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: '1px solid #e5e7eb',
                  background: '#f3f4f6',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#e5e7eb'
                  e.target.style.borderColor = '#d1d5db'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#f3f4f6'
                  e.target.style.borderColor = '#e5e7eb'
                }}
              >
                {s.item_name}
              </button>
            ))}
          </div>
        )}
      </div>
      {showTime && <span className="msg-time">{msg.time}</span>}
    </div>
  )
}