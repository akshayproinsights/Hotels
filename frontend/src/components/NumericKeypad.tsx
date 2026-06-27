// React JSX transform — no explicit React import needed
import { createPortal } from 'react-dom'
import { Delete, Check, X } from 'lucide-react'

interface NumericKeypadProps {
  value: string | number
  onChange: (val: string) => void
  onClose: () => void
  label?: string
  totalAmount?: number       // for quick-fill "Full Amount" chip
  paymentMode?: 'Cash' | 'UPI' | 'Pending'
  language?: 'en' | 'mr'
}

const PRESETS = [500, 1000, 1500, 2000]

export default function NumericKeypad({
  value,
  onChange,
  onClose,
  label,
  totalAmount,
  paymentMode,
  language = 'en',
}: NumericKeypadProps) {
  const display = value === 0 || value === '' ? '' : String(value)

  const handleKey = (k: string) => {
    if (k === 'backspace') {
      const next = display.slice(0, -1)
      onChange(next === '' ? '' : next)
      return
    }
    if (k === 'clear') {
      onChange('')
      return
    }
    // prevent leading zeros (except single 0)
    if (display === '0' && k !== '.') {
      onChange(k)
      return
    }
    // max 6 digits
    if (display.length >= 6) return
    onChange(display + k)
  }

  const handlePreset = (amount: number) => {
    onChange(String(amount))
  }

  const handleFull = () => {
    if (totalAmount) onChange(String(totalAmount))
  }

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'backspace'],
  ]

  return createPortal(
    <div
      className="nkp-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="nkp-sheet">
        {/* Header */}
        <div className="nkp-header">
          <div className="nkp-label-row">
            <span className="nkp-label">{label || (language === 'mr' ? 'रक्कम टाका' : 'Enter Amount')}</span>
            <button className="nkp-close-btn" onClick={onClose} type="button">
              <X size={16} />
            </button>
          </div>
          {/* Display */}
          <div className="nkp-display-wrap">
            <span className="nkp-currency">₹</span>
            <span className="nkp-display">{display || '0'}</span>
          </div>
        </div>

        {/* Quick-fill chips */}
        <div className="nkp-presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`nkp-preset-chip ${Number(display) === p ? 'nkp-preset-chip--active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              ₹{p}
            </button>
          ))}
          {totalAmount && totalAmount > 0 && (
            <button
              type="button"
              className={`nkp-preset-chip nkp-preset-chip--full ${Number(display) === totalAmount ? 'nkp-preset-chip--active' : ''}`}
              onClick={handleFull}
            >
              {language === 'mr' ? '✓ पूर्ण' : '✓ Full'}
            </button>
          )}
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
            className={`nkp-done-btn ${
              paymentMode === 'Cash'
                ? 'nkp-done-btn--cash'
                : paymentMode === 'UPI'
                ? 'nkp-done-btn--upi'
                : 'nkp-done-btn--pending'
            }`}
            onClick={onClose}
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
