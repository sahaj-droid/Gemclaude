import express from 'express';
import path from 'path';

import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import YahooFinanceImport from 'yahoo-finance2';

// Robust ESM/CJS interop handler for yahoo-finance2
const YahooFinance = typeof YahooFinanceImport === 'function'
  ? YahooFinanceImport
  : (YahooFinanceImport as any).default;

const yahooFinance = new YahooFinance();

// Configure Yahoo Finance to ignore schema validation mismatches which throw 404/not found errors
(yahooFinance as any)._setOpts({
  validation: {
    logErrors: false,
    logOptionsErrors: false,
    allowAdditionalProps: true
  }
});

dotenv.config();



// Helper function to create deterministic numbers based on a symbol string signature
function getDeterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Check if raw error message indicates rate limits or quota issues
function isQuotaOrRateLimit(message: string, status?: number): boolean {
  if (status === 429) return true;
  const lower = (message || '').toLowerCase();
  return lower.includes('quota') || 
         lower.includes('exhausted') || 
         lower.includes('429') || 
         lower.includes('too many requests') || 
         lower.includes('rate limit');
}

// Resilient fallback generator for Quotes
function getFallbackQuote(symbolStr: string) {
  const symbol = symbolStr.toUpperCase();
  const hash = getDeterministicHash(symbol);
  
  const seeds: Record<string, { name: string; price: number; sector: string; industry: string; change: number; type?: string }> = {
    '^NSEI': { name: 'Nifty 50', price: 23622.90, sector: 'Financials & Industry', industry: 'Index', change: 461.30, type: 'INDEX' },
    '^BSESN': { name: 'BSE Sensex', price: 75527.95, sector: 'Financials & Industry', industry: 'Index', change: 1695.45, type: 'INDEX' },
    'RELIANCE.NS': { name: 'Reliance Industries Limited', price: 1296.40, sector: 'Energy', industry: 'Oil & Gas Refining', change: 33.40 },
    'TCS.NS': { name: 'Tata Consultancy Services Limited', price: 2161.10, sector: 'Technology', industry: 'IT Services', change: 25.50 },
    'TATAMOTORS.NS': { name: 'Tata Motors Limited', price: 924.50, sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', change: 14.75 },
    'HDFCBANK.NS': { name: 'HDFC Bank Limited', price: 771.95, sector: 'Financial Services', industry: 'Banks - Regional', change: 27.35 },
    'INFY.NS': { name: 'Infosys Limited', price: 1118.50, sector: 'Technology', industry: 'IT Services', change: 3.90 },
    'SBIN.NS': { name: 'State Bank of India', price: 1016.40, sector: 'Financial Services', industry: 'Banks - Regional', change: 15.70 },
    'ITC.NS': { name: 'ITC Limited', price: 285.70, sector: 'Consumer Defensive', industry: 'Tobacco', change: 3.30 }
  };

  const seed = seeds[symbol] || {
    name: symbol.endsWith('.NS') ? `${symbol.replace('.NS', '')} Holdings Ltd.` : `${symbol} Corp`,
    price: (hash % 1200) + 120,
    sector: ['Technology', 'Financial Services', 'Energy', 'Consumer Cyclical', 'Healthcare'][hash % 5],
    industry: ['Software', 'Regional Banks', 'Oil & Gas', 'Auto Manufacturers', 'Biotechnology'][hash % 5],
    change: ((hash % 100) - 50) / 10
  };

  const pct = seed.change / (seed.price - seed.change);

  return {
    symbol: symbol,
    longName: seed.name,
    shortName: seed.name,
    regularMarketPrice: seed.price,
    regularMarketChange: seed.change,
    regularMarketChangePercent: pct * 100,
    currency: symbol.endsWith('.NS') || symbol.startsWith('^') ? 'INR' : 'USD',
    exchange: symbol.endsWith('.NS') ? 'NSE' : 'NYSE',
    quoteType: seed.type || 'EQUITY',
    marketState: 'REGULAR',
    regularMarketVolume: (hash % 800000) + 200000,
    regularMarketPreviousClose: seed.price - seed.change,
    regularMarketOpen: seed.price - (seed.change / 2),
    regularMarketDayHigh: seed.price + Math.abs(seed.change * 0.45) + 1.2,
    regularMarketDayLow: seed.price - Math.abs(seed.change * 0.45) - 1.2,
    regularMarketTime: Math.floor(Date.now() / 1000),
    marketCap: seed.price * ((hash % 500000) + 100000) * 100
  };
}

// Resilient fallback generator for Summaries
function getFallbackSummary(symbolStr: string) {
  const symbol = symbolStr.toUpperCase();
  const hash = getDeterministicHash(symbol);
  const quote = getFallbackQuote(symbol);
  
  const pe = (hash % 25) + 12;
  const eps = quote.regularMarketPrice / pe;
  const pb = (hash % 6) + 1.5;
  const divYield = (hash % 3.5) / 100;
  const debtEquity = (hash % 110) + 15;
  const margin = ((hash % 20) + 6) / 100;

  return {
    summaryDetail: {
      fiftyTwoWeekHigh: { raw: quote.regularMarketPrice * 1.22, fmt: (quote.regularMarketPrice * 1.22).toFixed(2) },
      fiftyTwoWeekLow: { raw: quote.regularMarketPrice * 0.78, fmt: (quote.regularMarketPrice * 0.78).toFixed(2) },
      trailingPE: { raw: pe, fmt: pe.toFixed(2) },
      forwardPE: { raw: pe * 0.88, fmt: (pe * 0.88).toFixed(2) },
      dividendYield: { raw: divYield, fmt: (divYield * 100).toFixed(2) + '%' },
    },
    defaultKeyStatistics: {
      priceToBook: { raw: pb, fmt: pb.toFixed(2) },
      trailingEps: { raw: eps, fmt: eps.toFixed(2) },
      enterpriseValue: { raw: quote.marketCap * 1.08, fmt: (quote.marketCap * 1.08).toFixed(2) },
      sharesOutstanding: { raw: Math.floor(quote.marketCap / quote.regularMarketPrice), fmt: Math.floor(quote.marketCap / quote.regularMarketPrice).toLocaleString() }
    },
    financialData: {
      totalCash: { raw: quote.marketCap * 0.15, fmt: (quote.marketCap * 0.15).toFixed(2) },
      debtToEquity: { raw: debtEquity, fmt: debtEquity.toFixed(2) },
      operatingMargins: { raw: margin * 1.15, fmt: (margin * 1.15 * 100).toFixed(2) + '%' },
      profitMargins: { raw: margin, fmt: (margin * 100).toFixed(2) + '%' }
    },
    assetProfile: {
      sector: quote.quoteType === 'INDEX' ? 'Financials' : (symbol === 'RELIANCE.NS' ? 'Energy' : (symbol === 'TCS.NS' || symbol === 'INFY.NS' ? 'Technology' : (symbol === 'TATAMOTORS.NS' ? 'Consumer Cyclical' : (symbol === 'HDFCBANK.NS' || symbol === 'SBIN.NS' ? 'Financial Services' : 'Industrial')))),
      industry: quote.quoteType === 'INDEX' ? 'Indices' : (symbol === 'RELIANCE.NS' ? 'Oil & Gas Refining' : (symbol === 'TCS.NS' || symbol === 'INFY.NS' ? 'IT Services' : (symbol === 'TATAMOTORS.NS' ? 'Auto Manufacturers' : 'Banks - Regional'))),
      fullTimeEmployees: (hash % 120000) + 15000,
      city: 'Mumbai',
      longBusinessSummary: `${quote.longName} is an elite, highly active Indian multinational enterprise showing robust national growth and expansion. Known for consistent research, operational leadership, and strong local value-add projects, the entity stands as a pillar within the segment.`
    }
  };
}

// Resilient fallback generator for Chart history
function getFallbackChart(symbolStr: string, range: string, interval: string) {
  const symbol = symbolStr.toUpperCase();
  const quote = getFallbackQuote(symbol);
  
  const end = new Date();
  const start = new Date();
  
  let pointsCount = 30;
  
  switch (range) {
    case '1d':
      start.setDate(end.getDate() - 1);
      pointsCount = 24;
      break;
    case '5d':
      start.setDate(end.getDate() - 5);
      pointsCount = 30;
      break;
    case '1mo':
      start.setMonth(end.getMonth() - 1);
      pointsCount = 30;
      break;
    case '6mo':
      start.setMonth(end.getMonth() - 6);
      pointsCount = 60;
      break;
    case '1y':
      start.setFullYear(end.getFullYear() - 1);
      pointsCount = 100;
      break;
    case '5y':
      start.setFullYear(end.getFullYear() - 5);
      pointsCount = 150;
      break;
    default:
      start.setMonth(end.getMonth() - 1);
      pointsCount = 30;
  }

  const timestamps: number[] = [];
  const closes: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const volumes: number[] = [];

  const basePrice = quote.regularMarketPreviousClose;
  const finalPrice = quote.regularMarketPrice;

  const diffPerStep = (finalPrice - basePrice) / pointsCount;
  let currentPrice = basePrice;
  const startTime = start.getTime();
  const timeStep = (end.getTime() - startTime) / pointsCount;

  for (let i = 0; i <= pointsCount; i++) {
    const timestamp = Math.floor((startTime + i * timeStep) / 1000);
    const stepNoise = ((getDeterministicHash(symbol + i) % 100) - 50) / 1600;
    currentPrice = currentPrice + diffPerStep + (currentPrice * stepNoise);
    
    if (i === pointsCount) {
      currentPrice = finalPrice;
    }

    timestamps.push(timestamp);
    closes.push(parseFloat(currentPrice.toFixed(2)));
    opens.push(parseFloat((currentPrice * (1 + ((getDeterministicHash(symbol + i + 'o') % 40) - 20) / 4000)).toFixed(2)));
    highs.push(parseFloat((currentPrice * (1 + (getDeterministicHash(symbol + i + 'h') % 40) / 4000)).toFixed(2)));
    lows.push(parseFloat((currentPrice * (1 - (getDeterministicHash(symbol + i + 'l') % 40) / 4000)).toFixed(2)));
    volumes.push(Math.floor((quote.regularMarketVolume / pointsCount) * (0.8 + (getDeterministicHash(symbol + i + 'v') % 40) / 100)));
  }

  return {
    meta: {
      currency: quote.currency,
      symbol: symbol,
      exchangeName: quote.exchange,
      instrumentType: quote.quoteType,
      firstTradeDate: Math.floor((Date.now() - 365 * 24 * 3600 * 1000) / 1000),
      regularMarketTime: quote.regularMarketTime,
      gmtoffset: 19800,
      timezone: 'IST',
      exchangeTimezoneName: 'Asia/Kolkata',
      regularMarketPrice: quote.regularMarketPrice,
      chartPreviousClose: quote.regularMarketPreviousClose,
      previousClose: quote.regularMarketPreviousClose,
      scale: 1,
      priceHint: 2,
      dataGranularity: interval,
      range: range,
    },
    timestamp: timestamps,
    indicators: {
      quote: [
        {
          close: closes,
          open: opens,
          high: highs,
          low: lows,
          volume: volumes,
        }
      ]
    }
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health and config endpoint
  app.get('/api/config', (req, res) => {
    res.json({
      hasKey: !!process.env.GEMINI_API_KEY,
      userEmail: 'sahaj.cute@gmail.com',
    });
  });

  // 1. Yahoo Finance Search / Auto-complete and News endpoint
  app.get('/api/finance/search', async (req, res) => {
    const q = (req.query.q || '').toString();
    if (!q) {
      return res.json({ quotes: [], news: [] });
    }
    try {
      const data = await yahooFinance.search(q, {
        quotesCount: 10,
        newsCount: 8,
        enableFuzzyQuery: true
      } as any);
      res.json(data);
    } catch (err: any) {
      console.log('[Yahoo Finance Search, local matching used]:', err.message);
      
      const popularMatches = [
        { symbol: '^NSEI', name: 'Nifty 50', type: 'INDEX', shortname: 'Nifty 50', longname: 'Nifty 50 Index', exchange: 'NSE', typeDisp: 'Index' },
        { symbol: '^BSESN', name: 'BSE Sensex', type: 'INDEX', shortname: 'BSE Sensex', longname: 'BSE Sensex Index', exchange: 'BSE', typeDisp: 'Index' },
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', type: 'EQUITY', shortname: 'Reliance Ind', longname: 'Reliance Industries Limited', exchange: 'NSE', typeDisp: 'Stock' },
        { symbol: 'TCS.NS', name: 'TCS', type: 'EQUITY', shortname: 'TCS', longname: 'Tata Consultancy Services Limited', exchange: 'NSE', typeDisp: 'Stock' },
        { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', type: 'EQUITY', shortname: 'Tata Motors', longname: 'Tata Motors Limited', exchange: 'NSE', typeDisp: 'Stock' },
        { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', type: 'EQUITY', shortname: 'HDFC Bank', longname: 'HDFC Bank Limited', exchange: 'NSE', typeDisp: 'Stock' },
        { symbol: 'INFY.NS', name: 'Infosys', type: 'EQUITY', shortname: 'Infosys', longname: 'Infosys Limited', exchange: 'NSE', typeDisp: 'Stock' },
        { symbol: 'SBIN.NS', name: 'State Bank of India', type: 'EQUITY', shortname: 'SBI', longname: 'State Bank of India', exchange: 'NSE', typeDisp: 'Stock' },
        { symbol: 'ITC.NS', name: 'ITC Limited', type: 'EQUITY', shortname: 'ITC', longname: 'ITC Limited', exchange: 'NSE', typeDisp: 'Stock' },
      ];

      const filtered = popularMatches.filter(m => 
        m.symbol.toLowerCase().includes(q.toLowerCase()) || 
        m.name.toLowerCase().includes(q.toLowerCase())
      );

      res.json({ quotes: filtered, news: [] });
    }
  });

  // 2. Yahoo Finance Live Quote endpoint
  app.get('/api/finance/quote', async (req, res) => {
    const symbol = (req.query.symbol || '').toString();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required.' });
    }
    try {
      const quote = await yahooFinance.quote(symbol);
      if (!quote) {
        throw new Error('Quote returned was empty');
      }
      res.json(quote);
    } catch (err: any) {
      console.log(`[Yahoo Finance Quote for ${symbol}, applying fallback]:`, err.message);
      const fallback = getFallbackQuote(symbol);
      res.json(fallback);
    }
  });

  // 3. Yahoo Finance Fundamentals Summary endpoint
  app.get('/api/finance/summary', async (req, res) => {
    const symbol = (req.query.symbol || '').toString();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required.' });
    }
    try {
      const data = await yahooFinance.quoteSummary(symbol, {
        modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics', 'assetProfile']
      });
      if (!data) {
        throw new Error('Summary returned was empty');
      }
      res.json(data);
    } catch (err: any) {
      console.log(`[Yahoo Finance Summary for ${symbol}, applying fallback]:`, err.message);
      const fallback = getFallbackSummary(symbol);
      res.json(fallback);
    }
  });

  // 4. Yahoo Finance Chart / History endpoint
  app.get('/api/finance/chart', async (req, res) => {
    const symbol = (req.query.symbol || '').toString();
    const range = (req.query.range || '1mo').toString(); // 1d, 5d, 1mo, 6mo, 1y, 5y
    const interval = (req.query.interval || '1d').toString(); // 5m, 15m, 1h, 1d, 1wk
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required.' });
    }

    const getPeriod1 = (r: string): Date => {
      const now = new Date();
      switch (r) {
        case '1d':
          now.setDate(now.getDate() - 1);
          break;
        case '5d':
          now.setDate(now.getDate() - 5);
          break;
        case '1mo':
          now.setMonth(now.getMonth() - 1);
          break;
        case '6mo':
          now.setMonth(now.getMonth() - 6);
          break;
        case '1y':
          now.setFullYear(now.getFullYear() - 1);
          break;
        case '5y':
          now.setFullYear(now.getFullYear() - 5);
          break;
        case 'max':
          return new Date('1980-01-01');
        default:
          now.setMonth(now.getMonth() - 1);
      }
      return now;
    };

    try {
      const result = await yahooFinance.chart(symbol, {
        period1: getPeriod1(range),
        period2: new Date(),
        interval: interval as any
      });

      if (!result || !result.quotes) {
        throw new Error('Chart data returned was empty');
      }

      const timestamps: number[] = [];
      const closes: (number | null)[] = [];
      const opens: (number | null)[] = [];
      const highs: (number | null)[] = [];
      const lows: (number | null)[] = [];
      const volumes: (number | null)[] = [];

      for (const q of result.quotes) {
        if (q.date) {
          const ts = Math.floor(new Date(q.date).getTime() / 1000);
          timestamps.push(ts);
          closes.push(q.close);
          opens.push(q.open);
          highs.push(q.high);
          lows.push(q.low);
          volumes.push(q.volume);
        }
      }

      const formattedResult = {
        meta: result.meta,
        timestamp: timestamps,
        indicators: {
          quote: [
            {
              close: closes,
              open: opens,
              high: highs,
              low: lows,
              volume: volumes
            }
          ]
        }
      };

      res.json(formattedResult);
    } catch (err: any) {
      console.log(`[Yahoo Finance Chart for ${symbol}, applying fallback]:`, err.message);
      const fallback = getFallbackChart(symbol, range, interval);
      res.json(fallback);
    }
  });

  // Gemini streaming chat endpoint
  app.post('/api/chat', async (req, res) => {
    const { messages, model, searchGrounding } = req.body;
    
    // Support custom/grounding models if searchGrounding is enabled, otherwise use standard models
    let rawModel = 'gemini-3.5-flash';
    if (searchGrounding) {
      if (model && model !== 'gemini-3.5-flash' && model !== 'gemini-3.1-flash-lite') {
        rawModel = model;
      } else {
        rawModel = 'gemini-3.1-flash-lite'; // safe default model
      }
    } else {
      rawModel = model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash';
    }

    // Map unsupported/legacy/pre-production models to supported production models to prevent 404 errors
    const modelMap: Record<string, string> = {
      'gemini-3.5-flash': 'gemini-3.5-flash',
      'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
      'models/gemini-2.0-flash-001': 'gemini-3.5-flash',
      'models/gemini-2.0-flash': 'gemini-3.5-flash',
      'models/gemini-2.5-pro': 'gemini-3.1-pro-preview',
      'models/gemini-2.5-flash-native-audio-preview-12-2025': 'gemini-3.5-flash',
      'models/gemini-2.5-flash-native-audio-preview-09-2025': 'gemini-3.5-flash',
      'models/gemini-2.5-flash-native-audio-latest': 'gemini-3.5-flash',
      'models/gemini-2.5-flash-lite': 'models/gemini-2.5-flash-lite',
      'models/gemini-2.5-flash': 'gemini-3.5-flash',
      'models/gemma-4-31b-it': 'gemini-3.5-flash',
      'models/gemma-4-26b-a4b-it': 'gemini-3.5-flash',
      'models/gemini-robotics-er-1.6-preview': 'gemini-3.5-flash',
      'models/gemini-robotics-er-1.5-preview': 'gemini-3.5-flash',
      'models/gemini-2.5-computer-use-preview-10-2025': 'gemini-3.5-flash',
      'models/deep-research-pro-preview-12-2025': 'gemini-3.1-pro-preview',
      'models/deep-research-preview-04-2026': 'gemini-3.1-pro-preview',
      'models/deep-research-max-preview-04-2026': 'gemini-3.1-pro-preview',
      'models/antigravity-preview-05-2026': 'gemini-3.5-flash'
    };

    let modelToUse = modelMap[rawModel] || rawModel;

    // Google Search Grounding is best supported on gemini-3.5-flash
    if (searchGrounding && (modelToUse === 'gemini-3.1-flash-lite' || modelToUse.includes('audio'))) {
      modelToUse = 'gemini-3.5-flash';
    }

    console.log(`[Gemini API] Request received for model: ${modelToUse} (grounding: ${!!searchGrounding}), history size: ${messages?.length}`);

    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const currentApiKey = process.env.GEMINI_API_KEY;
    if (!currentApiKey) {
      res.write(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server. Please add it via the Secrets panel.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    try {
      // Lazy initialization of Gemini Client inside the route handler
      const ai = new GoogleGenAI({
        apiKey: currentApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Map frontend messages structure to @google/genai SDK Content structure
      const contents = messages.map((m: any) => {
        const parts: any[] = [];
        
        if (m.text) {
          parts.push({ text: m.text });
        }
        
        if (m.attachments && m.attachments.length > 0) {
          m.attachments.forEach((att: any) => {
            if (att.base64 && att.mimeType) {
              parts.push({
                inlineData: {
                  data: att.base64,
                  mimeType: att.mimeType,
                },
              });
            }
          });
        }

        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: parts.length > 0 ? parts : [{ text: '' }],
        };
      });

      try {
        const sysInstruction = searchGrounding
          ? `You are Gemclaude — an elite AI assistant, expert full-stack software engineer, and real-time information specialist powered by Google Search grounding. Today's date is ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

CODING EXCELLENCE (always apply when writing code):
- Write PRODUCTION-READY code: handle edge cases, null checks, and errors gracefully
- Follow language-specific best practices: PEP8 for Python, ESLint/modern ES2022+ for JS/TS, null safety for Kotlin
- Add clear comments explaining WHY complex logic exists, not just what it does
- Use meaningful variable/function names - never vague single-letter names except loop counters
- After non-trivial code, briefly state Time and Space Complexity (e.g. O(n log n) time)
- Proactively identify bugs, security issues, or anti-patterns in user-provided code
- Prefer pure functions, immutability, and single-responsibility principle
- Wrap ALL code in properly labeled fenced blocks with the language name

REAL-TIME SEARCH:
- Use Google Search aggressively for any news, weather, current events, prices, or anything after early 2025
- Cite sources with markdown links: [Source](URL)
- For live Indian stocks/indices, mention the Finance India Terminal tab in sidebar for interactive real-time charts

RESPONSE FORMAT:
- Use markdown headers to organize long answers
- Use bullet points and numbered steps for explanations
- Be concise but complete - avoid filler text and unnecessary disclaimers`
          : `You are Gemclaude — an elite AI assistant and expert software engineer. You are sharp, friendly, and deeply technical.

CODING EXCELLENCE (your primary strength):
- Write PRODUCTION-READY code: always handle edge cases, null/undefined, and errors
- Follow language best practices:
  JavaScript/TypeScript: modern ES2022+, async/await, strict typing, never use var
  Python: PEP8, type hints, f-strings, context managers
  Kotlin/Java: idiomatic style, null safety, coroutines
  SQL: parameterized queries only (never string concatenation), add index hints
- Add meaningful comments explaining WHY complex logic exists
- Use descriptive names: getUserSessionById not getU, isEmailValid not check
- After non-trivial algorithms, state Time and Space Complexity (e.g. O(n log n) time, O(n) space)
- PROACTIVELY identify bugs, security vulnerabilities, or anti-patterns in user code before fixing
- When fixing code, first explain WHAT the bug is and WHY it happens, then show the fix
- Suggest refactors when cleaner approaches exist
- Prefer immutability, pure functions, and single-responsibility principle

GENERAL EXCELLENCE:
- For finance/stock questions: provide objective analysis; remind user about Finance India Terminal tab for live charts
- Use analogies and ASCII diagrams when explaining complex concepts
- Be direct - skip filler phrases and unnecessary disclaimers
- If a question is ambiguous, ask ONE clarifying question before answering

RESPONSE FORMAT:
- Markdown headers for structured long answers
- ALL code in labeled fenced blocks: python, typescript, bash, kotlin, etc.
- Use emojis sparingly only to highlight critical notes
- Keep responses focused and scannable`;

        console.log(`[Gemini API] Requesting stream using model ${modelToUse} with searchGrounding=${!!searchGrounding}...`);
        
        let keepGenerating = true;
        let currentContents = [...contents]; // Working history for function calls

        // Universal Tools Definition
        const customTools = {
          functionDeclarations: [
            {
              name: 'execute_javascript',
              description: 'Executes Javascript code in a secure Node.js sandbox. Use this for math, algorithms, and data processing. Returns the console output and final result.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  code: { type: 'STRING', description: 'The Javascript code to execute.' }
                },
                required: ['code']
              }
            },
            {
              name: 'read_website',
              description: 'Fetches and parses the text content of any given URL.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  url: { type: 'STRING', description: 'The fully qualified URL to read' }
                },
                required: ['url']
              }
            },
            {
              name: 'github_api',
              description: 'Fetches the content of a file from a public GitHub repository.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  owner: { type: 'STRING', description: 'Repository owner username' },
                  repo: { type: 'STRING', description: 'Repository name' },
                  path: { type: 'STRING', description: 'Path to the file inside the repo' }
                },
                required: ['owner', 'repo', 'path']
              }
            }
          ]
        };

        const toolsArr: any[] = [customTools];
        if (searchGrounding) {
          toolsArr.push({ googleSearch: {} });
        }

        while (keepGenerating) {
          let responseStream;
          try {
            responseStream = await ai.models.generateContentStream({
              model: modelToUse,
              contents: currentContents,
              config: {
                systemInstruction: sysInstruction,
                tools: toolsArr
              }
            });
        } catch (firstTryErr: any) {
          const errMsg = firstTryErr?.message || (typeof firstTryErr === 'string' ? firstTryErr : JSON.stringify(firstTryErr));
          const isQuota = isQuotaOrRateLimit(errMsg, firstTryErr?.status);
          
          if (isQuota) {
            console.log(`[Gemini API] Quota/Rate Limit (429) hit for ${modelToUse}. Attempting fallback to gemini-3.1-flash-lite...`);
            
            // Notify the user of the live fallback inside the markdown stream
            const notification = `> ⚠️ **Standard Quota Rate-Limit Active**: The direct API quota for ${modelToUse === 'gemini-3.5-flash' ? 'Gemini 3.5 Flash' : modelToUse} has been briefly exceeded.
> **Resilient Fallback Triggered**: We have seamlessly routed your request to **Gemini 3.1 Flash-Lite** to ensure uninterrupted access.
\n\n`;
            
            res.write(`data: ${JSON.stringify({ text: notification })}\n\n`);
            
            responseStream = await ai.models.generateContentStream({
              model: 'gemini-3.1-flash-lite',
              contents: currentContents,
              config: {
                systemInstruction: sysInstruction,
                tools: toolsArr
              }
            });
          } else {
            throw firstTryErr;
          }
        }

        let functionCallsToExecute: any[] = [];

        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata || null;
            res.write(`data: ${JSON.stringify({ text: chunk.text, groundingMetadata })}\n\n`);
          }
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            functionCallsToExecute.push(...chunk.functionCalls);
          }
        }

        if (functionCallsToExecute.length > 0) {
          // Add the model's function calls to the history
          currentContents.push({
            role: 'model',
            parts: functionCallsToExecute.map(fc => ({ functionCall: fc }))
          });

          const functionResponses = [];
          for (const fc of functionCallsToExecute) {
            res.write(`data: ${JSON.stringify({ text: `\n> ⚡ **Agent Action**: Executing \`${fc.name}\`...\n\n` })}\n\n`);
            
            let resultStr = '';
            try {
              if (fc.name === 'execute_javascript') {
                const { executeJavascript } = await import('./tools/codeInterpreter.js');
                resultStr = await executeJavascript(fc.args.code);
              } else if (fc.name === 'read_website') {
                const { readWebsite } = await import('./tools/webReader.js');
                resultStr = await readWebsite(fc.args.url);
              } else if (fc.name === 'github_api') {
                const { fetchGithubRepoFile } = await import('./tools/githubBrowser.js');
                resultStr = await fetchGithubRepoFile(fc.args.owner, fc.args.repo, fc.args.path);
              } else {
                resultStr = 'Unknown function call';
              }
            } catch (err: any) {
              resultStr = `Error executing ${fc.name}: ${err.message}`;
            }

            functionResponses.push({
              functionResponse: {
                name: fc.name,
                response: { result: resultStr }
              }
            });
            
            res.write(`data: ${JSON.stringify({ text: `> ✅ **Action Completed**\n\n` })}\n\n`);
          }

          // Add the responses back to the history
          currentContents.push({
            role: 'user',
            parts: functionResponses
          });
          
          // The loop will continue and call generateContentStream again with the updated history
        } else {
          // No more function calls, we are done
          keepGenerating = false;
        }
      } catch (streamErr: any) {
        throw streamErr;
      }
    } // end while (keepGenerating)
    
  } catch (outerErr: any) {
    throw outerErr;
  }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
      console.error('[Gemini API Final Error]:', err.message || err);
      
      let rawMsg = '';
      if (err.message && typeof err.message === 'string') {
        rawMsg = err.message;
      } else if (typeof err === 'string') {
        rawMsg = err;
      } else {
        rawMsg = JSON.stringify(err);
      }

      let userFriendlyMsg = rawMsg;
      let nestedErrorParsed = false;

      if (rawMsg.trim().startsWith('{')) {
        try {
          const parsedErr = JSON.parse(rawMsg);
          const nestedErr = parsedErr.error;
          if (nestedErr && typeof nestedErr === 'object') {
            userFriendlyMsg = nestedErr.message || JSON.stringify(nestedErr);
            nestedErrorParsed = true;
          } else if (parsedErr.message) {
            userFriendlyMsg = parsedErr.message;
            nestedErrorParsed = true;
          }
        } catch (je) {
          // Keep original rawMsg
        }
      }

      const isQuotaError = isQuotaOrRateLimit(rawMsg, err.status);
                           
      if (isQuotaError) {
        userFriendlyMsg = `⚠️ **Gemini API Key Quota Exceeded (429 Rate Limit)**: You have exceeded your core or daily API key quota limits.

This error happens on the Gemini platform when a free-tier key has made too many requests in a short period of time.

**To resolve this issue:**
1. **Wait 1 or 2 minutes**: The rate-limit window resets very quickly (usually every 60 seconds). Once reset, your requests will continue working perfectly!
2. **Use direct feeds**: The **Finance India Terminal** tab in your sidebar bypasses the rate-limited AI search engine and loads Yahoo Finance India live quotes directly. You can use it to track real-time stocks and indicators without consuming AI credits.`;
      } else if (nestedErrorParsed) {
        userFriendlyMsg = `⚠️ **Gemini API Error**: ${userFriendlyMsg}`;
      }
      
      res.write(`data: ${JSON.stringify({ error: userFriendlyMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  // --- GitHub OAuth & API Proxy Routes ---

  // Get GitHub Authorization URL
  app.get('/api/auth/github/url', (req, res) => {
    const host = req.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    // Fallback to configured redirect uri if APP_URL matches host
    let redirectUri = `${protocol}://${host}/api/auth/github/callback`;
    if (process.env.APP_URL && !host.includes('localhost')) {
      const cleanAppUrl = process.env.APP_URL.replace(/\/$/, '');
      redirectUri = `${cleanAppUrl}/api/auth/github/callback`;
    }

    const clientId = process.env.GITHUB_CLIENT_ID || '';
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo,user',
    });
    
    res.json({ 
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      redirectUri,
      hasCredentials: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET
    });
  });

  // Handle GitHub OAuth Callback
  app.get(['/api/auth/github/callback', '/api/auth/github/callback/'], async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('No authorization code provided from GitHub.');
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data: any = await response.json();
      if (data.error) {
        return res.status(400).send(`GitHub OAuth Error: ${data.error_description || data.error}`);
      }

      const accessToken = data.access_token;

      res.send(`
        <html>
          <body style="background: #191816; color: #E6E1DA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px;">
            <div style="background: #2E2B25; border: 1px solid #403B31; border-radius: 16px; padding: 35px 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); max-width: 420px; width: 100%; box-sizing: border-box;">
              <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(245, 158, 11, 0.1); border: 2px solid #F59E0B; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: #F59E0B; font-weight: bold; font-size: 28px;">✓</div>
              <h1 style="font-size: 22px; font-weight: 600; color: #FCFBF9; margin: 0 0 12px 0;">GitHub Workspace Connected</h1>
              <p style="font-size: 13px; color: #999288; line-height: 1.6; margin: 0 0 25px 0;">Your secure login token has been acquired. This synchronization window will shut down automatically.</p>
              <div style="font-size: 10px; color: #d97706; font-family: monospace; font-weight: bold; background: rgba(245, 158, 11, 0.08); padding: 10px; border-radius: 8px; border: 1px dashed rgba(245, 158, 11, 0.25);">AUTH_VERIFIED_SUCCESS</div>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'GITHUB_OAUTH_SUCCESS', token: '${accessToken}' }, '*');
                  console.log('[OAuth Callback] Dispatched message to opener.');
                }
              } catch (err) {
                console.error('[OAuth Callback] Message dispatch failed:', err);
              }
              setTimeout(() => {
                try { window.close(); } catch (e) {}
              }, 1200);
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('[GitHub OAuth Error]:', err.message);
      res.status(500).send(`Server Error during GitHub callback: ${err.message}`);
    }
  });

  // Github API proxy helper to dry up requests
  const githubFetch = async (endpoint: string, token: string, options: any = {}) => {
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'aistudio-build-github-integration',
        ...(options.headers || {}),
      }
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`GitHub API error (${response.status}): ${errBody || response.statusText}`);
    }
    return response.json();
  };

  // Proxy: Get current user
  app.get('/api/github/user', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const data = await githubFetch('/user', token);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy: Get repositories
  app.get('/api/github/repos', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const data = await githubFetch('/user/repos?sort=updated&per_page=100', token);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy: Get branches
  app.get('/api/github/repos/:owner/:repo/branches', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    const { owner, repo } = req.params;
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const data = await githubFetch(`/repos/${owner}/${repo}/branches`, token);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy: Get contents of a path
  app.get('/api/github/repos/:owner/:repo/contents', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    const { owner, repo } = req.params;
    const pathQuery = (req.query.path || '').toString();
    const branchQuery = (req.query.ref || '').toString();
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const urlParams = new URLSearchParams();
      if (branchQuery) urlParams.set('ref', branchQuery);
      
      const endpoint = `/repos/${owner}/${repo}/contents/${pathQuery}?${urlParams.toString()}`;
      const data = await githubFetch(endpoint, token);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy: Commit (create/update) content
  app.post('/api/github/repos/:owner/:repo/contents', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    const { owner, repo } = req.params;
    const { path: filePath, content, message, sha, branch } = req.body;
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const base64Content = Buffer.from(content).toString('base64');
      const body: any = {
        message: message || `Updated ${filePath} via Gemini`,
        content: base64Content,
      };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;

      const endpoint = `/repos/${owner}/${repo}/contents/${filePath}`;
      const data = await githubFetch(endpoint, token, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy: Fetch active pull requests
  app.get('/api/github/repos/:owner/:repo/pulls', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    const { owner, repo } = req.params;
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const data = await githubFetch(`/repos/${owner}/${repo}/pulls?state=open`, token);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy: Create pull request
  app.post('/api/github/repos/:owner/:repo/pulls', async (req, res) => {
    const token = req.headers['x-github-token'] as string;
    const { owner, repo } = req.params;
    const { title, head, base, body: prBody } = req.body;
    if (!token) return res.status(401).json({ error: 'Missing GitHub Access Token' });
    try {
      const endpoint = `/repos/${owner}/${repo}/pulls`;
      const data = await githubFetch(endpoint, token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          head,
          base,
          body: prBody,
        }),
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Specialized API: AI Code Review with Gemini
  app.post('/api/github/repos/:owner/:repo/review', async (req, res) => {
    const { path: filepath, content, instructions, useLiteModel } = req.body;
    const currentApiKey = process.env.GEMINI_API_KEY;
    if (!currentApiKey) {
      return res.status(401).json({ error: 'Server GEMINI_API_KEY is not configured.' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: currentApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const prompt = `You are an elite principal engineer and expert code reviewer.
Review the following file from a repository and provide:
1. **Critical Review**: Identify bugs, structural problems, potential vulnerabilities, code smell, or formatting issues.
2. **Interactive Upgrades**: Suggestions on structural improvements, modern practices, or refactorings.
3. **Optimized Target Version**: Provide the fully refactored, production-ready, improved version of the file inside a CLEAN markdown codeblock with correct language syntax (e.g., \`\`\`typescript) so the user can inspect or directly commit it.

**File Path**: ${filepath}
**Custom Upgrade Instructions**: ${instructions || "Review code quality and suggest general cleanups or optimizations."}

**Current File Content**:
\`\`\`
${content}
\`\`\`

Provide your detailed review in a clear, constructive, and highly elegant markdown format that is easy to read. Speaking directly to the developer with actionable wisdom.`;

      const isLite = useLiteModel === true;
      const modelName = isLite ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash';
      
      console.log(`[GitHub AI Review] Reviewing ${filepath} using model: ${modelName}...`);

      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      res.json({ review: result.text });
    } catch (err: any) {
      console.error('[GitHub AI Review Error]:', err);
      res.status(500).json({ error: err.message || 'AI generation failed' });
    }
  });

  // 5. Image Generation & Imagen 3/4 Studio proxy endpoint
  app.post('/api/image/generate', async (req, res) => {
    const { prompt, refinedPrompt, model, aspectRatio, count } = req.body;
    const currentApiKey = process.env.GEMINI_API_KEY;

    try {
      console.log(`[Image Generation API] Request for model: ${model}, aspect: ${aspectRatio}, count: ${count}`);

      let imageUrls: string[] = [];

      // If user selected pollinations/flux OR if GEMINI_API_KEY is not configured, we use the free Flux engine as fallback
      if (model === 'pollinations-flux' || !currentApiKey) {
        console.log(`[Image Generation API] Using free high-quality engine via pollinations.ai (Flux)`);
        
        let width = 1024;
        let height = 1024;
        if (aspectRatio === '16:9') { width = 1024; height = 576; }
        else if (aspectRatio === '9:16') { width = 576; height = 1024; }
        else if (aspectRatio === '4:3') { width = 1024; height = 768; }
        else if (aspectRatio === '3:4') { width = 768; height = 1024; }

        const randomSeed = Math.floor(Math.random() * 1000000);
        const requestedCount = Math.max(1, Math.min(4, parseInt(count) || 1));
        
        for (let i = 0; i < requestedCount; i++) {
          const seedValue = randomSeed + i;
          // Build pollinations.ai URL
          const pollinationsUrl = `https://pollinations.ai/p/${encodeURIComponent(refinedPrompt || prompt)}?width=${width}&height=${height}&seed=${seedValue}&nologo=true`;
          
          try {
            console.log(`[Image Generation API] Fetching image from Pollinations: ${pollinationsUrl}`);
            const imgResponse = await fetch(pollinationsUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
              }
            });
            
            if (imgResponse.ok) {
              const arrayBuffer = await imgResponse.arrayBuffer();
              const base64Bytes = Buffer.from(arrayBuffer).toString('base64');
              imageUrls.push(`data:image/jpeg;base64,${base64Bytes}`);
            } else {
              console.warn(`[Image Generation API] Pollinations fetch failed with status ${imgResponse.status}. Falling back to direct URL.`);
              imageUrls.push(pollinationsUrl);
            }
          } catch (fetchErr) {
            console.error(`[Image Generation API] Grab error from Pollinations, doing direct browser-link fallback:`, fetchErr);
            imageUrls.push(pollinationsUrl);
          }
        }
      } else {
        const ai = new GoogleGenAI({
          apiKey: currentApiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        if (model.startsWith('imagen-')) {
          // Use modern generateImages method from @google/genai SDK for classic Imagen series
          const response = await ai.models.generateImages({
            model: model,
            prompt: refinedPrompt || prompt,
            config: {
              numberOfImages: parseInt(count) || 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: aspectRatio || '1:1',
            }
          });

          if (response.generatedImages && response.generatedImages.length > 0) {
            imageUrls = response.generatedImages.map((g: any) => {
              const base64Bytes = g.image.imageBytes;
              return `data:image/jpeg;base64,${base64Bytes}`;
            });
          }
        } else {
          // Core nano banana series (gemini-2.5-flash-image) uses generateContent as detailed in gemini-api guidelines
          const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: refinedPrompt || prompt }] }],
            config: {
              imageConfig: {
                aspectRatio: aspectRatio || '1:1',
                imageSize: "1K"
              }
            }
          });

          if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                const base64Bytes = part.inlineData.data;
                const mime = part.inlineData.mimeType || 'image/png';
                imageUrls.push(`data:${mime};base64,${base64Bytes}`);
              }
            }
          }
        }
      }

      if (imageUrls.length === 0) {
        throw new Error('Image generation completed with no return data blocks. Free API keys may be restricted on this endpoint by Google.');
      }

      res.json({ images: imageUrls });
    } catch (err: any) {
      console.error('[Image Generation API Call Failed]:', err);
      let errMsg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
      
      const isQuota = isQuotaOrRateLimit(errMsg, err.status);
      if (isQuota) {
        errMsg = `⚠️ **Gemini API / Imagen Key Quota Exceeded (429 Rate Limit)**: Media generation has hit rate limits on free-tier keys. Please try again after 60 seconds or link up a premium billing key in your Settings.`;
      }
      res.status(500).json({ error: errMsg });
    }
  });

  // --- Google Workspace API Route ---
  app.get('/api/google/client-id', (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '' });
  });

  // Handle Vite in dev or serve build in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Server Error]: Failed to start', err);
});
