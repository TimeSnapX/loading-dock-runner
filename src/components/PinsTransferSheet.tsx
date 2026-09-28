import { useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { countPins, exportJson, type ImportResult, type PinOverrides } from '../lib/pins'

interface PanelProps {
  pins: PinOverrides
  nameOf: (id: string) => string
  importPins: (text: string) => ImportResult
}

interface Props extends PanelProps {
  onClose: () => void
}

export function PinsTransferSheet({ pins, nameOf, importPins, onClose }: Props) {
  return (
    <Sheet title="My pins" onClose={onClose} labelId="pins-sheet-title">
      <PinsTransferPanel pins={pins} nameOf={nameOf} importPins={importPins} />
      <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
        Done
      </button>
    </Sheet>
  )
}

/** Copy / download / import pins. Used on the My pins tab and in the store-detail sheet. */
export function PinsTransferPanel({ pins, nameOf, importPins }: PanelProps) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fbRef = useRef<HTMLTextAreaElement>(null)
  const n = countPins(pins)

  const copy = async () => {
    const json = exportJson(pins, nameOf)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(json)
      setFallback(null)
      setMsg({ kind: 'ok', text: `Copied ${n} pin${n === 1 ? '' : 's'} to clipboard.` })
    } catch {
      setFallback(json)
      setMsg({ kind: 'warn', text: 'Couldn’t copy automatically — long-press the text below, Select all, Copy.' })
      setTimeout(() => {
        fbRef.current?.focus()
        fbRef.current?.select()
      }, 50)
    }
  }

  const download = () => {
    const json = exportJson(pins, nameOf)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ldr-pins-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMsg({ kind: 'ok', text: `Downloaded ${a.download}.` })
  }

  const doImport = (text: string) => {
    const r = importPins(text)
    const parts = [`${r.added} added`, `${r.updated} updated`]
    if (r.skipped) parts.push(`${r.skipped} unchanged (yours newer)`)
    if (r.errors.length && !r.added && !r.updated && !r.skipped) {
      setMsg({ kind: 'err', text: `Import failed: ${r.errors.join(' ')}` })
      return
    }
    setMsg({
      kind: r.errors.length ? 'warn' : 'ok',
      text: `Imported: ${parts.join(', ')}.${r.errors.length ? ` ${r.errors.length} row(s) skipped: ${r.errors.slice(0, 3).join(' ')}` : ''}`,
    })
    setImportText('')
  }

  return (
    <>
      <p className="muted sheet__sub" data-testid="pins-count">
        {n} saved pin{n === 1 ? '' : 's'} on this phone (dock + park-up). Back them up or send them so they can be
        added to the app for everyone.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn--primary btn--block" onClick={copy} disabled={!n}>
          Copy my pins
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={download} disabled={!n}>
          Download pins JSON
        </button>
      </div>
      {msg ? (
        <p className={`pin-msg pin-msg--${msg.kind}`} role="status" data-testid="pins-msg">
          {msg.text}
        </p>
      ) : null}
      {fallback ? (
        <textarea
          ref={fbRef}
          className="pins-fallback"
          readOnly
          value={fallback}
          rows={8}
          data-testid="pins-fallback"
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}

      <hr className="sheet__rule" />
      <p className="detail__label">Import pins</p>
      <div className="field">
        <label htmlFor="pins-import" className="sr-only">
          Paste pins JSON
        </label>
        <textarea
          id="pins-import"
          rows={4}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste pins JSON here"
          spellCheck={false}
        />
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--secondary btn--block"
          disabled={!importText.trim()}
          onClick={() => doImport(importText)}
        >
          Import pasted pins
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => fileRef.current?.click()}>
          Import from file
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,text/plain"
        hidden
        data-testid="pins-file"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) doImport(await f.text())
        }}
      />
    </>
  )
}
