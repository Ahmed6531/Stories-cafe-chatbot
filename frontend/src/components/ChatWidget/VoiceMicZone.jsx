export default function VoiceMicZone({ micMode, hasConversation, chipsVisible, isOnline, onMicClick, onChipClick }) {
  return (
    <div className={`chat-mic-zone ${hasConversation ? 'chat-mic-zone-active' : 'chat-mic-zone-fresh'}`} data-mode={micMode}>
      <div className="voice-mic-wrapper" data-mode={micMode}>
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
          aria-label={
            micMode === 'listening'
              ? 'Listening, tap to stop'
              : micMode === 'thinking'
              ? 'Processing your message'
              : 'Tap to speak'
          }
          onClick={onMicClick}
          disabled={!isOnline}
        >
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none" overflow="visible">
            <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
            <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
            <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
          </svg>
        </button>
      </div>

      <p className="voice-state-label" data-mode={micMode}>
        {micMode === 'listening' ? 'Listening' : micMode === 'thinking' ? 'Thinking...' : 'tap to speak'}
      </p>

      <div className={`chat-suggestions ${!chipsVisible ? 'chat-suggestions-hidden' : ''}`} role="list" aria-label="Suggestions">
        <button className="chat-suggestion-chip" type="button" onClick={() => onChipClick("What's good today?")}>
          &quot;What&apos;s good today?&quot;
        </button>
        <button className="chat-suggestion-chip" type="button" onClick={() => onChipClick("What's in my cart?")}>
          &quot;What&apos;s in my cart?&quot;
        </button>
        <button className="chat-suggestion-chip" type="button" onClick={() => onChipClick('Surprise me')}>
          &quot;Surprise me&quot;
        </button>
      </div>
    </div>
  )
}