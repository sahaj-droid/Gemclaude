import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, Search, ArrowUpRight, ArrowDownRight, 
  Layers, BarChart2, BookOpen, Newspaper, Sparkles, RefreshCw, Info,
  Cpu, Activity, ArrowLeft, Briefcase, Trash2, Plus
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip 
} from 'recharts';

interface FinanceDashboardProps {
  onSendMessage?: (text: string) => void;
  userEmail: string;
  onGoBackToChat?: () => void;
}

export interface PortfolioItem {
  symbol: string;
  name: string;
  qty: number;
  buyPrice: number;
  currency: string;
}

// Popular default Indian tickers + global benchmarks
const POPULAR_TICKERS = [
  { symbol: '^NSEI', name: 'Nifty 50', type: 'Index' },
  { symbol: '^BSESN', name: 'BSE Sensex', type: 'Index' },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', type: 'Stock' },
  { symbol: 'TCS.NS', name: 'TCS', type: 'Stock' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', type: 'Stock' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', type: 'Stock' },
  { symbol: 'INFY.NS', name: 'Infosys', type: 'Stock' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', type: 'Stock' },
  { symbol: 'ITC.NS', name: 'ITC Limited', type: 'Stock' },
];

export default function FinanceDashboard({ onSendMessage, userEmail, onGoBackToChat }: FinanceDashboardProps) {
  // Navigation & Search State
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE.NS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchNews, setSearchNews] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // Portfolio tracking system states
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(() => {
    try {
      const saved = localStorage.getItem('finance_india_portfolio');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse portfolio:', e);
    }
    return [
      { symbol: 'TATAMOTORS.NS', name: 'Tata Motors Limited', qty: 25, buyPrice: 900.00, currency: 'INR' },
      { symbol: 'SBIN.NS', name: 'State Bank of India', qty: 50, buyPrice: 770.00, currency: 'INR' },
      { symbol: 'RELIANCE.NS', name: 'Reliance Industries Limited', qty: 10, buyPrice: 1250.00, currency: 'INR' }
    ];
  });
  const [portfolioPrices, setPortfolioPrices] = useState<Record<string, number>>({});
  const [portfolioAddQty, setPortfolioAddQty] = useState<number>(10);
  const [portfolioAddPrice, setPortfolioAddPrice] = useState<number>(0);
  const [showPortfolioAddForm, setShowPortfolioAddForm] = useState<boolean>(false);

  // Portfolio research advice
  const [isGeneratingPortfolioReport, setIsGeneratingPortfolioReport] = useState<boolean>(false);
  const [portfolioReport, setPortfolioReport] = useState<string>('');
  const [activePortfolioTab, setActivePortfolioTab] = useState<'holdings' | 'advice'>('holdings');

  // Data Loading States
  const [quoteData, setQuoteData] = useState<any | null>(null);
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartMeta, setChartMeta] = useState<any | null>(null);
  const [selectedRange, setSelectedRange] = useState<string>('1mo'); // 1d, 5d, 1mo, 6mo, 1y, 5y
  const [selectedInterval, setSelectedInterval] = useState<string>('1d'); // 5m, 15m, 1h, 1d, 1wk

  // Loading Flags
  const [isLoadingQuote, setIsLoadingQuote] = useState<boolean>(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Technical calculations state
  const [sma20, setSma20] = useState<number | null>(null);
  const [sma50, setSma50] = useState<number | null>(null);
  const [rsi14, setRsi14] = useState<number | null>(null);
  const [technicalSentiment, setTechnicalSentiment] = useState<{
    score: number; // 0 (Bearish) to 100 (Bullish)
    label: string;
    rsiStatus: string;
    maCrossover: string;
  }>({ score: 50, label: 'Neutral', rsiStatus: 'Neutral', maCrossover: 'Neutral' });

  // Gemini AI Stock Report state
  const [aiReport, setAiReport] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'financial' | 'technical' | 'profile' | 'news'>('financial');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Default range/interval mapper
  const rangePresets = [
    { label: '1D', range: '1d', interval: '5m' },
    { label: '5D', range: '5d', interval: '15m' },
    { label: '1M', range: '1mo', interval: '1d' },
    { label: '6M', range: '6mo', interval: '1d' },
    { label: '1Y', range: '1y', interval: '1d' },
    { label: '5Y', range: '5y', interval: '1wk' },
  ];

  // Helper to handle clicks outside search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch quotes autocomplete on searchQuery changes
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/finance/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          // Filter out global or irrelevant symbols if needed, but show what we find. Highlight Indian NSE/BSE symbols.
          if (data.quotes) {
            setSearchResults(data.quotes);
          }
          if (data.news) {
            setSearchNews(data.news);
          }
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Autocomplete fetch error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Synchronously pre-fill user input purchase prices on quote load
  useEffect(() => {
    if (quoteData && quoteData.regularMarketPrice) {
      setPortfolioAddPrice(quoteData.regularMarketPrice);
    }
  }, [quoteData]);

  // Query actual live pricing for portfolio items
  useEffect(() => {
    const fetchPortfolioPrices = async () => {
      const symbols: string[] = portfolio.map(item => item.symbol);
      const uniqueSymbols: string[] = Array.from(new Set(symbols));
      if (uniqueSymbols.length === 0) return;

      const newPrices: Record<string, number> = { ...portfolioPrices };
      let updated = false;

      await Promise.all(
        uniqueSymbols.map(async (sym: string) => {
          try {
            const res = await fetch(`/api/finance/quote?symbol=${encodeURIComponent(sym)}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.regularMarketPrice) {
                newPrices[sym] = data.regularMarketPrice;
                updated = true;
              }
            }
          } catch (e) {
            console.warn('Portfolio price load failed:', sym, e);
          }
        })
      );

      if (updated) {
        setPortfolioPrices(newPrices);
      }
    };

    fetchPortfolioPrices();
    // Re-verify/poll every 30 seconds
    const intervalId = setInterval(fetchPortfolioPrices, 30000);
    return () => clearInterval(intervalId);
  }, [portfolio]);

  const handleAddToPortfolio = (sym: string, qty: number, buyPrice: number) => {
    const name = quoteData && quoteData.symbol === sym ? (quoteData.longName || quoteData.shortName || sym) : sym;
    const currency = quoteData && quoteData.symbol === sym ? (quoteData.currency || 'INR') : 'INR';

    const updated = [...portfolio];
    const existingIndex = updated.findIndex(item => item.symbol.toUpperCase() === sym.toUpperCase());

    if (existingIndex >= 0) {
      const existing = updated[existingIndex];
      const newQty = existing.qty + qty;
      const newAvPrice = ((existing.qty * existing.buyPrice) + (qty * buyPrice)) / newQty;
      updated[existingIndex] = {
        ...existing,
        qty: newQty,
        buyPrice: parseFloat(newAvPrice.toFixed(2))
      };
    } else {
      updated.push({
        symbol: sym.toUpperCase(),
        name,
        qty,
        buyPrice,
        currency
      });
    }

    setPortfolio(updated);
    localStorage.setItem('finance_india_portfolio', JSON.stringify(updated));
    setShowPortfolioAddForm(false);
  };

  const handleRemoveFromPortfolio = (sym: string) => {
    const updated = portfolio.filter(item => item.symbol.toUpperCase() !== sym.toUpperCase());
    setPortfolio(updated);
    localStorage.setItem('finance_india_portfolio', JSON.stringify(updated));
  };

  const handleGeneratePortfolioReport = async () => {
    if (portfolio.length === 0) return;
    setIsGeneratingPortfolioReport(true);
    setPortfolioReport('');
    setActivePortfolioTab('advice');

    let totalInvested = 0;
    let totalCurrentValue = 0;
    
    const itemsDescription = portfolio.map(item => {
      const currentPrice = portfolioPrices[item.symbol] || item.buyPrice;
      const invested = item.qty * item.buyPrice;
      const currentVal = item.qty * currentPrice;
      const pnl = currentVal - invested;
      const pnlPct = (pnl / invested) * 100;
      
      totalInvested += invested;
      totalCurrentValue += currentVal;

      return `- **${item.name} (${item.symbol})**: Holds ${item.qty} units bought at avg price ₹${item.buyPrice.toLocaleString('en-IN')}. Live price is ₹${currentPrice.toLocaleString('en-IN')}. Current asset valuation is ₹${currentVal.toLocaleString('en-IN')}. Performance: ₹${pnl >= 0 ? '+' : ''}${pnl.toLocaleString('en-IN')} (${pnlPct.toFixed(2)}%)`;
    }).join('\n');

    const totalPnl = totalCurrentValue - totalInvested;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    const portfolioPrompt = `Act as an expert CFA and investment portfolio manager. Analyze my Indian equities holding portfolio and draft a professional portfolio summary, status review and suggestion advice.

    Here are the details of my portfolio:
    * Total Invested Capital: ₹${totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    * Total Current Portfolio Valuation: ₹${totalCurrentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    * Overall Net Return: ₹${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${totalPnlPct.toFixed(2)}%)

    Equities Holdings:
    ${itemsDescription}

    Please construct a elegant financial consult markdown report covering:
    1. **Portfolio Diversity Assessment**: Comment on the stock mix, balance, and asset allocation strategy.
    2. **Performance Drivers & Risk**: Highlight what's doing well versus lagging assets.
    3. **Actionable Suggestions**: Provide tactical advice (such as compounding, cost-averaging, or rebalancing sectors).
    
    Keep it professional, supportive, and objective. Use beautiful financial layout tags.`;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.5-flash',
          messages: [{ role: 'user', text: portfolioPrompt }]
        })
      });

      if (!response.ok) throw new Error('Failed to generate advice report.');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      if (reader) {
        let partialText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          partialText += decoder.decode(value, { stream: true });
          setPortfolioReport(partialText);
        }
      }
    } catch (err: any) {
      console.error('Portfolio advice AI error:', err);
      setPortfolioReport('Unable to synthesise portfolio evaluation at this moment. Please check server logs.');
    } finally {
      setIsGeneratingPortfolioReport(false);
    }
  };

  // Load selected stock info
  useEffect(() => {
    loadStockData(selectedSymbol, selectedRange, selectedInterval);
  }, [selectedSymbol, selectedRange, selectedInterval]);

  const loadStockData = async (symbol: string, range: string, interval: string) => {
    setErrorMessage('');
    setIsLoadingQuote(true);
    setIsLoadingSummary(true);
    setIsLoadingChart(true);
    setAiReport(''); // reset AI report on symbol change

    // Fetch live quote details
    try {
      const qRes = await fetch(`/api/finance/quote?symbol=${encodeURIComponent(symbol)}`);
      if (qRes.ok) {
        const qData = await qRes.json();
        setQuoteData(qData);
      } else {
        const errObj = await qRes.json();
        throw new Error(errObj.error || 'Failed to retrieve stock quote detail.');
      }
    } catch (err: any) {
      console.error('Error loading stock quote:', err);
      setErrorMessage(err.message || 'Symbol not found on Yahoo Finance. Try a valid NSE code like RELIANCE.NS, TCS.NS');
    } finally {
      setIsLoadingQuote(false);
    }

    // Fetch fundamental profile modules
    try {
      const sRes = await fetch(`/api/finance/summary?symbol=${encodeURIComponent(symbol)}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSummaryData(sData);
      } else {
        setSummaryData(null);
      }
    } catch (err) {
      console.error('Error loading fundamental summary:', err);
      setSummaryData(null);
    } finally {
      setIsLoadingSummary(false);
    }

    // Fetch historic charts
    try {
      const cRes = await fetch(`/api/finance/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setChartMeta(cData.meta || null);

        const timestamps = cData.timestamp || [];
        const indicators = cData.indicators?.quote?.[0] || {};
        const closes = indicators.close || [];
        const opens = indicators.open || [];
        const highs = indicators.high || [];
        const lows = indicators.low || [];
        const volumes = indicators.volume || [];

        const parsedData = timestamps.map((ts: number, i: number) => {
          const date = new Date(ts * 1000);
          let formattedDate = '';
          
          if (range === '1d') {
            formattedDate = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else if (range === '5d') {
            formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else {
            formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
          }

          return {
            timestamp: ts,
            formattedDate,
            close: closes[i] !== null ? parseFloat(closes[i].toFixed(2)) : null,
            open: opens[i] !== null ? parseFloat(opens[i].toFixed(2)) : null,
            high: highs[i] !== null ? parseFloat(highs[i].toFixed(2)) : null,
            low: lows[i] !== null ? parseFloat(lows[i].toFixed(2)) : null,
            volume: volumes[i] !== null ? parseInt(volumes[i]) : null,
          };
        }).filter((d: any) => d.close !== null); // remove null values

        setChartData(parsedData);
        calculateTechnicalMetrics(parsedData);
      } else {
        setChartData([]);
      }
    } catch (err) {
      console.error('Error loading chart series:', err);
      setChartData([]);
    } finally {
      setIsLoadingChart(false);
    }
  };

  // Technical Calculations Indicator Engine
  const calculateTechnicalMetrics = (data: any[]) => {
    if (data.length < 5) {
      setSma20(null);
      setSma50(null);
      setRsi14(null);
      return;
    }

    const closes = data.map(d => d.close).filter(c => c !== null) as number[];
    const latestPrice = closes[closes.length - 1];

    // SMA 20
    let calculatedSma20 = null;
    if (closes.length >= 20) {
      const sum20 = closes.slice(-20).reduce((a, b) => a + b, 0);
      calculatedSma20 = parseFloat((sum20 / 20).toFixed(2));
      setSma20(calculatedSma20);
    } else {
      setSma20(null);
    }

    // SMA 50
    let calculatedSma50 = null;
    if (closes.length >= 50) {
      const sum50 = closes.slice(-50).reduce((a, b) => a + b, 0);
      calculatedSma50 = parseFloat((sum50 / 50).toFixed(2));
      setSma50(calculatedSma50);
    } else {
      setSma50(null);
    }

    // RSI 14
    let calculatedRsi14 = null;
    if (closes.length > 14) {
      let gains = 0;
      let losses = 0;
      for (let i = 1; i <= 14; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      let avgGain = gains / 14;
      let avgLoss = losses / 14;

      for (let i = 15; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
        avgLoss = (avgLoss * 13 + (diff < 0 ? -diff : 0)) / 14;
      }

      if (avgLoss === 0) {
        calculatedRsi14 = 100;
      } else {
        const rs = avgGain / avgLoss;
        calculatedRsi14 = parseFloat((100 - (100 / (1 + rs))).toFixed(2));
      }
      setRsi14(calculatedRsi14);
    } else {
      setRsi14(null);
    }

    // Compile Sentiment Diagnostics
    let score = 50; // starts neutral
    let rsiLabel = 'Neutral';
    let crossoverLabel = 'Inconclusive (Requires 50+ data points)';

    if (calculatedRsi14 !== null) {
      if (calculatedRsi14 > 70) {
        rsiLabel = 'Overbought';
        score -= 15; // bearish correction warning
      } else if (calculatedRsi14 < 30) {
        rsiLabel = 'Oversold';
        score += 15; // bullish bounce potential
      } else {
        rsiLabel = 'Neutral';
      }
    }

    if (calculatedSma20 && latestPrice > calculatedSma20) score += 15; // short term bullish
    if (calculatedSma20 && latestPrice < calculatedSma20) score -= 15; // short term bearish

    if (calculatedSma20 && calculatedSma50) {
      if (calculatedSma20 > calculatedSma50) {
        crossoverLabel = 'Golden Crossover (Bullish)';
        score += 20;
      } else {
        crossoverLabel = 'Death Crossover (Bearish)';
        score -= 20;
      }
    }

    // Normalize score to 0 - 100
    const finalScore = Math.max(5, Math.min(95, score));
    let termLabel = 'Neutral';
    if (finalScore >= 75) termLabel = 'Strong Buy / Bullish';
    else if (finalScore >= 60) termLabel = 'Mildly Bullish';
    else if (finalScore <= 25) termLabel = 'Strong Sell / Bearish';
    else if (finalScore <= 40) termLabel = 'Mildly Bearish';

    setTechnicalSentiment({
      score: finalScore,
      label: termLabel,
      rsiStatus: rsiLabel,
      maCrossover: crossoverLabel
    });
  };

  // Live currency dynamic formatter
  const formatCurrency = (val: any, currency = 'INR') => {
    if (val === undefined || val === null) return 'N/A';
    const num = typeof val === 'object' ? val.raw : val;
    if (isNaN(num)) return 'N/A';

    const symbolMap: { [key: string]: string } = {
      'INR': '₹',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };

    const prefix = symbolMap[currency] || '₹';

    if (num >= 1e12) {
      return `${prefix}${(num / 1e12).toFixed(2)} Cr (Trillion)`;
    } else if (num >= 1e7) {
      // Core Lakh/Crore systems for Indian Stocks
      return `${prefix}${(num / 1e7).toFixed(2)} Cr`;
    } else if (num >= 1e5) {
      return `${prefix}${(num / 1e5).toFixed(2)} L`;
    }
    return `${prefix}${num.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Standard numbers formatter
  const formatCompact = (val: any) => {
    if (val === undefined || val === null) return 'N/A';
    const num = typeof val === 'object' ? val.raw : val;
    if (isNaN(num)) return 'N/A';
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  };

  // Format simple percentage
  const formatPercent = (val: any) => {
    if (val === undefined || val === null) return 'N/A';
    const num = typeof val === 'object' ? val.raw : val;
    if (isNaN(num)) return 'N/A';
    return `${(num * 100).toFixed(2)}%`;
  };

  // Format timestamp to date string
  const formatTimestamp = (ts: any) => {
    if (!ts) return 'N/A';
    try {
      if (ts instanceof Date) {
        return ts.toLocaleDateString([], {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      if (typeof ts === 'string') {
        const parsed = new Date(ts);
        if (!isNaN(parsed.getTime())) {
          return parsed.toLocaleDateString([], {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
        }
      }
      if (typeof ts === 'number') {
        const isMillis = ts > 100000000000;
        const parsed = new Date(isMillis ? ts : ts * 1000);
        if (!isNaN(parsed.getTime())) {
          return parsed.toLocaleDateString([], {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
        }
      }
      const generalParsed = new Date(ts);
      if (!isNaN(generalParsed.getTime())) {
        return generalParsed.toLocaleDateString([], {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
    } catch (e) {
      console.error('Error formatTimestamp:', e);
    }
    return 'N/A';
  };

  // Generate automated Gemini report utilizing live indicators
  const handleGenerateAIReport = async () => {
    if (!quoteData) return;
    setIsGeneratingReport(true);
    setAiReport('');

    const coinSpecs = `
      STOCK REPORT SPECIFICATIONS:
      Symbol: ${selectedSymbol}
      Company Name: ${quoteData.longName || quoteData.shortName || selectedSymbol}
      Current Price: ${quoteData.regularMarketPrice} ${quoteData.currency || 'INR'}
      Price Change: ${quoteData.regularMarketChange} (${quoteData.regularMarketChangePercent}%)
      52W High: ${summaryData?.summaryDetail?.fiftyTwoWeekHigh?.raw || 'N/A'}
      52W Low: ${summaryData?.summaryDetail?.fiftyTwoWeekLow?.raw || 'N/A'}
      
      FUNDAMENTALS:
      Trailing P/E: ${summaryData?.summaryDetail?.trailingPE?.raw || 'N/A'}
      Forward P/E: ${summaryData?.summaryDetail?.forwardPE?.raw || 'N/A'}
      Price to Book (P/B): ${summaryData?.defaultKeyStatistics?.priceToBook?.raw || 'N/A'}
      Earnings Per Share (EPS): ${summaryData?.defaultKeyStatistics?.trailingEps?.raw || 'N/A'}
      Annualized Dividend Yield: ${summaryData?.summaryDetail?.dividendYield?.raw ? (summaryData.summaryDetail.dividendYield.raw * 100).toFixed(2) + '%' : 'N/A'}
      Debt to Equity: ${summaryData?.financialData?.debtToEquity?.raw || 'N/A'}
      Profit Margins: ${summaryData?.financialData?.profitMargins?.raw ? (summaryData.financialData.profitMargins.raw * 100).toFixed(2) + '%' : 'N/A'}

      TECHNICALS:
      Current RSI (14): ${rsi14 || 'Calculating...'}
      SMA 20: ${sma20 || 'Calculating...'}
      SMA 50: ${sma50 || 'Calculating...'}
      General technical crossover: ${technicalSentiment.maCrossover}
      Overall mathematical sentiment score: ${technicalSentiment.score}/100 [${technicalSentiment.label}]
    `;

    try {
      // We will feed the prompt containing actual stats to our chat endpoint! This returns robust AI analysis.
      const prompt = `Act as a professional financial researcher and equity research analyst. I will provide you with live technical and fundamental stock indicators from Yahoo Finance India. Write an elegant, structured equity report for ${quoteData.longName || selectedSymbol}. 
      
      Here are the statistics:
      ${coinSpecs}

      Structure your report with the following clear markdown blocks:
      1. **Executive Valuation Summary**: Quick analysis of the current market valuation relative to industry averages. Is the P/E justifiable?
      2. **Fundamental Health Check**: Breakdown of corporate strength (profit margins, dividend yield, debt indicators).
      3. **Technical Momentum Analysis**: Interpret the RSI (${rsi14}), SMA 20, and SMA 50. Are we seeing strong bullishness, bearish oversold conditions, or potential breakouts?
      4. **Analyst Synthesis Card**: Concluding objective verdict (Bullish, Hold, or Bearish Reversal watch) with key risks to monitor.
      
      Keep it professional, analytical, objective, and dense with financial insight. Make it read beautifully without filler text.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.5-flash',
          messages: [{ role: 'user', text: prompt }]
        })
      });

      if (!response.ok) throw new Error('Failed to generate report from server.');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      if (reader) {
        let partialText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.trim().slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  partialText += parsed.text;
                  setAiReport(partialText);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error generating AI technical report:', err);
      setAiReport('Could not generate the analysis report. Please ensure your Gemini API key is configured correctly in the Secrets menu.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Format numbers cleanly for lists
  const formatPriceDiff = (change: number, pct: number, currencyType: string) => {
    const isPos = change >= 0;
    const sign = isPos ? '+' : '';
    const colorClass = isPos ? 'text-green-600 font-medium' : 'text-red-600 font-medium';
    return (
      <span className={`inline-flex items-center text-xs sm:text-sm ${colorClass}`}>
        {isPos ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5 inline" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5 inline" />}
        {sign}{change.toFixed(2)} ({sign}{(pct * 1).toFixed(2)}%)
      </span>
    );
  };

  // If chart goes up/down over the range, we choose the gradient color.
  const chartColor = (() => {
    if (chartData.length < 2) return '#D97706'; // default amber
    const firstVal = chartData[0].close;
    const lastVal = chartData[chartData.length - 1].close;
    if (firstVal && lastVal) {
      return lastVal >= firstVal ? '#22C55E' : '#EF4444'; // green or red
    }
    return '#D97706';
  })();

  return (
    <div className="flex-1 flex flex-col h-full bg-claude-bg overflow-y-auto" id="finance-india-terminal">
      {/* Top Header / Search Row */}
      <div className="border-b border-claude-border px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 bg-claude-bg z-10">
        <div className="flex items-start sm:items-center gap-3">
          {onGoBackToChat && (
            <button
              onClick={onGoBackToChat}
              className="mt-0.5 sm:mt-0 px-4 py-2 rounded-2xl border border-claude-border bg-white text-claude-secondary hover:text-claude-text hover:bg-neutral-50 shadow-xs transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title="Home"
            >
              <ArrowLeft className="w-4 h-4 text-amber-600" />
              <span>Home</span>
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-claude-text flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-claude-accent" />
              Finance India Terminal
            </h1>
            <p className="text-xs text-claude-secondary">
              Unified live tracker for Indian stocks (NSE/BSE), market indicators, and intelligent equity research reports.
            </p>
          </div>
        </div>

        {/* Autocomplete Input Search */}
        <div className="relative w-full md:w-96" ref={dropdownRef}>
          <div className="relative group">
            <input
              type="text"
              className="w-full pl-10 pr-10 py-2.5 bg-neutral-50 hover:bg-neutral-100/30 focus:bg-white text-claude-text border border-neutral-200 hover:border-neutral-300 focus:border-claude-accent/80 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/15 transition-all duration-200 shadow-xs"
              placeholder="Search Indian stocks (e.g., RELIANCE.NS, TCS.NS)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
            />
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-400 group-focus-within:text-claude-accent transition-colors" />
            {isSearching ? (
              <div className="absolute right-3.5 top-3.5">
                <RefreshCw className="w-4 h-4 text-claude-accent animate-spin" />
              </div>
            ) : searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 text-neutral-400 hover:text-neutral-600 text-xs px-1 font-semibold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Collapsible Dropdown */}
          {showDropdown && (searchResults.length > 0 || searchNews.length > 0) && (
            <div className="absolute left-0 right-0 mt-2 bg-white border border-claude-border rounded-2xl shadow-xl max-h-96 overflow-y-auto z-50 text-xs sm:text-sm">
              <div className="p-2 border-b border-claude-border text-xs text-claude-secondary font-semibold font-mono tracking-wider bg-neutral-50 rounded-t-2xl">
                STOCKS & INDICES
              </div>
              {searchResults.slice(0, 7).map((item, idx) => (
                <button
                  key={`${item.symbol || 'search-item'}-${idx}`}
                  className="w-full text-left px-4 py-3 hover:bg-neutral-50 flex items-center justify-between transition-colors border-b border-neutral-50 last:border-b-0"
                  onClick={() => {
                    setSelectedSymbol(item.symbol);
                    setSearchQuery('');
                    setShowDropdown(false);
                  }}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-bold text-claude-text truncate">{item.symbol}</span>
                    <span className="text-xs text-claude-secondary truncate">
                      {item.shortname || item.longname}
                    </span>
                  </div>
                  <span className="text-[10px] bg-neutral-100/80 text-neutral-600 font-medium px-2 py-0.5 rounded-md uppercase shrink-0 font-mono">
                    {item.exchange} • {item.typeDisp || 'Stock'}
                  </span>
                </button>
              ))}

              {searchResults.length === 0 && (
                <div className="p-4 text-center text-xs text-claude-secondary">
                  No direct stock symbols matched.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Access Benchmarks Row */}
      <div className="px-4 sm:px-6 py-3 border-b border-claude-border bg-[#FCFBF9] flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth items-center">
        <span className="text-[10px] uppercase tracking-wider font-mono font-bold text-neutral-400 mr-1 shrink-0 hidden md:inline">Quick watch:</span>
        {POPULAR_TICKERS.map((item) => {
          const isActive = selectedSymbol === item.symbol;
          return (
            <button
              key={item.symbol}
              onClick={() => setSelectedSymbol(item.symbol)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-2xl text-[11px] font-semibold border flex items-center gap-1.5 transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 shadow-xs cursor-pointer ${
                isActive
                  ? 'bg-amber-600 text-white border-amber-600/90 font-bold scale-[1.02] shadow-xs'
                  : 'bg-white hover:bg-amber-50/20 text-claude-secondary border-neutral-200 hover:border-amber-300/60 hover:text-claude-text'
              }`}
            >
              {item.type === 'Index' ? (
                <Activity className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-amber-600'}`} />
              ) : (
                <BarChart2 className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-amber-600'}`} />
              )}
              <span>{item.name}</span>
              <span className={`text-[9px] font-mono px-1 rounded ${isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                {item.symbol.replace(/\.(NS|BO)$/, '')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Primary Layout */}
      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full flex-1">
        
        {/* Error notification */}
        {errorMessage && (
          <div className="lg:col-span-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-sm flex items-start gap-2.5 shadow-sm">
            <Info className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Stock Lookup Alert: </span>
              {errorMessage}
              <div className="mt-1.5 text-xs text-red-700 font-medium">
                Tip: Indian stocks listed on the National Stock Exchange use the suffix <code className="bg-red-100 px-1 py-0.5 rounded font-mono font-bold">.NS</code> (e.g. RELIANCE.NS, INFOSYS is INFY.NS, Tata Consultancy Services is TCS.NS). For Bombay Stock Exchange, use <code className="bg-red-100 px-1 py-0.5 rounded font-mono font-bold">.BO</code> (e.g. 500325.BO).
              </div>
            </div>
          </div>
        )}

        {/* Column 1 & 2: Chart & Analytical Tables */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Main Price Detail Card */}
          <div className="bg-white border border-claude-border rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {isLoadingQuote ? (
              <div className="w-full flex justify-center py-6">
                <RefreshCw className="w-7 h-7 text-claude-accent animate-spin" />
              </div>
            ) : quoteData ? (
              <>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider bg-claude-card text-claude-secondary font-medium px-2.5 py-1 rounded-full">
                      {quoteData.exchange || 'NSE'} • {quoteData.quoteType || 'EQUITY'}
                    </span>
                    <span className="text-[10px] uppercase font-mono tracking-wider bg-amber-50 text-claude-accent font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <span className="pulse-dot w-2 h-2 rounded-full bg-claude-accent inline-block"></span>
                      {quoteData.marketState === 'REGULAR' ? 'Live' : 'Market Closed'}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-serif font-bold text-claude-text mt-1.5 leading-snug">
                    {quoteData.longName || quoteData.shortName || selectedSymbol}
                  </h2>
                  <div className="text-xs text-claude-secondary font-mono mt-0.5 flex items-center gap-2">
                    <span>Ticker: {quoteData.symbol}</span>
                    <span>•</span>
                    <span>Currency: {quoteData.currency || 'INR'}</span>
                  </div>
                </div>

                <div className="text-right flex flex-col sm:items-end justify-center">
                  <div className="text-3xl font-serif font-bold text-claude-text">
                    {formatCurrency(quoteData.regularMarketPrice, quoteData.currency)}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {formatPriceDiff(
                      quoteData.regularMarketChange || 0, 
                      quoteData.regularMarketChangePercent || 0,
                      quoteData.currency
                    )}
                  </div>
                  <div className="text-[10px] text-claude-secondary mt-1 flex items-center gap-1">
                    <span>As of: {formatTimestamp(quoteData.regularMarketTime)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full py-4 text-center text-claude-secondary text-sm">
                Search a stock symbol above to load equity data.
              </div>
            )}
          </div>

          {/* Historical Price Trend Area Chart */}
          <div className="bg-white border border-claude-border rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
            {/* Chart Nav Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <span className="text-sm font-semibold text-claude-text flex items-center gap-1.5 font-mono">
                <Activity className="w-4.5 h-4.5 text-claude-accent" />
                Price Action History
              </span>
              
              {/* Range Selector */}
              <div className="flex bg-claude-bubble-user/30 p-1 rounded-xl">
                {rangePresets.map((p) => (
                  <button
                    key={p.range}
                    onClick={() => {
                      setSelectedRange(p.range);
                      setSelectedInterval(p.interval);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      selectedRange === p.range
                        ? 'bg-white text-claude-text shadow-sm'
                        : 'text-claude-secondary hover:text-claude-text'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Render Recharts graph */}
            <div className="h-[280px] sm:h-[320px] w-full" id="price-action-chart-recharts">
              {isLoadingChart ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-8 h-8 text-claude-accent animate-spin" />
                  <span className="text-xs text-claude-secondary">Mapping historical prices...</span>
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="financialColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="formattedDate" 
                      stroke="#888888" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      domain={['auto', 'auto']}
                      dx={-5}
                      tickFormatter={(v) => v.toFixed(0)}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#FCFBF9', 
                        borderColor: '#E5DFC8',
                        borderRadius: '0.75rem',
                        color: '#191816',
                        fontSize: '11px',
                        fontFamily: 'var(--font-sans)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)'
                      }}
                      labelClassName="font-semibold text-claude-accent font-mono mb-0.5"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="close" 
                      stroke={chartColor} 
                      strokeWidth={2}
                      dot={false}
                      fillOpacity={1} 
                      fill="url(#financialColor)" 
                      name="Closing Price"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-claude-secondary text-xs">
                  Chart details not available for this interval sequence.
                </div>
              )}
            </div>

            {/* Quick Chart Meta Details */}
            {chartMeta && (
              <div className="mt-4 pt-4 border-t border-claude-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2">
                  <span className="block text-[10px] uppercase tracking-wider text-claude-secondary">Volume</span>
                  <span className="text-sm font-semibold text-claude-text font-mono">
                    {formatCompact(chartData[chartData.length - 1]?.volume)}
                  </span>
                </div>
                <div className="p-2">
                  <span className="block text-[10px] uppercase tracking-wider text-claude-secondary">Day Low</span>
                  <span className="text-sm font-semibold text-claude-text font-mono">
                    {formatCurrency(chartMeta.regularMarketDayLow || (quoteData && quoteData.regularMarketDayLow), quoteData?.currency)}
                  </span>
                </div>
                <div className="p-2">
                  <span className="block text-[10px] uppercase tracking-wider text-claude-secondary">Day High</span>
                  <span className="text-sm font-semibold text-claude-text font-mono">
                    {formatCurrency(chartMeta.regularMarketDayHigh || (quoteData && quoteData.regularMarketDayHigh), quoteData?.currency)}
                  </span>
                </div>
                <div className="p-2 col-span-1 border-neutral-200">
                  <span className="block text-[10px] uppercase tracking-wider text-claude-secondary">Prev Close</span>
                  <span className="text-sm font-semibold text-claude-text font-mono">
                    {formatCurrency(chartMeta.chartPreviousClose || (quoteData && quoteData.regularMarketPreviousClose), quoteData?.currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Deep Stock Metrics & Analysis Tables */}
          <div className="bg-white border border-claude-border rounded-3xl overflow-hidden shadow-sm flex flex-col">
            <div className="border-b border-claude-border flex bg-claude-bubble-user/10 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveAnalysisTab('financial')}
                className={`px-5 py-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeAnalysisTab === 'financial'
                    ? 'border-claude-accent text-claude-text bg-white'
                    : 'border-transparent text-claude-secondary hover:text-claude-text'
                }`}
              >
                <Layers className="w-4 h-4 text-claude-accent" />
                Fundamental Valuation Core
              </button>
              <button
                onClick={() => setActiveAnalysisTab('technical')}
                className={`px-5 py-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeAnalysisTab === 'technical'
                    ? 'border-claude-accent text-claude-text bg-white'
                    : 'border-transparent text-claude-secondary hover:text-claude-text'
                }`}
              >
                <Activity className="w-4 h-4 text-claude-accent" />
                Technical Sentiment Indexes
              </button>
              <button
                onClick={() => setActiveAnalysisTab('profile')}
                className={`px-5 py-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeAnalysisTab === 'profile'
                    ? 'border-claude-accent text-claude-text bg-white'
                    : 'border-transparent text-claude-secondary hover:text-claude-text'
                }`}
              >
                <BookOpen className="w-4 h-4 text-claude-accent" />
                Corporate Asset Profile
              </button>
              <button
                onClick={() => setActiveAnalysisTab('news')}
                className={`px-5 py-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeAnalysisTab === 'news'
                    ? 'border-claude-accent text-claude-text bg-white'
                    : 'border-transparent text-claude-secondary hover:text-claude-text'
                }`}
              >
                <Newspaper className="w-4 h-4 text-claude-accent" />
                Market News Room
              </button>
            </div>

            <div className="p-5 sm:p-6">
              
              {/* Financial Fundamentals Tab */}
              {activeAnalysisTab === 'financial' && (
                <div>
                  {isLoadingSummary ? (
                    <div className="text-center py-6">
                      <RefreshCw className="w-6 h-6 animate-spin text-claude-accent mx-auto" />
                    </div>
                  ) : summaryData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Valuation metrics */}
                      <div className="space-y-3.5">
                        <h4 className="text-xs uppercase font-semibold text-claude-accent font-mono tracking-wider">Valuation Multiples</h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Trailing P/E Ratio</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {summaryData.summaryDetail?.trailingPE?.fmt || summaryData.summaryDetail?.trailingPE?.raw || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Forward P/E Ratio</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {summaryData.summaryDetail?.forwardPE?.fmt || summaryData.summaryDetail?.forwardPE?.raw || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Price to Book (P/B)</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {summaryData.defaultKeyStatistics?.priceToBook?.fmt || summaryData.defaultKeyStatistics?.priceToBook?.raw || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Enterprise Value (EV)</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {formatCurrency(summaryData.defaultKeyStatistics?.enterpriseValue, quoteData?.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between pb-1.5">
                            <span className="text-claude-secondary">Shares Outstanding</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {formatCompact(summaryData.defaultKeyStatistics?.sharesOutstanding)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Profitability & Leverage metrics */}
                      <div className="space-y-3.5 md:pl-4 md:border-l border-claude-border">
                        <h4 className="text-xs uppercase font-semibold text-claude-accent font-mono tracking-wider">Fundamentals & Health</h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Earnings Per Share (EPS)</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {formatCurrency(summaryData.defaultKeyStatistics?.trailingEps, quoteData?.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Dividend Yield</span>
                            <span className="font-semibold text-claude-text font-mono text-green-700">
                              {summaryData.summaryDetail?.dividendYield?.fmt || formatPercent(summaryData.summaryDetail?.dividendYield)}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Total Cash Balance</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {formatCurrency(summaryData.financialData?.totalCash, quoteData?.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-dashed border-claude-border pb-1.5">
                            <span className="text-claude-secondary">Debt to Equity Ratio (MRQ)</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {summaryData.financialData?.debtToEquity?.fmt || summaryData.financialData?.debtToEquity?.raw || 'N/A'}%
                            </span>
                          </div>
                          <div className="flex justify-between pb-1.5">
                            <span className="text-claude-secondary">Operating Profit Margin</span>
                            <span className="font-semibold text-claude-text font-mono">
                              {formatPercent(summaryData.financialData?.operatingMargins)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-claude-secondary text-xs">
                      Fundamental valuation data not available for this index ticker.
                    </div>
                  )}
                </div>
              )}

              {/* Technical Indicator Calculations Tab */}
              {activeAnalysisTab === 'technical' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* RSI */}
                    <div className="bg-claude-bg border border-claude-border rounded-2xl p-4 text-center">
                      <span className="text-[10px] uppercase font-bold text-claude-secondary tracking-wider block">Relative Strength Index (RSI)</span>
                      <div className="text-3xl font-serif font-bold text-claude-text mt-1.5">
                        {rsi14 !== null ? rsi14 : 'N/A'}
                      </div>
                      <span className={`text-[10px] font-semibold mt-1 px-2.5 py-0.5 rounded-full inline-block ${
                        rsi14 && rsi14 > 70 
                          ? 'bg-red-50 text-red-700 border border-red-200' 
                          : rsi14 && rsi14 < 30 
                          ? 'bg-green-50 text-green-700 border border-green-200' 
                          : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {technicalSentiment.rsiStatus}
                      </span>
                    </div>

                    {/* SMA 20 */}
                    <div className="bg-claude-bg border border-claude-border rounded-2xl p-4 text-center">
                      <span className="text-[10px] uppercase font-bold text-claude-secondary tracking-wider block">SMA 20 Day Average</span>
                      <div className="text-2xl font-serif font-bold text-claude-text mt-1.5">
                        {sma20 ? formatCurrency(sma20, quoteData?.currency) : 'N/A'}
                      </div>
                      <span className="text-[10px] text-claude-secondary block mt-1.5 font-mono">
                        {sma20 && quoteData ? (
                          quoteData.regularMarketPrice > sma20 
                            ? 'Price is above SMA (Bullish)' 
                            : 'Price is below SMA (Bearish)'
                        ) : 'Not enough sessions'}
                      </span>
                    </div>

                    {/* SMA 50 */}
                    <div className="bg-claude-bg border border-claude-border rounded-2xl p-4 text-center">
                      <span className="text-[10px] uppercase font-bold text-claude-secondary tracking-wider block">SMA 50 Day Average</span>
                      <div className="text-2xl font-serif font-bold text-claude-text mt-1.5">
                        {sma50 ? formatCurrency(sma50, quoteData?.currency) : 'N/A'}
                      </div>
                      <span className="text-[10px] text-claude-secondary block mt-1.5 font-mono font-medium">
                        {technicalSentiment.maCrossover}
                      </span>
                    </div>
                  </div>

                  {/* Mathematical sentiment meter */}
                  <div className="p-4 bg-amber-50/50 border border-claude-border rounded-2xl">
                    <div className="flex justify-between text-xs font-semibold text-claude-text mb-1.5">
                      <span>Indicators Synthesis Rating</span>
                      <span className="text-claude-accent font-mono">{technicalSentiment.label} ({technicalSentiment.score}%)</span>
                    </div>
                    {/* Progress slider bar */}
                    <div className="w-full h-3 bg-claude-card rounded-md overflow-hidden relative border border-claude-border">
                      <div 
                        className="h-full bg-claude-accent transition-all duration-1000" 
                        style={{ width: `${technicalSentiment.score}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-claude-secondary font-mono mt-1">
                      <span>Extreme Bearish (0)</span>
                      <span>Neutral (50)</span>
                      <span>Extreme Bullish (100)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Corporate Overview Profile Tab */}
              {activeAnalysisTab === 'profile' && (
                <div>
                  {summaryData?.assetProfile ? (
                    <div className="space-y-4">
                      {/* Meta segment */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2 font-mono">
                        <div className="p-2 border border-dashed border-claude-border rounded-xl">
                          <span className="text-[10px] text-claude-secondary block">Sector</span>
                          <span className="text-xs font-semibold text-claude-text">{summaryData.assetProfile.sector || 'N/A'}</span>
                        </div>
                        <div className="p-2 border border-dashed border-claude-border rounded-xl">
                          <span className="text-[10px] text-claude-secondary block">Industry</span>
                          <span className="text-xs font-semibold text-claude-text truncate block">{summaryData.assetProfile.industry || 'N/A'}</span>
                        </div>
                        <div className="p-2 border border-dashed border-claude-border rounded-xl">
                          <span className="text-[10px] text-claude-secondary block">Employees</span>
                          <span className="text-xs font-semibold text-claude-text">{summaryData.assetProfile.fullTimeEmployees ? summaryData.assetProfile.fullTimeEmployees.toLocaleString() : 'N/A'}</span>
                        </div>
                        <div className="p-2 border border-dashed border-claude-border rounded-xl">
                          <span className="text-[10px] text-claude-secondary block">HQ Address</span>
                          <span className="text-xs font-semibold text-claude-text truncate block">{summaryData.assetProfile.city || 'India'}</span>
                        </div>
                      </div>

                      {/* Business Summary */}
                      <div className="text-xs leading-relaxed text-claude-text bg-claude-bubble-user/10 p-3.5 border border-claude-border rounded-xl max-h-48 overflow-y-auto">
                        <h4 className="font-serif font-bold text-sm mb-1 text-claude-text">Corporate Business Profile</h4>
                        {summaryData.assetProfile.longBusinessSummary || 'Description summary not furnished.'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-claude-secondary text-xs">
                      Corporate profile summary not registered for this ticker index.
                    </div>
                  )}
                </div>
              )}

              {/* Yahoo Finance News Feed Tab */}
              {activeAnalysisTab === 'news' && (
                <div className="space-y-3">
                  {quoteData && chartMeta ? (
                    <div className="mb-2 italic text-[11px] text-claude-secondary font-mono">
                      Querying latest media articles catalogued for keyword ticker {selectedSymbol}...
                    </div>
                  ) : null}
                  {searchNews.length > 0 ? (
                    <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
                      {searchNews.slice(0, 6).map((art, idx) => (
                        <a
                          key={art.uuid || art.link || `news-${idx}`}
                          href={art.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block p-3 border border-claude-border hover:border-claude-accent rounded-2xl bg-claude-bg/50 hover:bg-white transition-all group"
                        >
                          <div className="flex items-center justify-between text-[10px] text-claude-secondary mb-1">
                            <span className="font-mono uppercase font-bold text-claude-accent">{art.publisher || 'Yahoo Finance'}</span>
                            <span>•</span>
                            <span>{art.providerPublishTime ? new Date(art.providerPublishTime * 1000).toLocaleDateString() : 'Recent'}</span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-semibold text-claude-text group-hover:text-claude-accent leading-snug">
                            {art.title}
                          </h4>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-claude-secondary text-xs">
                      No stock news matched search query. Type a keyword into the terminal's search bar to find general financial index news.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Gemini AI Stock Analyst Agency Panel & Custom Interactive Portfolio */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Custom Interactive Portfolio Tracker */}
          <div className="bg-white border border-claude-border rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3.5 mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-amber-600" />
                <h3 className="font-serif font-bold text-claude-text text-base">
                  My Equities Portfolio
                </h3>
              </div>
              
              <div className="flex bg-neutral-105 p-0.5 rounded-lg text-[10px]">
                <button
                  onClick={() => setActivePortfolioTab('holdings')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    activePortfolioTab === 'holdings' ? 'bg-white text-claude-text shadow-xs' : 'text-neutral-500 hover:text-claude-text'
                  }`}
                >
                  Holdings
                </button>
                <button
                  onClick={() => setActivePortfolioTab('advice')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    activePortfolioTab === 'advice' ? 'bg-white text-claude-text shadow-xs' : 'text-neutral-500 hover:text-claude-text'
                  }`}
                >
                  AI Advisor
                </button>
              </div>
            </div>

            {activePortfolioTab === 'holdings' ? (
              <div className="space-y-4">
                {/* Total Valuation Row */}
                {portfolio.length > 0 ? (() => {
                  let totalCost = 0;
                  let totalVal = 0;
                  portfolio.forEach(item => {
                    const cost = item.qty * item.buyPrice;
                    const curPrice = portfolioPrices[item.symbol] || item.buyPrice;
                    const val = item.qty * curPrice;
                    totalCost += cost;
                    totalVal += val;
                  });
                  const totalPnl = totalVal - totalCost;
                  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
                  const isProfit = totalPnl >= 0;

                  return (
                    <div className="p-4 rounded-2xl bg-[#FCFBF9] border border-amber-900/5 shadow-xs grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold block uppercase tracking-wider">Invested</span>
                        <span className="text-sm font-semibold text-neutral-700 font-mono">
                          {formatCurrency(totalCost, 'INR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold block uppercase tracking-wider">Current Val</span>
                        <span className="text-sm font-bold text-neutral-900 font-mono">
                          {formatCurrency(totalVal, 'INR')}
                        </span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-dashed border-neutral-200 flex items-center justify-between">
                        <span className="text-xs text-neutral-500 font-medium">Total Returns</span>
                        <div className={`text-xs font-bold font-mono flex items-center gap-1 ${isProfit ? 'text-green-600' : 'text-red-500'}`}>
                          {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{isProfit ? '+' : ''}{totalPnl.toFixed(2)} ({totalPnlPct.toFixed(2)}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="text-center py-5 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200 text-xs text-neutral-400">
                    No active assets. Add your first stock below!
                  </div>
                )}

                {/* Portfolio items list */}
                {portfolio.length > 0 && (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {portfolio.map((item, idx) => {
                      const curPrice = portfolioPrices[item.symbol] || item.buyPrice;
                      const invested = item.qty * item.buyPrice;
                      const val = item.qty * curPrice;
                      const pnlPct = invested > 0 ? ((val - invested) / invested) * 100 : 0;
                      const isProfit = pnlPct >= 0;

                      return (
                        <div 
                          key={`${item.symbol}-${idx}`} 
                          onClick={() => setSelectedSymbol(item.symbol)}
                          className={`p-3 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                            selectedSymbol === item.symbol 
                              ? 'bg-amber-50/40 border-amber-500/30 shadow-xs' 
                              : 'bg-white hover:bg-neutral-50/50 border-neutral-100'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-xs text-neutral-800 truncate">{item.symbol.replace(/\.(NS|BO)$/, '')}</span>
                              <span className="text-[9px] bg-neutral-100 text-neutral-500 px-1 py-0.2 rounded font-mono">
                                {item.qty} units
                              </span>
                            </div>
                            <span className="text-[10px] text-neutral-400 block truncate">{item.name}</span>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-neutral-800 block font-mono">
                              {formatCurrency(val, item.currency)}
                            </span>
                            <span className={`text-[10px] font-semibold font-mono ${isProfit ? 'text-green-600' : 'text-red-500'}`}>
                              {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                            </span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromPortfolio(item.symbol);
                            }}
                            className="ml-3 p-1 rounded-md text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove Stock"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Inline form to Add current stock */}
                {quoteData && (
                  <div className="pt-2 border-t border-neutral-100">
                    {!showPortfolioAddForm ? (
                      <button
                        onClick={() => setShowPortfolioAddForm(true)}
                        className="w-full py-2 bg-neutral-50 hover:bg-neutral-100/60 text-claude-text font-bold rounded-2xl text-xs transition-colors border border-neutral-200/60 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-600" />
                        Add {selectedSymbol.replace(/\.(NS|BO)$/, '')} to Portfolio
                      </button>
                    ) : (
                      <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3 font-sans">
                        <div className="flex justify-between items-center pb-1.5 border-b border-neutral-200">
                          <span className="text-xs font-bold text-neutral-700">Add {selectedSymbol}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPortfolioAddForm(false);
                            }}
                            className="text-[10px] font-bold text-neutral-400 hover:text-neutral-600 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] block text-neutral-400 font-bold uppercase mb-1">Buy Price (₹)</span>
                            <input
                              type="number"
                              className="w-full bg-white border border-neutral-200 rounded-xl px-2 py-1.5 font-mono text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                              value={portfolioAddPrice || ''}
                              onChange={(e) => setPortfolioAddPrice(parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span className="text-[10px] block text-neutral-400 font-bold uppercase mb-1">Quantity (Units)</span>
                            <input
                              type="number"
                              className="w-full bg-white border border-neutral-200 rounded-xl px-2 py-1.5 font-mono text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                              value={portfolioAddQty || ''}
                              onChange={(e) => setPortfolioAddQty(parseInt(e.target.value) || 1)}
                            />
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToPortfolio(selectedSymbol, portfolioAddQty, portfolioAddPrice);
                          }}
                          className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1"
                        >
                          Confirm & Save Asset
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3.5 min-h-[200px] flex flex-col font-sans">
                <p className="text-xs text-neutral-500 leading-normal">
                  Our advanced Gemini portfolio advisor diagnoses holdings structure, returns distribution and lists compounding advice.
                </p>

                {portfolio.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-neutral-400 text-center border border-dashed border-neutral-200 rounded-2xl p-4">
                    Please buy/add equities first to enable the Portfolio Advisor.
                  </div>
                ) : !portfolioReport && !isGeneratingPortfolioReport ? (
                  <button
                    onClick={handleGeneratePortfolioReport}
                    className="w-full mt-auto py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 text-amber-100" />
                    Compute Portfolio AI Summary
                  </button>
                ) : (
                  <div className="flex-1 flex flex-col text-xs bg-[#FCFBF9] border border-neutral-200 rounded-2xl p-3.5">
                    <div className="flex justify-between items-center text-[10px] text-neutral-400 pb-1.5 border-b border-neutral-250 font-mono mb-2">
                      <span>CFA Portfolio Advisor</span>
                      {isGeneratingPortfolioReport && (
                        <span className="text-amber-600 font-semibold animate-pulse">Running Audits...</span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[220px] prose prose-sm leading-relaxed pr-1 whitespace-pre-wrap">
                      {portfolioReport ? (
                        portfolioReport
                      ) : (
                        <div className="flex flex-col items-center justify-center h-32 gap-2 text-center text-neutral-400">
                          <RefreshCw className="w-5 h-5 text-amber-600 animate-spin" />
                          <span>Generating financial advice...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gemini AI Stock Analyst Agency Panel */}
          <div className="bg-white border border-claude-border rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1 px-2.5 bg-amber-50 border border-amber-200/50 rounded-xl text-claude-accent text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" />
                Gemini AI Agent
              </div>
            </div>
            
            <h3 className="text-lg font-serif font-bold text-claude-text">
              Real-Time Equity Researcher
            </h3>
            <p className="text-xs text-claude-secondary mb-4 leading-normal">
              Synthesizes live fundamental multiples and moving averages to prepare a complete equity analysis.
            </p>

            {/* If no stock is selected */}
            {!quoteData ? (
              <div className="p-6 bg-claude-bg/40 rounded-2xl text-center text-xs text-claude-secondary flex-1 flex flex-col justify-center border border-dashed border-claude-border">
                Please search and load a valid ticker/stock details view to activate the intelligence engine.
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                
                {/* Metrics preview list */}
                <div className="text-xs rounded-2xl bg-claude-bg border border-claude-border p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-claude-secondary">Entity</span>
                    <span className="font-semibold text-claude-text truncate max-w-[120px]">{quoteData.shortName || quoteData.longName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-claude-secondary">Price Point</span>
                    <span className="font-bold text-claude-accent font-mono">{formatCurrency(quoteData.regularMarketPrice, quoteData.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-claude-secondary">Technical Sentiment</span>
                    <span className="font-semibold text-claude-text font-mono underline decoration-claude-accent decoration-dashed">{technicalSentiment.label}</span>
                  </div>
                </div>

                {/* Generate action block */}
                {!aiReport && !isGeneratingReport ? (
                  <button
                    onClick={handleGenerateAIReport}
                    className="w-full py-3 px-4 bg-claude-accent hover:opacity-90 text-white font-medium rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                  >
                    <Sparkles className="w-4 h-4 text-amber-100" />
                    Compile Gemini Research Report
                  </button>
                ) : (
                  <div className="flex-1 flex flex-col min-h-[300px]">
                    <div className="flex justify-between items-center text-xs text-claude-secondary pb-2 border-b border-claude-border mb-3 font-mono">
                      <span>Analysis Report Target: {selectedSymbol}</span>
                      {isGeneratingReport ? (
                        <span className="text-claude-accent animate-pulse flex items-center gap-1 font-semibold">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Deconstructing...
                        </span>
                      ) : (
                        <button 
                          onClick={handleGenerateAIReport}
                          className="hover:text-claude-accent cursor-pointer flex items-center gap-1 font-semibold text-[10px]"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerate
                        </button>
                      )}
                    </div>
                    
                    {/* Render AI Report content safely */}
                    <div className="flex-1 overflow-y-auto text-xs leading-relaxed text-claude-text pr-1 max-h-[350px]">
                      {aiReport ? (
                        <article className="prose prose-sm font-sans max-w-none space-y-3 whitespace-pre-wrap">
                          {aiReport}
                        </article>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3.5 h-64 text-center">
                          <Cpu className="w-8 h-8 text-claude-accent animate-bounce" />
                          <div className="space-y-1">
                            <span className="font-semibold text-claude-text block">Consulting Financial Analyst Models</span>
                            <span className="text-[10px] text-claude-secondary block max-w-[180px] mx-auto">Evaluating stock multipliers and mathematical indexes...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Stock Analysis integration with default assistant */}
                {onSendMessage && quoteData && (
                  <div className="pt-3 border-t border-claude-border">
                    <button
                      onClick={() => {
                        const tickerQuery = `Analyze the current price of ${quoteData.longName || selectedSymbol} (Ticker: ${selectedSymbol}), trading at ${quoteData.regularMarketPrice} ${quoteData.currency || 'INR'}. Check its general stock prospects and technical status.`;
                        onSendMessage(tickerQuery);
                      }}
                      className="w-full py-2 bg-claude-card hover:bg-claude-bubble-user text-claude-text font-semibold rounded-xl text-[11px] border border-claude-border transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-claude-accent" />
                      Discuss stock details in Main Chat
                    </button>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
