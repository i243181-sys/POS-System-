"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Barcode,
  ShoppingCart,
  Banknote,
  Printer,
  Plus,
  Minus,
  Trash2,
  Home,
  Package,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  Sparkles,
  Tag,
  Clock,
  CheckCircle2,
} from "lucide-react";

// Types for Electron API
declare global {
  interface Window {
    api: {
      searchProducts: (query: string) => Promise<Product[]>;
      completeSale: (sale: SaleData) => Promise<{ success: boolean; receiptId: string }>;
    };
  }
}

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  category: string;
  image?: string;
  stock: number;
}

interface CartItem extends Product {
  quantity: number;
}

interface SaleData {
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: "cash";
  amountPaid: number;
  changeDue: number;
}

// Mock products for demo (in production, these would come from window.api)
const mockProducts: Product[] = [
  { id: "1", name: "Premium Coffee Beans", price: 24.99, sku: "COF001", category: "Beverages", stock: 45 },
  { id: "2", name: "Organic Green Tea", price: 12.49, sku: "TEA002", category: "Beverages", stock: 32 },
  { id: "3", name: "Artisan Bread Loaf", price: 6.99, sku: "BRD003", category: "Bakery", stock: 18 },
  { id: "4", name: "Fresh Orange Juice", price: 8.99, sku: "JUI004", category: "Beverages", stock: 24 },
  { id: "5", name: "Chocolate Croissant", price: 4.49, sku: "PAS005", category: "Bakery", stock: 36 },
  { id: "6", name: "Almond Milk 1L", price: 5.99, sku: "MLK006", category: "Dairy", stock: 52 },
  { id: "7", name: "Greek Yogurt", price: 7.49, sku: "YOG007", category: "Dairy", stock: 28 },
  { id: "8", name: "Granola Mix", price: 9.99, sku: "GRA008", category: "Snacks", stock: 41 },
];

const quickPickProducts = mockProducts.slice(0, 8);

// Sidebar navigation items
const navItems = [
  { icon: Home, label: "Dashboard", active: false },
  { icon: ShoppingCart, label: "Checkout", active: true },
  { icon: Package, label: "Inventory", active: false },
  { icon: Users, label: "Customers", active: false },
  { icon: BarChart3, label: "Reports", active: false },
  { icon: Settings, label: "Settings", active: false },
];

