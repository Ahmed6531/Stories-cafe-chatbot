import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'

const placeholderImg = 'https://via.placeholder.com/32/ffffff/00704a?text=+'

export default function MiniCartPopup({ open, onClose, anchorRef, lastAddedItem, chatOpen }) {
  const navigate = useNavigate()
  const popupRef = useRef(null)
  const timerRef = useRef(null)
  const [isLeaving, setIsLeaving] = useState(false)

  const triggerClose = () => {
    clearTimeout(timerRef.current)
    setIsLeaving(true)
    setTimeout(() => {
      setIsLeaving(false)
      onClose()
    }, 220)
  }

  // Auto-dismiss after 3 s
  useEffect(() => {
    if (!open) return
    timerRef.current = setTimeout(triggerClose, 3000)
    return () => clearTimeout(timerRef.current)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Outside-click dismiss
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        triggerClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, anchorRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key dismiss
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') triggerClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !lastAddedItem) return null

  const { image } = lastAddedItem

  return ReactDOM.createPortal(
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(120%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(120%); }
        }
        .mini-cart-toast {
          animation: toastIn 0.32s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
        }
        .mini-cart-toast.leaving {
          animation: toastOut 0.22s ease-in forwards;
        }
      `}</style>

      <div
        ref={popupRef}
        role="status"
        aria-live="polite"
        className={`mini-cart-toast${isLeaving ? ' leaving' : ''}`}
        style={{
          position: 'fixed',
          top: 64,
          right: chatOpen ? 436 : 16,
          zIndex: 1300,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 12,
          background: '#00704a',
          boxShadow: '0 4px 14px rgba(0,112,74,0.22)',
          maxWidth: 'calc(100vw - 32px)',
          width: 300,
        }}
      >
        {/* Thumbnail */}
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.15)',
        }}>
          <img
            src={image || placeholderImg}
            alt=""
            onError={(e) => { e.currentTarget.src = placeholderImg }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        {/* Name */}
        <span style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 500,
          color: '#ffffff',
          fontFamily: "'Montserrat', sans-serif",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          Added to cart
        </span>

        <div
          onClick={() => { triggerClose(); navigate('/cart') }}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>
      </div>
    </>,
    document.body
  )
}
