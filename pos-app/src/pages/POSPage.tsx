import { AccountScreen } from './management/AccountScreen'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  LogIn,
  LogOut,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Users,
  ArchiveRestore,
  XCircle
} from 'lucide-react'
import type {
  CompleteSaleRequest,
  DashboardData,
  InitialAdminRequest,
  PaymentStatus,
  SaleResult,
  User
} from '../../shared/types'
import {
  DebtsScreen,
  ProductsScreen,
  ReportsScreen,
  BackupScreen,
  SettingsScreen,
  StockScreen,
  UsersScreen
} from './ManagementScreens'

type ProductCard = {
  id: number
  name: string
  brand?: string
  category: string
  price: number
  stock: number
}

type CartLine = ProductCard & {
  quantity: number
}

type PurchaseStep = 'closed' | 'customer' | 'bill' | 'receipt'

type ReceiptSnapshot = {
  invoiceNumber: string
  customerId?: number
  customerAccountNumber?: string
  customerName: string
  customerFatherName: string
  customerPhone: string
  cashierName: string
  createdAt: string
  items: CartLine[]
  subtotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  taxPercent: number
  total: number
  paid: number
  changeDue: number
  amountDue: number
  paymentStatus: PaymentStatus
}

type Notice = {
  tone: 'success' | 'error' | 'info'
  text: string
}

type StoreSettings = {
  ShopName: string
  ShopAddress: string
  ShopPhone: string
  ShopEmail: string
  TaxPercent?: string
  ReceiptHeaderMessage: string
  ReceiptFooterMessage: string
  ReceiptShowPhone: string
  ReceiptShowAddress: string
}

const defaultStoreSettings: StoreSettings = {
  ShopName: 'SecureStore POS',
  ShopAddress: 'Store address',
  ShopPhone: '',
  ShopEmail: '',
  ReceiptHeaderMessage: 'Original sale receipt',
  ReceiptFooterMessage: 'Thank you for shopping with us!',
  ReceiptShowPhone: 'true',
  ReceiptShowAddress: 'true'
}


const navItems = [
  { id: 'checkout', icon: ShoppingCart, label: 'Checkout', adminOnly: false },
  { id: 'products', icon: Package, label: 'Products', adminOnly: true },
  { id: 'stock', icon: Package, label: 'Stock', adminOnly: true },
  { id: 'backups', icon: ArchiveRestore, label: 'Backups', adminOnly: true },
  { id: 'debts', icon: CreditCard, label: 'Debts', adminOnly: true },
  { id: 'reports', icon: BarChart3, label: 'Reports', adminOnly: true },
  { id: 'users', icon: Users, label: 'Users', adminOnly: true },
  { id: 'settings', icon: Settings, label: 'Settings', adminOnly: true },
  { id: 'account', icon: ShieldCheck, label: 'My Account', adminOnly: false }
]

type ScreenId = (typeof navItems)[number]['id']

const roundMoney = (value: number) => Math.round(value * 100) / 100

const currency = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR'
})

function isValidMobileNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function unwrapData<T>(response: any, fallback: T): T {
  if (Array.isArray(response)) return response as T
  if (response?.data !== undefined) return response.data as T
  return fallback
}

function normalizeProduct(raw: any): ProductCard | null {
  const id = Number(raw?.productId ?? raw?.ProductID ?? raw?.id)
  const name = String(raw?.productName ?? raw?.ProductName ?? raw?.name ?? '').trim()
  const price = Number(raw?.sellingPrice ?? raw?.SellingPrice ?? raw?.price ?? 0)

  if (!id || !name || price <= 0) return null

  return {
    id,
    name,
    brand: raw?.brand ?? raw?.Brand,
    category: raw?.categoryName ?? raw?.CategoryName ?? raw?.category ?? 'General',
    price,
    stock: Number(raw?.stockQuantity ?? raw?.StockQuantity ?? raw?.stock ?? 0)
  }
}

function normalizeProducts(response: any, fallback: ProductCard[] = []): ProductCard[] {
  if (!response) return fallback
  if (response?.success === false) return []
  const rows = unwrapData<any[]>(response, [])
  const products = rows.map(normalizeProduct).filter(Boolean) as ProductCard[]
  return products
}

function validateCartAvailability(cart: CartLine[], activeProducts: ProductCard[]) {
  const byId = new Map(activeProducts.map((product) => [product.id, product]))

  for (const line of cart) {
    const product = byId.get(line.id)
    if (!product) return `${line.name} is inactive, deleted, or no longer available for checkout.`
    if (line.quantity > product.stock) return `${product.name} has only ${product.stock} in stock right now.`
  }

  return null
}

