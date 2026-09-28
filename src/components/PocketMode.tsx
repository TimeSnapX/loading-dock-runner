import { useEffect, useRef, useState } from 'react'

const HOLD_MS = 1500

/**
 * Black full-screen overlay for the phone in a pocket / cradle: the screen stays on (Wake Lock)
 * so GPS keeps working, but it shows almost nothing. Tap-and-hold to exit.
 */
export function PocketMode({ onExit, line }: { onExit: () => void; line: string }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => {
    setHolding(true)
    timer.current = setTimeout(() => onExit(), HOLD_MS)
  }
  const cancel = () => {
    setHolding(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => () => cancel(), [])

  return (
    <div
      className={`pocket ${holding ? 'pocket--holding' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Pocket mode. Tap and hold to exit."
      data-testid="pocket"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pocket__line">{line}</div>
      <div className="pocket__hint">
        <span className="pocket__ring" style={{ animationDuration: `${HOLD_MS}ms` }} />
        Tap and hold to exit
      </div>
    </div>
  )
}
