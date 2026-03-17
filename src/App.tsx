import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Activity, 
  MessageSquare, 
  Send, 
  Cpu, 
  RefreshCw,
  BarChart3,
  History,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ChevronLeft,
  Bot,
  X,
  CreditCard,
  Smartphone,
  CheckCircle2
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { analyzeMarket, chatWithAI } from './services/gemini';
import { PricePoint, Trade, Portfolio, MarketSignal } from './types';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Mock Data Generator ---
const generateInitialData = (count: number): PricePoint[] => {
  let basePrice = 45000;
  return Array.from({ length: count }).map((_, i) => {
    basePrice += (Math.random() - 0.5) * 200;
    return {
      time: format(new Date(Date.now() - (count - i) * 60000), 'HH:mm'),
      price: basePrice,
      volume: Math.floor(Math.random() * 100) + 20
    };
  });
};

export default function App() {
  // State
  const [data, setData] = useState<PricePoint[]>(generateInitialData(50));
  const [portfolio, setPortfolio] = useState<Portfolio>({
    balance: 0,
    positions: []
  });
  const [signal, setSignal] = useState<MarketSignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Welcome to AI Trading Terminal. How can I help you analyze the markets today?' }
  ]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chart' | 'history' | 'ai'>('chart');
  const [tpInput, setTpInput] = useState<string>('');
  const [slInput, setSlInput] = useState<string>('');
  const [isAutoBotRunning, setIsAutoBotRunning] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(10);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const isSyncingRef = useRef(false);

  // User Settings State
  const [userSettings, setUserSettings] = useState({
    defaultTpPercent: 1.5,
    defaultSlPercent: 1.0,
    autoBotEnabled: false
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempSettings, setTempSettings] = useState(userSettings);

  // Deposit Modal State
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1000');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple' | 'google'>('card');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync Listener
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const unsubPortfolio = onSnapshot(doc(db, 'portfolios', user.uid), (docSnap) => {
      if (docSnap.exists() && !isSyncingRef.current) {
        const data = docSnap.data();
        setPortfolio({
          balance: data.balance || 0,
          positions: data.positions || []
        });
        setSyncStatus('synced');
      }
    }, (error) => {
      console.error("Firestore Error (portfolios):", error);
      setSyncStatus('error');
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (docSnap) => {
      if (docSnap.exists() && !isSyncingRef.current) {
        const data = docSnap.data();
        setIsAutoBotRunning(data.autoBotEnabled || false);
        const settings = {
          defaultTpPercent: data.defaultTpPercent || 1.5,
          defaultSlPercent: data.defaultSlPercent || 1.0,
          autoBotEnabled: data.autoBotEnabled || false
        };
        setUserSettings(settings);
        setTempSettings(settings);
        setSyncStatus('synced');
      }
    }, (error) => {
      console.error("Firestore Error (settings):", error);
      setSyncStatus('error');
    });

    return () => {
      unsubPortfolio();
      unsubSettings();
    };
  }, [user, isAuthReady]); // Removed isSyncing from deps to avoid re-triggering

  // Sync Portfolio to Firestore
  const syncPortfolioToDb = async (newPortfolio: Portfolio) => {
    if (!user) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    try {
      await setDoc(doc(db, 'portfolios', user.uid), {
        uid: user.uid,
        balance: newPortfolio.balance,
        positions: newPortfolio.positions,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSyncStatus('synced');
    } catch (error) {
      console.error("Error syncing portfolio:", error);
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Sync Settings to Firestore
  const syncSettingsToDb = async (autoBot: boolean, newSettings?: typeof userSettings) => {
    if (!user) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    const settingsToSave = newSettings || userSettings;
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        uid: user.uid,
        autoBotEnabled: autoBot,
        defaultTpPercent: settingsToSave.defaultTpPercent,
        defaultSlPercent: settingsToSave.defaultSlPercent,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSyncStatus('synced');
    } catch (error) {
      console.error("Error syncing settings:", error);
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  };

  const handleSaveSettings = async () => {
    setUserSettings(tempSettings);
    setIsAutoBotRunning(tempSettings.autoBotEnabled);
    await syncSettingsToDb(tempSettings.autoBotEnabled, tempSettings);
    setShowSettingsModal(false);
  };

  // Handle Deposit
  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    setIsProcessingPayment(true);
    
    // Simulate payment gateway delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newPortfolio = {
      ...portfolio,
      balance: portfolio.balance + amount
    };
    
    setPortfolio(newPortfolio);
    await syncPortfolioToDb(newPortfolio);
    
    setIsProcessingPayment(false);
    setShowDepositModal(false);
    setDepositAmount('1000');
    
    setMessages(prev => [...prev, { 
      role: 'ai', 
      text: `[SYSTEM] Successfully deposited $${amount.toLocaleString()} via ${paymentMethod.toUpperCase()}.` 
    }]);
  };

  // Simulation: Update price every 3 seconds and check TP/SL
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const lastPrice = prev[prev.length - 1].price;
        const newPrice = lastPrice + (Math.random() - 0.5) * 150;
        const newData = [...prev.slice(1), {
          time: format(new Date(), 'HH:mm:ss'),
          price: newPrice,
          volume: Math.floor(Math.random() * 100) + 20
        }];
        return newData;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Check TP/SL logic
  useEffect(() => {
    const currentPrice = data[data.length - 1].price;
    const openPositions = portfolio.positions.filter(p => p.status === 'OPEN');
    
    if (openPositions.length === 0) return;

    let balanceAdjustment = 0;
    let positionsUpdated = false;
    const newPositions = portfolio.positions.map(pos => {
      if (pos.status !== 'OPEN') return pos;

      let shouldClose = false;
      let reason = '';

      const profit = pos.type === 'BUY' 
        ? (currentPrice - pos.price) * pos.amount 
        : (pos.price - currentPrice) * pos.amount;

      if (isAutoBotRunning && profit > 0.5) {
        shouldClose = true;
        reason = 'Auto-Bot Profit Taker';
      } else if (pos.type === 'BUY') {
        if (pos.takeProfit && currentPrice >= pos.takeProfit) {
          shouldClose = true;
          reason = 'Take Profit';
        } else if (pos.stopLoss && currentPrice <= pos.stopLoss) {
          shouldClose = true;
          reason = 'Stop Loss';
        }
      } else { // SELL (Short)
        if (pos.takeProfit && currentPrice <= pos.takeProfit) {
          shouldClose = true;
          reason = 'Take Profit';
        } else if (pos.stopLoss && currentPrice >= pos.stopLoss) {
          shouldClose = true;
          reason = 'Stop Loss';
        }
      }

      if (shouldClose) {
        positionsUpdated = true;
        
        if (pos.type === 'BUY') {
          balanceAdjustment += (pos.amount * currentPrice);
        } else {
          balanceAdjustment -= (pos.amount * currentPrice);
        }
        
        // Add a notification to chat
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: `[AUTO-TRADE] Position ${pos.id} closed via ${reason} at $${currentPrice.toLocaleString()}. Profit: $${profit.toFixed(2)}` 
        }]);

        return { ...pos, status: 'CLOSED' as const, profit };
      }
      return pos;
    });

    if (positionsUpdated) {
      const newPortfolio = {
        balance: portfolio.balance + balanceAdjustment,
        positions: newPositions
      };
      setPortfolio(newPortfolio);
      syncPortfolioToDb(newPortfolio);
    }
  }, [data, isAutoBotRunning, portfolio]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Trading Actions
  const executeTrade = (type: 'BUY' | 'SELL', autoTp?: number, autoSl?: number) => {
    const currentPrice = data[data.length - 1].price;
    const amount = 0.1; // Fixed amount for demo
    const cost = currentPrice * amount;

    if (type === 'BUY' && portfolio.balance < cost) return;
    
    let takeProfit = autoTp !== undefined ? autoTp : (tpInput ? parseFloat(tpInput) : undefined);
    let stopLoss = autoSl !== undefined ? autoSl : (slInput ? parseFloat(slInput) : undefined);

    // Apply defaults if not explicitly provided
    if (takeProfit === undefined || isNaN(takeProfit)) {
      takeProfit = type === 'BUY' 
        ? currentPrice * (1 + userSettings.defaultTpPercent / 100)
        : currentPrice * (1 - userSettings.defaultTpPercent / 100);
    }

    if (stopLoss === undefined || isNaN(stopLoss)) {
      stopLoss = type === 'BUY'
        ? currentPrice * (1 - userSettings.defaultSlPercent / 100)
        : currentPrice * (1 + userSettings.defaultSlPercent / 100);
    }

    const newTrade: Trade = {
      id: Math.random().toString(36).substr(2, 9),
      symbol: 'BTC/USD',
      type,
      price: currentPrice,
      amount,
      timestamp: Date.now(),
      status: 'OPEN',
      takeProfit,
      stopLoss
    };

    const newPortfolio = {
      balance: type === 'BUY' ? portfolio.balance - cost : portfolio.balance + cost,
      positions: [newTrade, ...portfolio.positions]
    };

    setPortfolio(newPortfolio);
    syncPortfolioToDb(newPortfolio);

    // Clear inputs
    setTpInput('');
    setSlInput('');
  };

  // AI Analysis Trigger
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await analyzeMarket('BTC/USD', data);
    setSignal({
      symbol: 'BTC/USD',
      recommendation: result.recommendation || 'HOLD',
      rationale: result.rationale || 'Market showing neutral momentum.',
      confidence: result.confidence || 50,
      timestamp: Date.now()
    });
    
    const currentPrice = data[data.length - 1].price;

    // Auto-execute trade based on AI recommendation
    if (result.recommendation === 'BUY') {
      const tp = currentPrice * 1.015; // 1.5% take profit
      const sl = currentPrice * 0.99;  // 1% stop loss
      executeTrade('BUY', tp, sl);
      
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: `[AUTO-EXECUTION] Executed BUY order at $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} based on AI signal. TP: $${tp.toFixed(2)}, SL: $${sl.toFixed(2)}` 
      }]);
    }
    
    setIsAnalyzing(false);
  };

  // Auto-Bot Loop
  useEffect(() => {
    if (!isAutoBotRunning) return;
    
    const openPositions = portfolio.positions.filter(p => p.status === 'OPEN');
    if (openPositions.length === 0 && !isAnalyzing) {
      handleAnalyze();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isAutoBotRunning]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);

    const aiResponse = await chatWithAI(userMsg, { currentPrice: data[data.length - 1].price });
    setMessages(prev => [...prev, { role: 'ai', text: aiResponse || 'Connection lost.' }]);
  };

  const currentPrice = data[data.length - 1].price;
  const priceChange = currentPrice - data[0].price;
  const priceChangePct = (priceChange / data[0].price) * 100;

  // Real-time Portfolio Value Calculation
  const portfolioStats = useMemo(() => {
    const openPositions = portfolio.positions.filter(p => p.status === 'OPEN');
    const unrealizedPnL = openPositions.reduce((acc, pos) => {
      const pnl = pos.type === 'BUY' 
        ? (currentPrice - pos.price) * pos.amount 
        : (pos.price - currentPrice) * pos.amount;
      return acc + pnl;
    }, 0);

    // Initial investment in open positions
    const marginInTrade = openPositions.reduce((acc, pos) => acc + (pos.price * pos.amount), 0);
    
    // Total Value = Current Balance + Initial Margin + Unrealized PnL
    // Note: In our simple simulation, BUY subtracts from balance, SELL adds.
    // So for BUY: Value = Balance + (EntryPrice * Amt) + PnL = Balance + (CurrentPrice * Amt)
    // For SELL: Value = Balance - (EntryPrice * Amt) + PnL = Balance - (CurrentPrice * Amt)
    
    const totalValue = portfolio.balance + openPositions.reduce((acc, pos) => {
      return acc + (pos.type === 'BUY' ? (pos.amount * currentPrice) : -(pos.amount * currentPrice));
    }, 0);

    return {
      unrealizedPnL,
      totalValue
    };
  }, [portfolio.balance, portfolio.positions, currentPrice]);

  // Pagination Logic
  const totalTrades = portfolio.positions.length;
  const totalPages = Math.max(1, Math.ceil(totalTrades / tradesPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const indexOfLastTrade = safeCurrentPage * tradesPerPage;
  const indexOfFirstTrade = indexOfLastTrade - tradesPerPage;
  const currentTrades = portfolio.positions.slice(indexOfFirstTrade, indexOfLastTrade);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-trading-bg text-white flex items-center justify-center">
        <Cpu className="w-12 h-12 text-blue-500 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-trading-bg text-white flex items-center justify-center p-6">
        <div className="bg-trading-card border border-trading-border p-8 rounded-2xl max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-600/20">
            <Cpu className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">AI Trading Terminal</h1>
            <p className="text-zinc-400 text-sm">Sign in to access your portfolio, run AI analysis, and automate your trades.</p>
          </div>
          <button 
            onClick={loginWithGoogle}
            className="w-full bg-white text-black hover:bg-zinc-200 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-trading-bg text-white font-sans selection:bg-blue-500/30 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-trading-border flex items-center justify-between px-6 sticky top-0 bg-trading-bg/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">AI TERMINAL</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Live Market Data</span>
              
              <div className="w-px h-3 bg-zinc-700 mx-1" />
              
              <div className="flex items-center gap-1.5">
                {syncStatus === 'syncing' ? (
                  <>
                    <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                    <span className="text-[10px] text-blue-400 font-mono uppercase tracking-widest">Syncing...</span>
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                    <span className="text-[10px] text-red-500 font-mono uppercase tracking-widest">Sync Error</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-500 font-mono uppercase tracking-widest">Up to Date</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase font-mono tracking-tighter">BTC / USD</p>
              <p className={cn(
                "font-mono font-bold text-lg",
                priceChange >= 0 ? "text-trading-up" : "text-trading-down"
              )}>
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={cn(
              "px-2 py-1 rounded text-xs font-mono flex items-center gap-1",
              priceChange >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>
              {priceChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {priceChangePct.toFixed(2)}%
            </div>
          </div>

          <div className="h-8 w-[1px] bg-trading-border" />

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase font-mono">Total Value</p>
              <p className="font-mono font-bold text-white text-lg">${portfolioStats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right border-l border-trading-border pl-6">
              <p className="text-[10px] text-zinc-500 uppercase font-mono">Available</p>
              <div className="flex items-center gap-2">
                <p className="font-mono font-bold text-blue-400">${portfolio.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <button 
                  onClick={() => setShowDepositModal(true)}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold transition-colors"
                >
                  DEPOSIT
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setTempSettings({
                    ...userSettings,
                    autoBotEnabled: isAutoBotRunning
                  });
                  setShowSettingsModal(true);
                }}
                className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-trading-border hover:bg-zinc-700 transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5 text-zinc-400" />
              </button>
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-trading-border overflow-hidden cursor-pointer" onClick={logout} title="Sign Out">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Wallet className="w-5 h-5 text-zinc-400" />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] w-full mx-auto">
        {/* Left Column: Market & Analysis */}
        <div className="lg:col-span-8 flex flex-col gap-6 min-h-0">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: '24h High', value: '$48,230', icon: ArrowUpRight, color: 'text-emerald-500' },
              { label: '24h Low', value: '$44,120', icon: ArrowDownRight, color: 'text-red-500' },
              { label: 'Unrealized PnL', value: `$${portfolioStats.unrealizedPnL.toFixed(2)}`, icon: Activity, color: portfolioStats.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-red-500' },
              { label: 'Volume', value: '1.2B', icon: Activity, color: 'text-blue-500' },
              { label: 'Market Cap', value: '890B', icon: BarChart3, color: 'text-zinc-400' },
            ].map((stat, i) => (
              <div key={i} className="bg-trading-card border border-trading-border p-4 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">{stat.label}</span>
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
                <p className="text-lg font-bold font-mono">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Main Chart Container */}
          <div className="bg-trading-card border border-trading-border rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="p-4 border-b border-trading-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveTab('chart')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'chart' ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"
                  )}
                >
                  Live Chart
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'history' ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"
                  )}
                >
                  Order History
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-mono">1m Interval</span>
                <RefreshCw className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white transition-colors" />
              </div>
            </div>

            <div className="flex-1 min-h-0 p-4">
              {activeTab === 'chart' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      minTickGap={30}
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `$${val.toLocaleString()}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#141416', border: '1px solid #232326', borderRadius: '8px' }}
                      itemStyle={{ color: '#3b82f6', fontSize: '12px' }}
                      labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorPrice)" 
                      animationDuration={300}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-sm">
                      <thead className="text-zinc-500 uppercase text-[10px] font-mono sticky top-0 bg-trading-card z-10">
                        <tr>
                          <th className="pb-4 font-medium">Time</th>
                          <th className="pb-4 font-medium">Type</th>
                          <th className="pb-4 font-medium">Entry</th>
                          <th className="pb-4 font-medium">TP / SL</th>
                          <th className="pb-4 font-medium">Profit</th>
                          <th className="pb-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-trading-border">
                        {currentTrades.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-zinc-500 italic">No trades executed yet</td>
                          </tr>
                        ) : (
                          currentTrades.map((trade) => (
                            <tr key={trade.id} className="group hover:bg-white/5 transition-colors">
                              <td className="py-3 font-mono text-zinc-400">{format(trade.timestamp, 'HH:mm:ss')}</td>
                              <td className="py-3">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold",
                                  trade.type === 'BUY' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                )}>
                                  {trade.type}
                                </span>
                              </td>
                              <td className="py-3 font-mono">${trade.price.toLocaleString()}</td>
                              <td className="py-3 font-mono text-[10px]">
                                <div className="flex flex-col">
                                  <span className="text-emerald-500">T: {trade.takeProfit ? `$${trade.takeProfit.toLocaleString()}` : '—'}</span>
                                  <span className="text-red-500">S: {trade.stopLoss ? `$${trade.stopLoss.toLocaleString()}` : '—'}</span>
                                </div>
                              </td>
                              <td className={cn(
                                "py-3 font-mono",
                                trade.profit && trade.profit > 0 ? "text-emerald-500" : 
                                trade.profit && trade.profit < 0 ? "text-red-500" : "text-zinc-500"
                              )}>
                                {trade.profit ? `$${trade.profit.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-3">
                                <span className={cn(
                                  "text-xs",
                                  trade.status === 'OPEN' ? "text-blue-400 animate-pulse" : "text-zinc-500"
                                )}>
                                  {trade.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination Footer */}
                  {totalTrades > 0 && (
                    <div className="flex items-center justify-between pt-4 mt-2 border-t border-trading-border">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-zinc-500 font-mono">
                          Showing {indexOfFirstTrade + 1} to {Math.min(indexOfLastTrade, totalTrades)} of {totalTrades}
                        </span>
                        <select 
                          value={tradesPerPage} 
                          onChange={(e) => {
                            setTradesPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-zinc-900 border border-trading-border rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value={10}>10 per page</option>
                          <option value={20}>20 per page</option>
                          <option value={50}>50 per page</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safeCurrentPage === 1}
                          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-trading-border"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono text-zinc-400 px-2">
                          Page {safeCurrentPage} of {totalPages}
                        </span>
                        <button 
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safeCurrentPage === totalPages}
                          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-trading-border"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Execution Panel */}
          <div className="bg-trading-card border border-trading-border rounded-2xl p-6 shrink-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                QUICK EXECUTION
              </h3>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-zinc-500">Available: <span className="text-white">${portfolio.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Take Profit (Target Price)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs">$</span>
                  <input 
                    type="number" 
                    value={tpInput}
                    onChange={(e) => setTpInput(e.target.value)}
                    placeholder={`Default: ${userSettings.defaultTpPercent}%`}
                    className="w-full bg-zinc-900 border border-trading-border rounded-xl pl-7 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Stop Loss (Exit Price)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 text-xs">$</span>
                  <input 
                    type="number" 
                    value={slInput}
                    onChange={(e) => setSlInput(e.target.value)}
                    placeholder={`Default: ${userSettings.defaultSlPercent}%`}
                    className="w-full bg-zinc-900 border border-trading-border rounded-xl pl-7 pr-4 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => executeTrade('BUY')}
                className="group relative overflow-hidden bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold transition-all active:scale-95"
              >
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  BUY BTC
                </div>
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: AI & Signals */}
        <div className="lg:col-span-4 flex flex-col gap-6 min-h-0">
          {/* AI Signal Card */}
          <div className="bg-trading-card border border-trading-border rounded-2xl overflow-hidden shrink-0">
            <div className="p-4 bg-blue-600/10 border-b border-trading-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-500" />
                <span className="font-bold text-sm">AI MARKET SIGNAL</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newVal = !isAutoBotRunning;
                    setIsAutoBotRunning(newVal);
                    setUserSettings(prev => ({ ...prev, autoBotEnabled: newVal }));
                    syncSettingsToDb(newVal);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                    isAutoBotRunning 
                      ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 border border-emerald-500/50" 
                      : "bg-zinc-800 text-zinc-400 hover:text-white border border-trading-border"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", isAutoBotRunning ? "bg-emerald-500 animate-pulse" : "bg-zinc-500")} />
                  {isAutoBotRunning ? 'BOT ACTIVE' : 'START BOT'}
                </button>
                <button 
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isAutoBotRunning}
                  className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-4 h-4 text-blue-500", isAnalyzing && "animate-spin")} />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {!signal ? (
                <div className="text-center py-8">
                  <Cpu className="w-12 h-12 text-zinc-700 mx-auto mb-4 animate-pulse" />
                  <p className="text-zinc-500 text-sm">Run AI analysis to generate real-time trading signals.</p>
                  <button 
                    onClick={handleAnalyze}
                    className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold transition-colors"
                  >
                    Analyze Now
                  </button>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                      signal.recommendation === 'BUY' ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-500/20 text-zinc-500"
                    )}>
                      {signal.recommendation} SIGNAL
                    </span>
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-500 uppercase font-mono">Confidence</p>
                      <p className="text-blue-400 font-mono font-bold">{signal.confidence}%</p>
                    </div>
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <p className="text-sm text-zinc-300 leading-relaxed italic">
                      "{signal.rationale}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    <Activity size={12} />
                    Generated at {format(signal.timestamp, 'HH:mm:ss')}
                  </div>
                </motion.div>
              )}
            </div>

            {/* AI Chatbot */}
            <div className="bg-trading-card border border-trading-border rounded-2xl flex flex-col flex-1 min-h-0">
              <div className="p-4 border-b border-trading-border flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <span className="font-bold text-sm">MARKET ASSISTANT</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'user' 
                          ? "ml-auto bg-blue-600 text-white rounded-tr-none" 
                          : "bg-zinc-800 text-zinc-200 rounded-tl-none border border-trading-border"
                      )}
                    >
                      {msg.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-trading-border flex gap-2">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about trends, indicators..."
                  className="flex-1 bg-zinc-900 border border-trading-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button 
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 p-2 rounded-xl transition-colors active:scale-95"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="h-10 shrink-0 border-t border-trading-border bg-trading-bg px-6 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            System Operational
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} />
            Latency: 24ms
          </div>
        </div>
        <div>
          © 2026 AI Trading Terminal v1.0.4
        </div>
      </footer>

      {/* Deposit Modal */}
      <AnimatePresence>
        {showDepositModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-trading-card border border-trading-border rounded-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-4 border-b border-trading-border flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-blue-500" />
                  Deposit Funds
                </h3>
                <button onClick={() => setShowDepositModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                    <input 
                      type="number" 
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full bg-zinc-900 border border-trading-border rounded-xl pl-8 pr-4 py-3 text-lg font-mono focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => setPaymentMethod('card')}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all", 
                        paymentMethod === 'card' ? "bg-blue-600/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-trading-border text-zinc-400 hover:text-white"
                      )}
                    >
                      <CreditCard className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase">Card</span>
                    </button>
                    <button 
                      onClick={() => setPaymentMethod('apple')}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all", 
                        paymentMethod === 'apple' ? "bg-white text-black border-white" : "bg-zinc-900 border-trading-border text-zinc-400 hover:text-white"
                      )}
                    >
                      <Smartphone className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase">Apple Pay</span>
                    </button>
                    <button 
                      onClick={() => setPaymentMethod('google')}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all", 
                        paymentMethod === 'google' ? "bg-white text-black border-white" : "bg-zinc-900 border-trading-border text-zinc-400 hover:text-white"
                      )}
                    >
                      <Smartphone className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase">Google Pay</span>
                    </button>
                  </div>
                </div>
                
                <button 
                  onClick={handleDeposit}
                  disabled={isProcessingPayment || !depositAmount || parseFloat(depositAmount) <= 0}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  {isProcessingPayment ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    `Pay $${parseFloat(depositAmount || '0').toLocaleString()}`
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-trading-card border border-trading-border rounded-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-4 border-b border-trading-border flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-500" />
                  Trading Settings
                </h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-xl border border-trading-border">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        tempSettings.autoBotEnabled ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-800 text-zinc-500"
                      )}>
                        <Bot className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-200">Auto-Bot Trading</p>
                        <p className="text-[10px] text-zinc-500 uppercase font-mono">AI-Powered Automation</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setTempSettings({...tempSettings, autoBotEnabled: !tempSettings.autoBotEnabled})}
                      className={cn(
                        "w-12 h-6 rounded-full relative transition-colors duration-200",
                        tempSettings.autoBotEnabled ? "bg-emerald-500" : "bg-zinc-700"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200",
                        tempSettings.autoBotEnabled ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>

                  <h4 className="text-sm font-bold text-zinc-300">Default Risk Management</h4>
                  <p className="text-xs text-zinc-500">These percentages will be automatically applied to your trades if you don't specify exact TP/SL prices.</p>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Default Take Profit (%)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.1"
                        value={tempSettings.defaultTpPercent}
                        onChange={(e) => setTempSettings({...tempSettings, defaultTpPercent: parseFloat(e.target.value) || 0})}
                        className="w-full bg-zinc-900 border border-trading-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">%</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Default Stop Loss (%)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.1"
                        value={tempSettings.defaultSlPercent}
                        onChange={(e) => setTempSettings({...tempSettings, defaultSlPercent: parseFloat(e.target.value) || 0})}
                        className="w-full bg-zinc-900 border border-trading-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-red-500 transition-colors"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">%</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={handleSaveSettings}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  Save Settings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