function initials(user?: User | null) {
  if (!user?.fullName) return 'SS'
  return user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function isInteractiveElement(element: Element | null) {
  if (!element) return false
  if (element instanceof HTMLElement && element.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(element.tagName)
}

function findScrollableAncestor(element: Element | null) {
  let current = element instanceof HTMLElement ? element : null
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    const canScroll = /(auto|scroll)/.test(`${style.overflowY}${style.overflow}`)
    if (canScroll && current.scrollHeight > current.clientHeight + 1) return current
    current = current.parentElement
  }
  return null
}

export default function POSPage() {
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const saleInFlight = useRef(false)
  const [loginMessage, setLoginMessage] = useState('')
  const [loginMessageTone, setLoginMessageTone] = useState<'success' | 'error'>('error')
  const [setupChecked, setSetupChecked] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupForm, setSetupForm] = useState({
    username: 'admin',
    fullName: 'System Administrator',
    plainPassword: '',
    confirmPassword: ''
  })
  const [setupMessage, setSetupMessage] = useState('')
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [products, setProducts] = useState<ProductCard[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProductCard[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [amountPaid, setAmountPaid] = useState('')
  const [customerAccountNumber, setCustomerAccountNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerFatherName, setCustomerFatherName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>('closed')
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [taxPercent, setTaxPercent] = useState(0)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<string | null>(null)
  const [clock, setClock] = useState(() => new Date())
  const [activeScreen, setActiveScreen] = useState<ScreenId>('checkout')
  const searchSequence = useRef(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const screenScrollRef = useRef<HTMLDivElement>(null)
  const checkoutScrollRef = useRef<HTMLElement>(null)
  const isAdmin = user?.roleName === 'Admin'
  const accessibleNavItems = useMemo(
    () => navItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  )

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  )
  const discountAmount = roundMoney(subtotal * (discountPercent / 100))
  const taxableAmount = Math.max(0, subtotal - discountAmount)
  const taxAmount = roundMoney(taxableAmount * (taxPercent / 100))
  const total = roundMoney(taxableAmount + taxAmount)
  const paid = Number(amountPaid || 0)
  const changeDue = Math.max(0, paid - total)
  const amountDue = roundMoney(Math.max(0, total - paid))
  const hasValidPaidAmount = amountPaid.trim().length > 0 && Number.isFinite(paid) && paid >= 0
  const isDebtSale = hasValidPaidAmount && amountDue > 0
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const hasValidCustomerPhone = isValidMobileNumber(customerPhone)
  const hasAccountDetails = customerName.trim().length > 0 && customerFatherName.trim().length > 0 && hasValidCustomerPhone
  const canComplete = cart.length > 0 && !isProcessing && hasValidPaidAmount && (!isDebtSale || hasAccountDetails)
  const missingBillItems = useMemo(() => {
    const missing: string[] = []
    if (cart.length === 0) missing.push('Add at least one product to the cart.')
    if (!amountPaid) missing.push('Enter the amount received.')
    if (amountPaid && (!Number.isFinite(paid) || paid < 0)) missing.push('Amount received cannot be negative.')
    if (hasValidPaidAmount && amountDue > 0) {
      if (!customerName.trim()) missing.push('Enter the account holder name.')
      if (!customerFatherName.trim()) missing.push('Enter the father name.')
      if (!customerPhone.trim()) {
        missing.push('Enter the mobile number.')
      } else if (!hasValidCustomerPhone) {
        missing.push('Enter a valid mobile number.')
      }
    }
    return missing
  }, [amountDue, amountPaid, cart.length, customerFatherName, customerName, customerPhone, hasValidCustomerPhone, hasValidPaidAmount, paid])

  const scrollElement = (element: HTMLElement | null, direction: 'up' | 'down') => {
    element?.scrollBy({
      top: direction === 'down' ? 420 : -420,
      behavior: 'smooth'
    })
  }

  const scrollActiveScreen = (direction: 'up' | 'down') => {
    const modalScroll = document.querySelector<HTMLElement>('[data-scroll-region="modal"]')
    const activeScroll = modalScroll || screenScrollRef.current || checkoutScrollRef.current
    scrollElement(activeScroll, direction)
  }

  const getKeyboardScrollTarget = useCallback(() => {
    const activeElement = document.activeElement
    const focusedScroll = findScrollableAncestor(activeElement)
    if (focusedScroll) return focusedScroll
    const modalScroll = document.querySelector<HTMLElement>('[data-scroll-region="modal"]')
    return modalScroll || screenScrollRef.current || checkoutScrollRef.current
  }, [])

  const loadProducts = useCallback(async () => {
    try {
      if (window.api?.getProducts) {
        const response = await window.api.getProducts()
        if (!response?.success) throw new Error(response?.message || 'Could not load products.')
        setProducts(normalizeProducts(response, []))
      }

      if (user?.roleName === 'Admin' && window.api?.getDashboard) {
        const response = await window.api.getDashboard()
        setDashboard(unwrapData<DashboardData | null>(response, null))
      }

      if (window.api?.getSettings) {
        const response = await window.api.getSettings()
        const nextSettings = { ...defaultStoreSettings, ...unwrapData<Record<string, string>>(response, {}) }
        setStoreSettings(nextSettings)
        const nextTax = Number(nextSettings.TaxPercent ?? 0)
        if (Number.isFinite(nextTax)) setTaxPercent(Math.min(100, Math.max(0, nextTax)))
      }
    } catch (error: any) {
      setNotice({ tone: 'error', text: error?.message ?? 'Could not load product data.' })
    }
  }, [user?.roleName])

  useEffect(() => {
    let mounted = true

    const checkSetup = async () => {
      try {
        if (!window.api?.getSetupStatus) throw new Error('Desktop connection unavailable. Restart SecureStore POS.')
        const response = await window.api.getSetupStatus()
        if (!mounted) return

        setSetupRequired(Boolean(response?.success && response.data?.setupRequired))
        if (response?.success === false && response.message) {
          setLoginMessageTone('error')
          setLoginMessage(response.message)
        }
      } catch (error: any) {
        if (mounted) {
          setLoginMessageTone('error')
          setLoginMessage(error?.message ?? 'Could not check setup status.')
        }
      } finally {
        if (mounted) setSetupChecked(true)
      }
    }

    checkSetup()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (user) loadProducts()
  }, [loadProducts, user])

  useEffect(() => {
    if (user && !accessibleNavItems.some((item) => item.id === activeScreen)) {
      setActiveScreen('checkout')
    }
  }, [accessibleNavItems, activeScreen, user])

  useEffect(() => {
    if (user && activeScreen === 'checkout') {
      loadProducts()
    }
  }, [activeScreen, loadProducts, user])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => { void window.api?.getSessionStatus?.() }, 15_000)
    return () => window.clearInterval(timer)
  }, [user])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!user || isInteractiveElement(document.activeElement)) return

      const target = getKeyboardScrollTarget()
      if (!target) return

      const line = 72
      const page = Math.max(280, Math.floor(target.clientHeight * 0.82))
      let top = 0

      if (event.key === 'ArrowDown') top = line
      if (event.key === 'ArrowUp') top = -line
      if (event.key === 'PageDown' || event.key === ' ') top = page
      if (event.key === 'PageUp') top = -page

      if (event.key === 'Home') {
        event.preventDefault()
        target.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' })
        return
      }

      if (top !== 0) {
        event.preventDefault()
        target.scrollBy({ top, behavior: 'smooth' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [getKeyboardScrollTarget, user])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogin = async () => {
    if (isSigningIn) return
    setIsSigningIn(true)
    setLoginMessage('')
    setLoginMessageTone('error')

    try {
      if (window.api?.login) {
        const response = await window.api.login({ username, password })
        if (!response.success || !response.user) {
          setLoginMessageTone('error')
          setLoginMessage(response.message || 'Login failed.')
          return
        }

        setPassword('')
        setUser(response.user)
        setActiveScreen('checkout')
        await loadProducts()
        return
      }

      throw new Error('Desktop connection unavailable. Restart SecureStore POS.')
    } catch (error: any) {
      setLoginMessageTone('error')
      setLoginMessage(error?.message ?? 'Unable to sign in.')
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleInitialSetup = async () => {
    setSetupMessage('')
    const request: InitialAdminRequest = {
      username: setupForm.username.trim(),
      fullName: setupForm.fullName.trim(),
      plainPassword: setupForm.plainPassword
    }

    if (setupForm.plainPassword !== setupForm.confirmPassword) {
      setSetupMessage('Passwords do not match.')
      return
    }

    try {
      setIsSettingUp(true)
      const response = await window.api?.createInitialAdmin?.(request)
      if (!response?.success) {
        setSetupMessage(response?.message || 'Could not create the admin account.')
        return
      }

      setSetupRequired(false)
      setUsername(request.username)
      setPassword('')
      setSetupForm((current) => ({ ...current, plainPassword: '', confirmPassword: '' }))
      setLoginMessageTone('success')
      setLoginMessage(response.message || 'Admin account created. Sign in to continue.')
    } catch (error: any) {
      setSetupMessage(error?.message ?? 'Could not create the admin account.')
    } finally {
      setIsSettingUp(false)
    }
  }

  const handleLogout = async () => {
    try { await window.api?.logout?.() } catch { /* Clear local session even if the bridge fails. */ }
    setUser(null)
    setDashboard(null)
    setProducts([])
    setSearchResults([])
    setPassword('')
    setReceipt(null)
    setPurchaseStep('closed')
    setCustomerName('')
    setCustomerFatherName('')
    setCustomerPhone('')
    setCustomerAccountNumber('')
    setCart([])
    setNotice(null)
    setLastInvoice(null)
    setActiveScreen('checkout')
  }

  useEffect(() => {
    const expire = () => {
      void handleLogout()
      setLoginMessageTone('error')
      setLoginMessage('Your session ended. Sign in to continue.')
    }
    window.addEventListener('pos:session-expired', expire)
    return () => window.removeEventListener('pos:session-expired', expire)
  }, [])

  useEffect(() => {
    if (purchaseStep === 'closed') return
    const previous = document.activeElement as HTMLElement | null
    const modal = document.querySelector<HTMLElement>('[role="dialog"]')
    const focusable = () => Array.from(modal?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, [tabindex="0"]') ?? [])
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saleInFlight.current) setPurchaseStep('closed')
      if (event.key !== 'Tab') return
      const nodes = focusable()
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [purchaseStep])

  const searchProducts = useCallback(
    async (query: string) => {
      const sequence = ++searchSequence.current
      setSearchQuery(query)
      setNotice(null)

      if (query.trim().length < 2) {
        setSearchResults([])
        setShowSearchResults(false)
        return
      }

      try {
        if (window.api?.searchProducts) {
          const response = await window.api.searchProducts(query)
          if (sequence !== searchSequence.current) return
          setSearchResults(normalizeProducts(response, []))
        } else {
          throw new Error('Product search is unavailable. Restart the app.')
        }

        setShowSearchResults(true)
      } catch (error: any) {
        setNotice({ tone: 'error', text: error?.message ?? 'Product search failed.' })
      }
    },
    []
  )

  const addToCart = useCallback((product: ProductCard) => {
    setCart((existingCart) => {
      const existing = existingCart.find((line) => line.id === product.id)
      const nextQuantity = existing ? existing.quantity + 1 : 1

      if (product.stock < nextQuantity) {
        setNotice({ tone: 'error', text: `${product.name} has only ${product.stock} in stock.` })
        return existingCart
      }

      if (existing) {
        return existingCart.map((line) =>
          line.id === product.id ? { ...line, quantity: nextQuantity } : line
        )
      }

      return [...existingCart, { ...product, quantity: 1 }]
    })

    setSearchQuery('')
    setSearchResults([])
    setShowSearchResults(false)
  }, [])

  const updateQuantity = (productId: number, delta: number) => {
    setCart((existingCart) =>
      existingCart
        .map((line) => {
          if (line.id !== productId) return line
          const quantity = line.quantity + delta
          if (quantity > line.stock) {
            setNotice({ tone: 'error', text: `${line.name} has only ${line.stock} in stock.` })
            return line
          }
          return { ...line, quantity }
        })
        .filter((line) => line.quantity > 0)
    )
  }

  const setCartQuantity = (productId: number, rawQuantity: string) => {
    const trimmedQuantity = rawQuantity.trim()
    if (!trimmedQuantity) return

    const quantity = Number(trimmedQuantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      setNotice({ tone: 'error', text: 'Quantity must be a whole number greater than 0.' })
      return
    }

    const cartLine = cart.find((line) => line.id === productId)
    if (!cartLine) return

    const nextQuantity = Math.min(quantity, cartLine.stock)
    if (quantity > cartLine.stock) {
      setNotice({ tone: 'error', text: `${cartLine.name} has only ${cartLine.stock} in stock.` })
    }

    setCart((existingCart) =>
      existingCart.map((line) =>
        line.id === productId ? { ...line, quantity: nextQuantity } : line
      )
    )
  }

  const removeFromCart = (productId: number) => {
    setCart((existingCart) => existingCart.filter((line) => line.id !== productId))
  }

  const startPurchaseFlow = () => {
    if (cart.length === 0) {
      setNotice({ tone: 'error', text: 'Add at least one product before starting a purchase.' })
      return
    }

    if (!amountPaid.trim()) {
      setAmountPaid(total.toFixed(2))
    }

    setReceipt(null)
    setPurchaseStep('customer')
  }

  const completeSale = async () => {
    if (!user) {
      setNotice({ tone: 'error', text: 'Please sign in before completing a sale.' })
      return
    }

    if (!canComplete) {
      setNotice({ tone: 'error', text: missingBillItems[0] || 'Enter valid payment and account details before completing the sale.' })
      return
    }

    if (saleInFlight.current) return
    saleInFlight.current = true
    setIsProcessing(true)
    try {
    let cartForSale = cart
    if (window.api?.getProducts) {
      const latestProducts = normalizeProducts(await window.api.getProducts(), [])
      setProducts(latestProducts)
      const availabilityError = validateCartAvailability(cart, latestProducts)
      if (availabilityError) {
        setNotice({ tone: 'error', text: availabilityError })
        return
      }
      if (cart.some(line => latestProducts.find(p => p.id === line.id)?.price !== line.price)) {
        setCart(cart.map(line => ({ ...line, ...latestProducts.find(p => p.id === line.id) })))
        setNotice({ tone: 'error', text: 'Product prices changed. Review the updated bill before completing the sale.' })
        return
      }
      const latestById = new Map(latestProducts.map((product) => [product.id, product]))
      cartForSale = cart.map((line) => {
        const latest = latestById.get(line.id)
        return latest ? { ...line, name: latest.name, brand: latest.brand, category: latest.category, price: latest.price, stock: latest.stock } : line
      })
    }

    const saleSubtotal = cartForSale.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const saleDiscountAmount = roundMoney(saleSubtotal * (discountPercent / 100))
    const saleTaxableAmount = Math.max(0, saleSubtotal - saleDiscountAmount)
    const saleTaxAmount = roundMoney(saleTaxableAmount * (taxPercent / 100))
    const saleTotal = roundMoney(saleTaxableAmount + saleTaxAmount)
    const saleChangeDue = Math.max(0, paid - saleTotal)
    const saleAmountDue = roundMoney(Math.max(0, saleTotal - paid))
    const saleIsDebt = saleAmountDue > 0
    const accountNumberForSale = saleIsDebt ? customerAccountNumber.trim() : ''
    const customerNameForSale = saleIsDebt ? customerName.trim() : ''
    const customerFatherNameForSale = saleIsDebt ? customerFatherName.trim() : ''
    const customerPhoneForSale = saleIsDebt ? customerPhone.trim() : ''
    if (saleIsDebt && (!customerName.trim() || !customerFatherName.trim() || !isValidMobileNumber(customerPhone))) {
      setNotice({ tone: 'error', text: 'Account sale requires customer name, father name, and a valid mobile number.' })
      return
    }

    const receiptDraft: ReceiptSnapshot = {
      invoiceNumber: 'Pending',
      customerAccountNumber: accountNumberForSale || undefined,
      customerName: customerNameForSale || 'Walk-in customer',
      customerFatherName: customerFatherNameForSale,
      customerPhone: customerPhoneForSale,
      cashierName: user.fullName,
      createdAt: new Date().toISOString(),
      items: cartForSale.map((line) => ({ ...line })),
      subtotal: saleSubtotal,
      discountAmount: saleDiscountAmount,
      discountPercent,
      taxAmount: saleTaxAmount,
      taxPercent,
      total: saleTotal,
      paid,
      changeDue: saleChangeDue,
      amountDue: saleAmountDue,
      paymentStatus: saleIsDebt ? 'Pending' : 'Completed'
    }

    const saleRequest: CompleteSaleRequest = {
      userId: user.userId,
      customerAccountNumber: accountNumberForSale || undefined,
      customerName: customerNameForSale || undefined,
      customerFatherName: customerFatherNameForSale || undefined,
      customerPhone: customerPhoneForSale || undefined,
      cartItems: cartForSale.map((line) => ({
        productId: line.id,
        productName: line.name,
        unitPrice: line.price,
        quantity: line.quantity,
        lineDiscount: 0,
        availableStock: line.stock,
        lineTotal: line.price * line.quantity
      })),
      discountPercent,
      discountAmount: 0,
      taxPercent,
      paidAmount: paid,
      paymentMethod: 'Cash',
      notes: saleIsDebt
        ? `Account sale${accountNumberForSale ? ` for ${accountNumberForSale}` : ''}: ${receiptDraft.customerName}, father ${receiptDraft.customerFatherName}, mobile ${receiptDraft.customerPhone}. Sale recorded.`
        : `Walk-in cash sale.`
    }

    setNotice({ tone: 'info', text: 'Saving sale…' })
      if (window.api?.completeSale) {
        const response = (await window.api.completeSale(saleRequest)) as SaleResult
        if (!response.success) throw new Error(response.message)

        setLastInvoice(response.invoiceNumber ?? null)
        setReceipt({
          ...receiptDraft,
          invoiceNumber: response.invoiceNumber ?? 'Unknown',
          customerId: response.customerId,
          customerAccountNumber: response.customerAccountNumber ?? receiptDraft.customerAccountNumber,
          total: response.netTotal ?? receiptDraft.total,
          changeDue: response.changeAmount ?? receiptDraft.changeDue,
          amountDue: response.amountDue ?? receiptDraft.amountDue,
          paymentStatus: response.paymentStatus ?? receiptDraft.paymentStatus
        })
        setNotice({
          tone: response.paymentStatus === 'Pending' ? 'info' : 'success',
          text: `${response.message} ${response.invoiceNumber ? `Invoice ${response.invoiceNumber}` : ''}${response.amountDue ? ` · Due ${currency.format(response.amountDue)}` : ''}`.trim()
        })
      } else {
        throw new Error('Desktop connection unavailable. Sale was not saved.')
      }

      setCart([])
      setAmountPaid('')
      setCustomerAccountNumber('')
      setCustomerName('')
      setCustomerFatherName('')
      setCustomerPhone('')
      setDiscountPercent(0)
      setPurchaseStep('receipt')
      await loadProducts()
    } catch (error: any) {
      setNotice({ tone: 'error', text: error?.message ?? 'Sale failed. No partial sale was saved.' })
    } finally {
      saleInFlight.current = false
      setIsProcessing(false)
    }
  }

  if (!user) {
    const showSetup = setupChecked && setupRequired

    return (
      <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
          <section className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {!setupChecked ? (
              <div className="p-8 text-center text-slate-900 md:p-10">
                <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-indigo-600" />
                <h2 className="text-3xl font-semibold">Preparing</h2>
              </div>
            ) : showSetup ? (
              <form
                className="p-8 text-slate-900 md:p-10"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleInitialSetup()
                }}
              >
                <div className="mb-8 text-center">
                  <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-indigo-600" />
                  <h2 className="text-3xl font-semibold">Create admin</h2>
                </div>

                <label className="mb-4 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Username</span>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none ring-emerald-400 transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/25"
                    value={setupForm.username}
                    onChange={(event) => setSetupForm({ ...setupForm, username: event.target.value })}
                    autoComplete="username"
                  />
                </label>

                <label className="mb-4 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Full name</span>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none ring-emerald-400 transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/25"
                    value={setupForm.fullName}
                    onChange={(event) => setSetupForm({ ...setupForm, fullName: event.target.value })}
                    autoComplete="name"
                  />
                </label>

                <label className="mb-4 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Password</span>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none ring-emerald-400 transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/25"
                    type="password"
                    value={setupForm.plainPassword}
                    onChange={(event) => setSetupForm({ ...setupForm, plainPassword: event.target.value })}
                    autoComplete="new-password"
                  />
                </label>

                <label className="mb-4 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Confirm password</span>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none ring-emerald-400 transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/25"
                    type="password"
                    value={setupForm.confirmPassword}
                    onChange={(event) => setSetupForm({ ...setupForm, confirmPassword: event.target.value })}
                    autoComplete="new-password"
                  />
                </label>

                {setupMessage && (
                  <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
                    {setupMessage}
                  </p>
                )}

                <button disabled={isSettingUp} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
                  <ShieldCheck className="h-5 w-5" />
                  {isSettingUp ? 'Creating admin...' : 'Create admin'}
                </button>
              </form>
            ) : (
              <form
                className="p-8 text-slate-900 md:p-10"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleLogin()
                }}
              >
                <div className="mb-8 text-center">
                  <p className="mb-2 text-sm font-semibold text-indigo-600">SecureStore POS</p>
                  <h2 className="text-3xl font-semibold">Sign in</h2>
                  <p className="mt-2 text-sm text-slate-500">Manage your shop and serve your customers.</p>
                </div>

                <label className="mb-4 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Username</span>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none ring-emerald-400 transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/25"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                  />
                </label>

                <label className="mb-4 block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Password</span>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none ring-emerald-400 transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/25"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>

                {loginMessage && (
                  <p role="alert" className={`mb-4 rounded-xl border p-3 text-sm font-medium ${
                    loginMessageTone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}>
                    {loginMessage}
                  </p>
                )}

                <button disabled={isSigningIn} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm transition hover:bg-indigo-700">
                  <LogIn className="h-5 w-5" />
                  {isSigningIn ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-950">
      <aside className="no-print flex w-56 flex-col bg-slate-950 px-4 py-6 text-white shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-sm">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">SecureStore</p>
            <p className="text-xs font-semibold text-slate-400">POS System</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {accessibleNavItems.map((item) => (
            <button
              key={item.label}
              aria-current={activeScreen === item.id ? 'page' : undefined}
              onClick={() => setActiveScreen(item.id)}
              className={`flex h-12 items-center gap-3 rounded-xl px-3 text-left transition ${
                activeScreen === item.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
              title={item.label}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
        </nav>

        <button
          className="flex h-12 items-center gap-3 rounded-xl px-3 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
          onClick={handleLogout}
          title="Sign out"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm font-semibold">Sign out</span>
        </button>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="no-print flex h-20 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {accessibleNavItems.find((item) => item.id === activeScreen)?.label || 'Point of Sale'}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-bold text-cyan-700">
                <Clock className="h-3.5 w-3.5" />
                {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {dashboard
                ? `${dashboard.todayTransactions} sales today · ${currency.format(dashboard.todayRevenue)} received · ${currency.format(dashboard.todayNetSales ?? dashboard.todayRevenue)} net sales${dashboard.todayOutstanding ? ` · ${currency.format(dashboard.todayOutstanding)} due` : ''}`
                : 'Ready for checkout'}
            </p>
          </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                Local workspace
              </div>
              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => scrollActiveScreen('up')}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-white"
                >
                  Up
                </button>
                <button
                  onClick={() => scrollActiveScreen('down')}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-white"
                >
                  Down
                </button>
              </div>
              {activeScreen === 'checkout' && isAdmin && (
                <button
                  onClick={() => setActiveScreen('products')}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  Add / Manage Products
                </button>
              )}
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">
                {initials(user)}
              </div>
          </div>
        </header>

        <div
          ref={screenScrollRef}
          data-scroll-region="screen"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
        {activeScreen === 'account' && <AccountScreen user={user} />}
        {isAdmin && activeScreen === 'products' && <ProductsScreen userId={user.userId} />}
        {isAdmin && activeScreen === 'stock' && <StockScreen userId={user.userId} />}
        {isAdmin && activeScreen === 'debts' && <DebtsScreen />}
        {isAdmin && activeScreen === 'reports' && <ReportsScreen />}
        {isAdmin && activeScreen === 'backups' && <BackupScreen userId={user.userId} />}
        {isAdmin && activeScreen === 'users' && <UsersScreen userId={user.userId} />}
        {isAdmin && activeScreen === 'settings' && <SettingsScreen userId={user.userId} />}

        {activeScreen === 'checkout' && (
        <section ref={checkoutScrollRef} data-scroll-region="checkout" className="p-4">
        <div className="grid min-h-[780px] grid-cols-[minmax(0,1fr)_430px] gap-4">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="no-print flex gap-3">
              <div ref={searchRef} className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-14 w-full rounded-xl border-2 border-white bg-white pl-12 pr-4 text-base font-medium shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  placeholder="Search products by name, brand, or category..."
                  value={searchQuery}
                  onChange={(event) => searchProducts(event.target.value)}
                />

                {showSearchResults && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    {searchResults.length === 0 ? (
                      <div className="p-4 text-sm font-medium text-slate-500">No matching products found.</div>
                    ) : (
                      searchResults.map((product) => (
                        <button
                          key={product.id}
                          className="flex w-full items-center gap-4 border-b border-slate-100 p-4 text-left transition last:border-0 hover:bg-indigo-50"
                          onClick={() => addToCart(product)}
                        >
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-indigo-600">
                            <Package className="h-6 w-6" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold">{product.name}</span>
                            <span className="block truncate text-sm text-slate-500">
                              {product.brand || product.category} · {product.category}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-lg font-semibold text-indigo-600">{currency.format(product.price)}</span>
                            <span className="block text-xs font-semibold text-slate-500">{product.stock} in stock</span>
                          </span>
                          <ChevronRight className="h-5 w-5 text-slate-400" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

            </div>

            {notice && (
              <div
                role="status" aria-live="polite" className={`no-print flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${
                  notice.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : notice.tone === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-800'
                }`}
              >
                <span>{notice.text}</span>
                <button onClick={() => setNotice(null)} className="rounded-lg p-1 hover:bg-black/5">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white bg-white shadow-sm">
              <div className="no-print flex items-center justify-between border-b border-slate-100 bg-slate-50 p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Tag className="h-5 w-5 text-indigo-600" />
                  Quick Pick Items
                </h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
                  {products.length} products loaded
                </span>
              </div>

              <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-4 md:grid-cols-3 xl:grid-cols-4">
                {products.slice(0, 12).map((product) => (
                  <button
                    key={product.id}
                    className="group relative flex min-h-44 flex-col rounded-xl border-2 border-slate-100 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm"
                    onClick={() => addToCart(product)}
                  >
                    <span className="absolute right-3 top-3 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                      {product.category}
                    </span>
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-slate-500 transition  group-hover:text-indigo-600">
                      <Package className="h-7 w-7" />
                    </span>
                    <span className="block min-h-12 pr-12 text-sm font-semibold leading-snug">{product.name}</span>
                    <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                      {product.brand || 'General item'}
                    </span>
                    <span className="mt-auto flex items-end justify-between pt-4">
                      <span className="text-xl font-semibold text-indigo-600">{currency.format(product.price)}</span>
                      <span className="text-xs font-bold text-slate-500">{product.stock} left</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ShoppingCart className="h-5 w-5 text-indigo-600" />
                  Shopping Cart
                </h2>
                <span className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-semibold text-white">
                  {cartCount} items
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {cart.length === 0 ? (
                  <div className="flex h-full min-h-56 flex-col items-center justify-center p-8 text-center text-slate-400">
                    <ShoppingCart className="mb-4 h-12 w-12 opacity-40" />
                    <p className="font-bold">Cart is empty</p>
                    <p className="mt-1 text-sm">Search or select a product to start a sale.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {cart.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.name}</p>
                          <p className="text-sm font-semibold text-slate-500">{currency.format(item.price)} each</p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
                              onClick={() => updateQuantity(item.id, -1)}
                              aria-label={`Decrease ${item.name} quantity`}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <input
                              aria-label={`Quantity for ${item.name}`}
                              className="h-8 w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center font-semibold text-slate-950 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                              type="number"
                              min="1"
                              max={item.stock}
                              step="1"
                              inputMode="numeric"
                              value={item.quantity}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) => setCartQuantity(item.id, event.target.value)}
                            />
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => updateQuantity(item.id, 1)}
                              disabled={item.quantity >= item.stock}
                              aria-label={`Increase ${item.name} quantity`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                            <button
                              className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => removeFromCart(item.id)}
                              aria-label={`Remove ${item.name} from cart`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-right text-lg font-semibold text-indigo-600">
                          {currency.format(item.price * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Subtotal</span>
                  <span className="font-semibold">{currency.format(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-500">Discount</span>
                  <div className="flex items-center gap-2">
                    <input
                      className="h-9 w-20 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center font-bold outline-none focus:border-indigo-400"
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercent || ''}
                      onChange={(event) =>
                        setDiscountPercent(Math.min(100, Math.max(0, Number(event.target.value))))
                      }
                    />
                    <span className="font-bold text-slate-500">%</span>
                    <span className="w-20 text-right font-semibold text-emerald-600">
                      -{currency.format(discountAmount)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-500">Tax</span>
                  <div className="flex items-center gap-2">
                    <input
                      className="h-9 w-20 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center font-bold outline-none focus:border-cyan-400"
                      type="number"
                      min="0"
                      max="100"
                      value={taxPercent || ''}
                      onChange={(event) => setTaxPercent(Math.min(100, Math.max(0, Number(event.target.value))))}
                    />
                    <span className="font-bold text-slate-500">%</span>
                    <span className="w-20 text-right font-semibold">{currency.format(taxAmount)}</span>
                  </div>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-indigo-700 text-3xl font-semibold">
                    {currency.format(total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
              <div className="mb-4 rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Purchase flow</p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Start a purchase, enter customer details, review the bill, then print the receipt.
                </p>
                {cart.length === 0 && (
                  <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                    Add a product to the cart first. The Purchase button will then open customer details.
                  </p>
                )}
              </div>
              {lastInvoice && (
                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm font-bold text-indigo-800">
                  Last invoice: {lastInvoice}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mb-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">Payment</p>
                  <div className="flex h-10 items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">
                    <span>Cash only</span>
                    <span>Payment history is still recorded as Cash</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-lg font-semibold outline-none focus:border-emerald-400"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountPaid}
                      onChange={(event) => setAmountPaid(event.target.value)}
                      placeholder="Amount received"
                    />
                    <button
                      onClick={() => setAmountPaid(total.toFixed(2))}
                      className="h-11 rounded-xl bg-emerald-100 px-3 text-sm font-semibold text-emerald-700"
                    >
                      Exact
                    </button>
                  </div>
                  <div className={`flex justify-between rounded-xl px-3 py-2 text-sm font-semibold ${isDebtSale ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    <span>{isDebtSale ? 'To be paid' : 'Change due'}</span>
                    <span>{currency.format(isDebtSale ? amountDue : changeDue)}</span>
                  </div>
                  {isDebtSale && (
                    <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">Open customer account</p>
                        <p className="mt-1 text-xs font-bold text-amber-800">
                          Existing accounts are matched by Account ID or mobile number. New accounts receive a system ID automatically.
                        </p>
                      </div>
                      <input
                        className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold uppercase outline-none focus:border-indigo-400"
                        value={customerAccountNumber}
                        onChange={(event) => setCustomerAccountNumber(event.target.value.toUpperCase())}
                        placeholder="Existing Account ID optional"
                      />
                      <input
                        className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400"
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        placeholder="Customer name"
                      />
                      <input
                        className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400"
                        value={customerFatherName}
                        onChange={(event) => setCustomerFatherName(event.target.value)}
                        placeholder="Father name"
                      />
                      <input
                        className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400"
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value)}
                        placeholder="Mobile number"
                      />
                    </div>
                  )}
                  <div className={`rounded-xl border p-3 text-xs font-bold ${missingBillItems.length === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    <p className="mb-2 font-semibold">{missingBillItems.length === 0 ? 'Bill is ready to review.' : 'Missing before bill review:'}</p>
                    {missingBillItems.length === 0 ? (
                      <p>All required purchase details are complete.</p>
                    ) : (
                      <ul className="grid gap-1">
                        {missingBillItems.map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!receipt}
                  onClick={() => window.print()}
                >
                  <Printer className="h-5 w-5" />
                  Receipt
                </button>
                <button
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white shadow-sm transition hover:opacity-95"
                  onClick={() => {
                    if (cart.length === 0) {
                      startPurchaseFlow()
                      return
                    }
                    if (!hasValidPaidAmount) {
                      setNotice({ tone: 'error', text: 'Enter a valid amount received.' })
                      return
                    }
                    if (missingBillItems.length > 0) {
                      setNotice({ tone: 'error', text: missingBillItems[0] })
                      return
                    }
                    setPurchaseStep('bill')
                  }}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {cart.length === 0 ? 'Add Products First' : 'Review Bill'}
                </button>
              </div>
            </div>
          </aside>
        </div>
        </section>
        )}
        </div>
      </main>

      {receipt && <div className="print-receipt"><BillView {...receipt} storeSettings={storeSettings} title="Sale receipt" /></div>}

      {purchaseStep !== 'closed' && (
        <div role="dialog" aria-modal="true" aria-label="Purchase" className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  {purchaseStep === 'customer' && 'Step 1 of 3'}
                  {purchaseStep === 'bill' && 'Step 2 of 3'}
                  {purchaseStep === 'receipt' && 'Receipt ready'}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {purchaseStep === 'customer' && 'Customer details'}
                  {purchaseStep === 'bill' && 'Bill preview'}
                  {purchaseStep === 'receipt' && 'Purchase receipt'}
                </h2>
              </div>
              <button
                disabled={isProcessing} onClick={() => setPurchaseStep('closed')}
                className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div data-scroll-region="modal" tabIndex={0} className="max-h-[calc(92vh-96px)] overflow-auto p-5 outline-none">
              {purchaseStep === 'customer' && (
                <div className="grid gap-4">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-500">Cart total</p>
                    <p className="text-3xl font-semibold text-indigo-600">{currency.format(total)}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{cartCount} item(s) will be purchased.</p>
                  </div>
                  <div className="grid gap-2 text-sm font-bold text-slate-600">
                    Payment method
                    <div className="flex h-11 items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800">
                      <span>Cash only</span>
                      <span>Recorded in payment history</span>
                    </div>
                  </div>
                  <label className="grid gap-2 text-sm font-bold text-slate-600">
                    Amount received
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <input
                        className="h-12 rounded-xl border border-slate-200 px-4 text-xl font-semibold text-slate-950 outline-none focus:border-emerald-400"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountPaid}
                        onChange={(event) => setAmountPaid(event.target.value)}
                        placeholder="0.00"
                      />
                      <button
                        onClick={() => setAmountPaid(total.toFixed(2))}
                        className="h-12 rounded-xl bg-emerald-100 px-4 font-semibold text-emerald-700"
                      >
                        Exact
                      </button>
                    </div>
                  </label>
                  <div className={`flex items-center justify-between rounded-xl border p-4 ${isDebtSale ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'}`}>
                    <span className={`font-semibold ${isDebtSale ? 'text-amber-700' : 'text-emerald-700'}`}>{isDebtSale ? 'To be paid' : 'Change due'}</span>
                    <span className={`text-2xl font-semibold ${isDebtSale ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {currency.format(isDebtSale ? amountDue : changeDue)}
                    </span>
                  </div>
                  {isDebtSale && (
                    <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">Customer account details</p>
                      <input
                        className="h-11 rounded-xl border border-amber-200 bg-white px-4 text-base font-semibold uppercase text-slate-950 outline-none focus:border-indigo-400"
                        value={customerAccountNumber}
                        onChange={(event) => setCustomerAccountNumber(event.target.value.toUpperCase())}
                        placeholder="Existing Account ID optional"
                      />
                      <input
                        className="h-11 rounded-xl border border-amber-200 bg-white px-4 text-base font-semibold text-slate-950 outline-none focus:border-indigo-400"
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        placeholder="Customer name"
                      />
                      <input
                        className="h-11 rounded-xl border border-amber-200 bg-white px-4 text-base font-semibold text-slate-950 outline-none focus:border-indigo-400"
                        value={customerFatherName}
                        onChange={(event) => setCustomerFatherName(event.target.value)}
                        placeholder="Father name"
                      />
                      <input
                        className="h-11 rounded-xl border border-amber-200 bg-white px-4 text-base font-semibold text-slate-950 outline-none focus:border-indigo-400"
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value)}
                        placeholder="Mobile number"
                      />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (!hasValidPaidAmount) {
                        setNotice({ tone: 'error', text: 'Enter a valid amount received.' })
                        return
                      }
                      if (missingBillItems.length > 0) {
                        setNotice({ tone: 'error', text: missingBillItems[0] })
                        return
                      }
                      setPurchaseStep('bill')
                    }}
                    className="h-12 rounded-xl bg-indigo-600 font-semibold text-white"
                  >
                    Review Bill
                  </button>
                </div>
              )}

              {purchaseStep === 'bill' && (
                <div className="grid gap-4">
                  <BillView
                    storeSettings={storeSettings}
                    title="Bill Preview"
                    invoiceNumber="Not created yet"
                    customerId={undefined}
                    customerAccountNumber={isDebtSale ? customerAccountNumber.trim() || undefined : undefined}
                    customerName={isDebtSale ? customerName : ''}
                    customerFatherName={isDebtSale ? customerFatherName : ''}
                    customerPhone={isDebtSale ? customerPhone : ''}
                    cashierName={user.fullName}
                    items={cart}
                    subtotal={subtotal}
                    discountAmount={discountAmount}
                    discountPercent={discountPercent}
                    taxAmount={taxAmount}
                    taxPercent={taxPercent}
                    total={total}
                    paid={paid}
                    changeDue={changeDue}
                    amountDue={amountDue}
                    paymentStatus={isDebtSale ? 'Pending' : 'Completed'}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPurchaseStep('customer')}
                      className="h-12 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={completeSale}
                      disabled={!canComplete}
                      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white disabled:opacity-40"
                    >
                      {isProcessing && <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                      {isProcessing ? 'Saving...' : isDebtSale ? 'Save Debt Sale' : 'Complete Purchase'}
                    </button>
                  </div>
                </div>
              )}

              {purchaseStep === 'receipt' && receipt && (
                <div className="grid gap-4">
                  <BillView
                    storeSettings={storeSettings}
                    title="Receipt"
                    createdAt={receipt.createdAt}
                    invoiceNumber={receipt.invoiceNumber}
                    customerId={receipt.customerId}
                    customerAccountNumber={receipt.customerAccountNumber}
                    customerName={receipt.customerName}
                    customerFatherName={receipt.customerFatherName}
                    customerPhone={receipt.customerPhone}
                    cashierName={receipt.cashierName}
                    items={receipt.items}
                    subtotal={receipt.subtotal}
                    discountAmount={receipt.discountAmount}
                    discountPercent={receipt.discountPercent}
                    taxAmount={receipt.taxAmount}
                    taxPercent={receipt.taxPercent}
                    total={receipt.total}
                    paid={receipt.paid}
                    changeDue={receipt.changeDue}
                    amountDue={receipt.amountDue}
                    paymentStatus={receipt.paymentStatus}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      disabled={isProcessing} onClick={() => setPurchaseStep('closed')}
                      className="h-12 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 font-semibold text-white"
                    >
                      <Printer className="h-5 w-5" />
                      Print Receipt
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BillView({
  storeSettings,
  createdAt,
  title,
  invoiceNumber,
  customerId,
  customerAccountNumber,
  customerName,
  customerFatherName,
  customerPhone,
  cashierName,
  items,
  subtotal,
  discountAmount,
  discountPercent,
  taxAmount,
  taxPercent,
  total,
  paid,
  changeDue,
  amountDue,
  paymentStatus
}: {
  storeSettings: StoreSettings
  createdAt?: string
  title: string
  invoiceNumber: string
  customerId?: number
  customerAccountNumber?: string
  customerName: string
  customerFatherName: string
  customerPhone: string
  cashierName: string
  items: CartLine[]
  subtotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  taxPercent: number
  total: number
  paid: number
  changeDue: number
  amountDue: number
  paymentStatus: PaymentStatus
}) {
  const hasDebt = paymentStatus === 'Pending' && amountDue > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between border-b border-slate-100 pb-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">{storeSettings.ShopName}</p>
          <h3 className="mt-1 text-2xl font-semibold">{title}</h3>
          {storeSettings.ReceiptHeaderMessage && (
            <p className="mt-1 text-sm font-semibold text-slate-600">{storeSettings.ReceiptHeaderMessage}</p>
          )}
          <p className="mt-1 text-sm font-semibold text-slate-500">Invoice: {invoiceNumber}</p>
          {storeSettings.ReceiptShowAddress !== 'false' && storeSettings.ShopAddress && (
            <p className="mt-1 max-w-sm text-sm font-semibold text-slate-500">{storeSettings.ShopAddress}</p>
          )}
          {storeSettings.ReceiptShowPhone !== 'false' && storeSettings.ShopPhone && (
            <p className="text-sm font-semibold text-slate-500">Phone: {storeSettings.ShopPhone}</p>
          )}
          {storeSettings.ShopEmail && <p className="text-sm font-semibold text-slate-500">{storeSettings.ShopEmail}</p>}
        </div>
        <div className="text-right text-sm font-semibold text-slate-500">
          <p>{new Date(createdAt || Date.now()).toLocaleString()}</p>
          <p>Cashier: {cashierName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 py-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold text-slate-500">Customer</p>
          <p className="font-semibold text-slate-950">{customerName}</p>
          {customerAccountNumber && <p className="font-semibold text-indigo-600">Account {customerAccountNumber}</p>}
          {customerId && <p className="font-semibold text-indigo-600">ID #{customerId}</p>}
          {customerFatherName && <p className="font-semibold text-slate-500">Father: {customerFatherName}</p>}
          {customerPhone && <p className="font-semibold text-slate-500">{customerPhone}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold text-slate-500">Payment</p>
          <p className="font-semibold text-slate-950">{hasDebt ? 'Debt sale' : 'Cash purchase'}</p>
          <p className="font-semibold text-slate-500">Paid {currency.format(paid)}</p>
          {hasDebt && <p className="font-semibold text-amber-700">To be paid {currency.format(amountDue)}</p>}
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-3 font-bold">{item.name}</td>
              <td className="px-3 py-3 text-right font-semibold">{item.quantity}</td>
              <td className="px-3 py-3 text-right font-semibold">{currency.format(item.price)}</td>
              <td className="px-3 py-3 text-right font-semibold">{currency.format(item.price * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 grid max-w-sm gap-2 text-sm">
        <div className="flex justify-between"><span className="font-semibold text-slate-500">Subtotal</span><span className="font-semibold">{currency.format(subtotal)}</span></div>
        <div className="flex justify-between"><span className="font-semibold text-slate-500">Discount ({discountPercent}%)</span><span className="font-semibold text-emerald-700">-{currency.format(discountAmount)}</span></div>
        <div className="flex justify-between"><span className="font-semibold text-slate-500">Tax ({taxPercent}%)</span><span className="font-semibold">{currency.format(taxAmount)}</span></div>
        <div className="h-px bg-slate-100" />
        <div className="flex justify-between text-lg"><span className="font-semibold">Total</span><span className="font-semibold text-indigo-600">{currency.format(total)}</span></div>
        <div className="flex justify-between"><span className="font-semibold text-slate-500">Paid</span><span className="font-semibold">{currency.format(paid)}</span></div>
        {hasDebt ? (
          <div className="flex justify-between"><span className="font-semibold text-slate-500">To be paid</span><span className="font-semibold text-amber-700">{currency.format(amountDue)}</span></div>
        ) : (
          <div className="flex justify-between"><span className="font-semibold text-slate-500">Change</span><span className="font-semibold text-emerald-700">{currency.format(changeDue)}</span></div>
        )}
      </div>
      {storeSettings.ReceiptFooterMessage && (
        <p className="mt-5 rounded-xl bg-slate-50 p-3 text-center text-sm font-bold text-slate-600">
          {storeSettings.ReceiptFooterMessage}
        </p>
      )}
    </div>
  )
}