export default function POSCheckout() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saleComplete, setSaleComplete] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = subtotal * (discountPercent / 100);
  const taxRate = 0.0875; // 8.75% tax
  const tax = (subtotal - discount) * taxRate;
  const total = subtotal - discount + tax;
  const changeDue = Math.max(0, parseFloat(amountPaid || "0") - total);

  // Search products - uses window.api in Electron, falls back to mock
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      if (window.api?.searchProducts) {
        const results = await window.api.searchProducts(query);
        setSearchResults(results);
      } else {
        // Fallback for demo
        const results = mockProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.sku.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(results);
      }
      setShowSearchResults(true);
    } catch (error) {
      console.error("[v0] Search error:", error);
    }
  }, []);

  // Add product to cart
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setShowSearchResults(false);
    setSearchQuery("");
  }, []);

  // Handle barcode scan
  const handleBarcodeScan = useCallback((sku: string) => {
    const product = mockProducts.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
    if (product) {
      addToCart(product);
      setBarcodeInput("");
    }
  }, [addToCart]);

  // Update quantity
  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  // Remove from cart
  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  // Complete sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    if (parseFloat(amountPaid || "0") < total) return;

    setIsProcessing(true);

    const saleData: SaleData = {
      items: cart,
      subtotal,
      tax,
      discount,
      total,
      paymentMethod: "cash",
      amountPaid: parseFloat(amountPaid || "0"),
      changeDue,
    };

    try {
      if (window.api?.completeSale) {
        await window.api.completeSale(saleData);
      }
      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSaleComplete(true);
      setTimeout(() => {
        setCart([]);
        setAmountPaid("");
        setDiscountPercent(0);
        setSaleComplete(false);
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      console.error("[v0] Sale error:", error);
      setIsProcessing(false);
    }
  };

  // Handle print receipt
  const handlePrintReceipt = () => {
    console.log("[v0] Printing receipt...");
  };

  // Click outside to close search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Beverages: "bg-primary/10 text-primary border-primary/20",
      Bakery: "bg-accent/20 text-accent-foreground border-accent/30",
      Dairy: "bg-secondary/10 text-secondary border-secondary/20",
      Snacks: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    };
    return colors[category] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-20 bg-sidebar flex flex-col items-center py-6 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-8 shadow-lg">
          <Sparkles className="w-6 h-6 text-primary-foreground" />
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item, index) => (
            <button
              key={index}
              className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${
                item.active
                  ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="absolute left-full ml-3 px-3 py-1.5 bg-card text-card-foreground text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg pointer-events-none">
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <button className="w-14 h-14 rounded-xl flex items-center justify-center text-sidebar-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-all duration-200">
          <LogOut className="w-5 h-5" />
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-foreground">Point of Sale</h1>
            <Badge variant="outline" className="gap-1.5 border-secondary/30 text-secondary">
              <Clock className="w-3 h-3" />
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 rounded-full">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-success">Terminal Active</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground font-semibold">
              JD
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden p-4 gap-4">
          {/* Left Panel - Products */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Search Section */}
            <div className="flex gap-3">
              {/* Product Search */}
              <div ref={searchRef} className="flex-1 relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search products by name or SKU..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-12 h-12 text-base bg-card border-2 border-border focus:border-primary rounded-xl shadow-sm"
                  />
                </div>
                {/* Search Results Dropdown */}
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-card border-2 border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <ScrollArea className="max-h-80">
                      {searchResults.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors border-b border-border last:border-0"
                        >
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-semibold text-foreground">{product.name}</p>
                            <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-primary">${product.price.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">{product.stock} in stock</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </div>

              {/* Barcode Scanner */}
              <div className="relative w-64">
                <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Scan barcode..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBarcodeScan(barcodeInput)}
                  className="pl-12 h-12 text-base bg-card border-2 border-border focus:border-secondary rounded-xl shadow-sm font-mono"
                />
              </div>
            </div>

            {/* Quick Pick Products */}
            <Card className="flex-1 overflow-hidden border-2 shadow-lg">
              <CardHeader className="pb-3 border-b border-border bg-gradient-to-r from-muted/50 to-transparent">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Tag className="w-5 h-5 text-primary" />
                  Quick Pick Items
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-4 gap-3 h-full">
                  {quickPickProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="group relative p-4 bg-card border-2 border-border rounded-xl hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 flex flex-col"
                    >
                      <div className="absolute top-2 right-2">
                        <Badge className={`text-xs ${getCategoryColor(product.category)}`}>
                          {product.category}
                        </Badge>
                      </div>
                      <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-muted to-muted/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Package className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold text-sm text-foreground text-center leading-tight mb-2 line-clamp-2">
                        {product.name}
                      </h3>
                      <div className="mt-auto">
                        <p className="text-lg font-bold text-primary text-center">
                          ${product.price.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          {product.stock} available
                        </p>
                      </div>
                      <div className="absolute inset-0 bg-primary/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Cart & Checkout */}
          <div className="w-[420px] flex flex-col gap-4">
            {/* Cart */}
            <Card className="flex-1 flex flex-col overflow-hidden border-2 shadow-lg">
              <CardHeader className="pb-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Shopping Cart
                  </span>
                  <Badge className="bg-primary text-primary-foreground">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)} items
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                      <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm">Cart is empty</p>
                      <p className="text-xs mt-1">Add items to get started</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {cart.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-muted to-muted/30 flex items-center justify-center flex-shrink-0">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {item.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              ${item.price.toFixed(2)} each
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="h-8 w-8 rounded-lg"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center font-bold text-foreground">
                              {item.quantity}
                            </span>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => updateQuantity(item.id, 1)}
                              className="h-8 w-8 rounded-lg"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="text-right w-20">
                            <p className="font-bold text-primary">
                              ${(item.price * item.quantity).toFixed(2)}
                            </p>
                          </div>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Order Summary */}
            <Card className="border-2 shadow-lg">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Discount</span>
                    <Input
                      type="number"
                      value={discountPercent || ""}
                      onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-16 h-7 text-xs text-center"
                      placeholder="0"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <span className="font-medium text-secondary">-${discount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tax (8.75%)</span>
                  <span className="font-medium text-foreground">${tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-foreground">Total</span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    ${total.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Payment Section */}
            <Card className="border-2 shadow-lg">
              <CardContent className="p-4 space-y-4">
                <div className="flex h-12 items-center justify-between rounded-xl border border-success/20 bg-success/10 px-4 font-semibold text-success">
                  <span className="flex items-center gap-2">
                    <Banknote className="w-5 h-5" />
                    Cash only
                  </span>
                  <span className="text-sm">Recorded in payment history</span>
                </div>

                <div className="space-y-3 p-3 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Amount Paid</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        className="pl-7 h-10 font-mono text-lg"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg border border-success/20">
                    <span className="text-sm font-medium text-success">Change Due</span>
                    <span className="text-xl font-bold text-success">
                      ${changeDue.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handlePrintReceipt}
                    variant="outline"
                    className="h-12 px-4 rounded-xl gap-2"
                    disabled={cart.length === 0}
                  >
                    <Printer className="w-4 h-4" />
                    Receipt
                  </Button>
                  <Button
                    onClick={handleCompleteSale}
                    disabled={
                      cart.length === 0 ||
                      isProcessing ||
                      parseFloat(amountPaid || "0") < total
                    }
                    className="flex-1 h-12 rounded-xl gap-2 text-base font-semibold bg-gradient-to-r from-primary via-primary to-secondary hover:opacity-90 transition-opacity shadow-lg shadow-primary/30"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : saleComplete ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Complete!
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Complete Sale
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
