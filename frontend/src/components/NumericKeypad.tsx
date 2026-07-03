// React JSX transform — no explicit React import needed
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Delete, Check, X } from 'lucide-react'
import type { Customer } from '../types'
import { searchCustomers } from '../api/customers'
import { format, parseISO } from 'date-fns'

interface NumericKeypadProps {
  value: string | number
  onDone: (val: string) => void   // called ONLY when Done is pressed
  onClose: () => void             // called when X or backdrop is tapped (no save)
  label?: string
  language?: 'en' | 'mr'
  keypadType?: 'currency' | 'phone' | 'number'
  maxDigits?: number
  onSelectCustomer?: (customer: Customer) => void
}

export default function NumericKeypad({
  value,
  onDone,
  onClose,
  label,
  language = 'en',
  keypadType = 'currency',
  maxDigits,
  onSelectCustomer,
}: NumericKeypadProps) {
  // Buffer — starts with current value, only committed on Done
  const initialDisplay = value === 0 || value === '' || value === null || value === undefined
    ? ''
    : String(value)
  const [display, setDisplay] = useState(initialDisplay)
  const [recommendations, setRecommendations] = useState<Customer[]>([])
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false)

  const limit = maxDigits ?? (keypadType === 'phone' ? 10 : keypadType === 'number' ? 3 : 7)

  const cleanInput = (val: string) => {
    if (keypadType === 'phone') {
      return val.replace(/\D/g, '').slice(0, limit)
    } else if (keypadType === 'number') {
      return val.replace(/\D/g, '').slice(0, limit)
    } else {
      // currency: allow digits and at most one decimal point
      const cleaned = val.replace(/[^0-9.]/g, '')
      const parts = cleaned.split('.')
      if (parts.length > 2) {
        return parts[0] + '.' + parts.slice(1).join('')
      }
      return cleaned.slice(0, limit)
    }
  }

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleDone()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    setDisplay(cleanInput(text))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(cleanInput(e.target.value))
  }

  const handleSelectCustomer = (customer: Customer) => {
    if (onSelectCustomer) {
      onSelectCustomer(customer)
    } else {
      setDisplay(customer.phone)
    }
  }

  useEffect(() => {
    if (keypadType !== 'phone') return
    if (display.length < 2) {
      setRecommendations([])
      return
    }
    const delayDebounce = setTimeout(async () => {
      setIsLoadingRecommendations(true)
      try {
        const res = await searchCustomers(display)
        setRecommendations(res)
      } catch (err) {
        console.error('Failed to search customers in keypad', err)
      } finally {
        setIsLoadingRecommendations(false)
      }
    }, 250)
    return () => clearTimeout(delayDebounce)
  }, [display, keypadType])

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
            <input
              type="text"
              inputMode="none"
              className="nkp-display nkp-display-input"
              value={display}
              placeholder="0"
              onChange={handleChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* Recommendations list */}
        {keypadType === 'phone' && (recommendations.length > 0 || isLoadingRecommendations) && (
          <div className="nkp-recommendations">
            {isLoadingRecommendations && recommendations.length === 0 ? (
              <div className="nkp-recommendation-item justify-center text-xs text-slate-500 font-semibold py-4">
                {language === 'mr' ? 'शोधत आहे...' : 'Searching...'}
              </div>
            ) : (
              recommendations.slice(0, 4).map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className="nkp-recommendation-item"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <div className="nkp-rec-left">
                    <span className="nkp-rec-name">{customer.name}</span>
                    <span className="nkp-rec-phone">{customer.phone}</span>
                  </div>
                  {customer.last_visit && (
                    <span className="nkp-rec-date">
                      {language === 'mr' ? 'शेवटची भेट:' : 'Last:'} {format(parseISO(customer.last_visit + 'T00:00:00'), 'dd MMM yyyy')}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

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
