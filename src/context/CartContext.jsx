import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)

const parsePrice = (str = '') => {
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function CartProvider({ children }) {
  const [userId, setUserId] = useState(null)

  // Get storage key based on user ID
  const getStorageKey = (uid) => uid ? `kynd.cart.${uid}` : 'kynd.cart.guest'

  const [items, setItems] = useState(() => {
    try {
      const key = getStorageKey(null)
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  // Load cart when user changes
  useEffect(() => {
    const key = getStorageKey(userId)
    try {
      const raw = localStorage.getItem(key)
      setItems(raw ? JSON.parse(raw) : [])
    } catch { setItems([]) }
  }, [userId])

  // Save cart when items change
  useEffect(() => {
    const key = getStorageKey(userId)
    try { localStorage.setItem(key, JSON.stringify(items)) } catch {}
  }, [items, userId])

  // Call this when user logs in/out to update the userId
  const setUserIdFromAuth = (uid) => {
    setUserId(uid)
  }

  const addItem = (svc, qty = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.slug === svc.slug)
      if (existing) {
        return prev.map(i => i.slug === svc.slug ? { ...i, qty: i.qty + qty } : i)
      }
      return [...prev, {
        slug: svc.slug,
        name: svc.name,
        img: svc.img,
        priceFrom: svc.price || parsePrice(svc.pricingFrom),
        duration: svc.duration,
        catalogId: svc.catalogId || svc.id || null,
        qty
      }]
    })
  }

  const removeItem = (slug) => setItems(prev => prev.filter(i => i.slug !== slug))
  const setQty = (slug, qty) => setItems(prev => prev.flatMap(i => {
    if (i.slug !== slug) return [i]
    if (qty <= 0) return []
    return [{ ...i, qty }]
  }))
  const clear = () => setItems([])

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.priceFrom * i.qty, 0), [items])
  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items])

  const value = { items, count, subtotal, addItem, removeItem, setQty, clear, setUserIdFromAuth }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
