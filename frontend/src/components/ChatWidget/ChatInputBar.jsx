export default function ChatInputBar({ value, onChange, onSend }) {
  return (
    <div className="chat-input-bar">
      <div className="chat-input-wrap">
        <input
          className="chat-input"
          type="text"
          placeholder="Type your order..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
        />
        {value && (
          <button className="chat-input-send" type="button" aria-label="Send" onClick={onSend}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}