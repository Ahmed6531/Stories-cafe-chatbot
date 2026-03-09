import { useRef } from 'react'

/**
 * Enables click-and-drag horizontal scrolling on a container ref.
 * Suppresses the click event on children when a drag occurred,
 * so dragging is never misinterpreted as a chip selection.
 */
export function useDragScroll() {
  const ref = useRef(null)
  const drag = useRef({ startX: 0, scrollLeft: 0, dragged: false })

  const onMouseDown = (e) => {
    if (e.button !== 0) return
    const el = ref.current
    if (!el) return

    drag.current = { startX: e.pageX, scrollLeft: el.scrollLeft, dragged: false }
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'

    const onMouseMove = (e) => {
      const delta = e.pageX - drag.current.startX
      if (!drag.current.dragged && Math.abs(delta) > 5) {
        drag.current.dragged = true
      }
      if (drag.current.dragged) {
        el.scrollLeft = drag.current.scrollLeft - delta
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      el.style.cursor = ''
      el.style.userSelect = ''
      if (drag.current.dragged) {
        // Eat the click that fires after mouseup so chips don't activate on drag
        el.addEventListener('click', (ce) => ce.stopPropagation(), { capture: true, once: true })
        drag.current.dragged = false
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return { ref, onMouseDown }
}
