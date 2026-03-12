import { useRef } from 'react'

/**
 * Enables click-and-drag horizontal scrolling on a container ref.
 * Suppresses the click event on children when a drag occurred,
 * so dragging is never misinterpreted as a chip selection.
 */
export function useDragScroll() {
  const elementRef = useRef(null)
  const drag = useRef({ startX: 0, scrollLeft: 0, dragged: false })
  const scrollState = useRef({ left: 0, listener: null })

  const ref = (node) => {
    const current = elementRef.current

    if (current && scrollState.current.listener) {
      current.removeEventListener('scroll', scrollState.current.listener)
    }

    elementRef.current = node

    if (!node) {
      return
    }

    const handleScroll = () => {
      scrollState.current.left = node.scrollLeft
    }

    scrollState.current.listener = handleScroll
    node.scrollLeft = scrollState.current.left
    node.addEventListener('scroll', handleScroll, { passive: true })

    requestAnimationFrame(() => {
      if (elementRef.current === node) {
        node.scrollLeft = scrollState.current.left
      }
    })
  }

  const onMouseDown = (e) => {
    if (e.button !== 0) return
    const el = elementRef.current
    if (!el) return

    drag.current = { startX: e.pageX, scrollLeft: el.scrollLeft, dragged: false }
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.pageX - drag.current.startX
      if (!drag.current.dragged && Math.abs(delta) > 5) {
        drag.current.dragged = true
      }
      if (drag.current.dragged) {
        el.scrollLeft = drag.current.scrollLeft - delta
        scrollState.current.left = el.scrollLeft
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      el.style.cursor = ''
      el.style.userSelect = ''
      scrollState.current.left = el.scrollLeft

      if (drag.current.dragged) {
        // Eat the click that fires after mouseup so chips don't activate on drag
        el.addEventListener('click', (clickEvent) => clickEvent.stopPropagation(), { capture: true, once: true })
        drag.current.dragged = false
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return { ref, onMouseDown }
}
