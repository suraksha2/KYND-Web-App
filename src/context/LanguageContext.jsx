import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'kynd.language'

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' }
]

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved || 'en'
    } catch {
      return 'en'
    }
  })

  const setLanguage = (code) => {
    if (LANGUAGE_OPTIONS.some((o) => o.code === code)) {
      setLanguageState(code)
      try {
        localStorage.setItem(STORAGE_KEY, code)
      } catch {}
    }
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = {
    language,
    setLanguage,
    options: LANGUAGE_OPTIONS,
    label: LANGUAGE_OPTIONS.find((o) => o.code === language)?.label || 'English'
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
