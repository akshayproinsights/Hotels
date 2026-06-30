// React JSX transform — no explicit React import needed
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Delete, Check, X } from 'lucide-react'

interface NumericKeypadProps {
  value: string | number
  onDone: (val: string) => void   // called ONLY when Done is pressed
  onClose: () => void             // called when X or backdrop is tapped (no save)
  label?: string
  language?: 'en' | 'mr'
  keypadType?: 'currency' | 'phone' | 'number'
  maxDigits?: number
}

export default function NumericKeypad({
  value,
  onDone,
  onClose,
  label,
  language = 'en',
  keypadType = 'currency',
  maxDigits,
}: NumericKeypadProps) {
  // Buffer — starts with current value, only committed on Done
  const initialDisplay = value === 0 || value === '' || value === null || value === undefined
    ? ''
    : String(value)
  const [display, setDisplay] = useState(initialDisplay)

  const limit = maxDigits ?? (keypadType === 'phone' ? 10 : keypadType === 'number' ? 3 : 7)

  const handleKey = (k: string) => {
    if (k === 'backspace') {
      setDisplay(prev => prev.slice(0, -1))
      return
    }
    if (k === 'clear') {
      setDisplay('')
      return
    }
    // prevent leading zeros for numbers/amounts
    if (keypadType !== 'phone') {
      if (display === '0' && k !== '.') {
        setDisplay(k)
        return
      }
    }
    // max digits check
    if (display.length >= limit) return
    setDisplay(prev => prev + k)
  }

  const handleDone = () => {
    onDone(display)
  }

  const defaultLabel =
    keypadType === 'phone'
      ? (language === 'mr' ? 'मोबाईल नंबर टाका' : 'Enter Mobile Number')
      : keypadType === 'number'
      ? (language === 'mr' ? 'संख्या टाका' : 'Enter Number')
      : (language === 'mr' ? 'रक्कम टाका' : 'Enter Amount')

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'backspace'],
  ]

  return createPortal(
    <div
      className="nkp-overlay"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="nkp-sheet">
        {/* Header */}
        <div className="nkp-header">
          <div className="nkp-label-row">
            <span className="nkp-label">{label || defaultLabel}</span>
            <button className="nkp-close-btn" onClick={onClose} type="button">
              <X size={16} />
            </button>
          </div>
          {/* Display */}
          <div className="nkp-display-wrap">
            {keypadType === 'currency' && <span className="nkp-currency">₹</span>}
            <span className="nkp-display">{display || '0'}</span>
          </div>
        </div>

        {/* Keypad grid */}
        <div className="nkp-grid">
          {keys.map((row, ri) => (
            <div key={ri} className="nkp-row">
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`nkp-key ${k === 'backspace' ? 'nkp-key--action' : ''} ${k === 'clear' ? 'nkp-key--clear' : ''}`}
                  onClick={() => handleKey(k)}
                  onPointerDown={(e) => e.preventDefault()} // prevent focus loss
                >
                  {k === 'backspace' ? (
                    <Delete size={20} />
                  ) : k === 'clear' ? (
                    <span className="nkp-key-clear-label">{language === 'mr' ? 'साफ' : 'C'}</span>
                  ) : (
                    <span className="nkp-key-digit">{k}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Done button */}
        <div className="nkp-footer">
          <button
            type="button"
            className="nkp-done-btn nkp-done-btn--pending"
            onClick={handleDone}
          >
            <Check size={18} />
            <span>{language === 'mr' ? 'ठीक आहे' : 'Done'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
