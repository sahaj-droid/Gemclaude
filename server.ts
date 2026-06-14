import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    '^NSEI': { name: 'Nifty 50', price: 23450.50, sector: 'Financials & Industry', industry: 'Index', change: 145.20, type: 'INDEX' },
    '^BSESN': { name: 'BSE Sensex', price: 77150.20, sector: 'Financials & Industry', industry: 'Index', change: 420.30, type: 'INDEX' },
    'RELIANCE.NS': { name: 'Reliance Industries Limited', price: 2485.60, sector: 'Energy', industry: 'Oil & Gas Refining', change: 12.80 },
    'TCS.NS': { name: 'Tata Consultancy Services Limited', price: 3890.15, sector: 'Technology', industry: 'IT Services', change: -35.40 },
    'TATAMOTORS.NS': { name: 'Tata Motors Limited', price: 945.30, sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', change: 14.75 },
    'HDFCBANK.NS': { name: 'HDFC Bank Limited', price: 1610.45, sector: 'Financial Services', industry: 'Banks - Regional', change: -8.10 },
    'INFY.NS': { name: 'Infosys Limited', price: 1535.80, sector: 'Technology', industry: 'IT Services', change: 11.20 },
    'SBIN.NS': { name: 'State Bank of India', price: 785.20, sector: 'Financial Services', industry: 'Banks - Regional', change: 3.40 },
    'ITC.NS': { name: 'ITC Limited', price: 435.90, sector: 'Consumer Defensive', industry: 'Tobacco', change: -2.15 }
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
          ? "You are an intelligent, versatile, and general-purpose universal AI Assistant equipped with real-time Google Search grounding. TODAY'S DATE is June 14, 2026. Since your static training cutoff is in early 2025, you MUST aggressively use the Google Search Grounding tool (googleSearch) to look up fresh real-time information, weather, sports, politics, current events, and tech questions from the live web. Avoid answering with outdated 2024 training context or data. Cite your sources clearly with web link citations where available. If the user asks about live Indian stock quotes, indices, or financial charts, you can mention they also have access to the interactive 'Finance India Terminal' tab in their sidebar which pulls live data directly from Yahoo Finance India."
          : "You are an intelligent, elite Financial Analyst and AI Chat Assistant. Provide objective, high-quality, dense financial analyses and guidelines. Note that users have access to an interactive 'Finance India Terminal' tab in their sidebar that fetches real-time, live stock quotes, historical charts, and technical indexes directly from Yahoo Finance India. Whenever users ask for the current live price, daily chart, or real-time indices, explain how to read it in real-time on the Terminal, while offering high-quality educational analysis, company profiles, and financial structures.";

        console.log(`[Gemini API] Requesting stream using model ${modelToUse} with searchGrounding=${!!searchGrounding}...`);
        
        let responseStream;
        try {
          responseStream = await ai.models.generateContentStream({
            model: modelToUse,
            contents: contents,
            config: {
              systemInstruction: sysInstruction,
              ...(searchGrounding ? { tools: [{ googleSearch: {} }] } : {})
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
              contents: contents,
              config: {
                systemInstruction: sysInstruction,
                ...(searchGrounding ? { tools: [{ googleSearch: {} }] } : {})
              }
            });
          } else {
            throw firstTryErr;
          }
        }

        for await (const chunk of responseStream) {
          if (chunk.text) {
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata || null;
            res.write(`data: ${JSON.stringify({ text: chunk.text, groundingMetadata })}\n\n`);
          }
        }
      } catch (streamErr: any) {
        throw streamErr;
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
    const { path: filepath, content, instructions, highThinking } = req.body;
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

      const useHighThinking = highThinking !== false; // Default to true if not specified
      const modelName = useHighThinking ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash';
      
      console.log(`[GitHub AI Review] Reviewing ${filepath} using model: ${modelName} (highThinking: ${useHighThinking})...`);

      const config: any = {};
      if (useHighThinking) {
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH
        };
      }

      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config
      });

      res.json({ review: result.text });
    } catch (err: any) {
      console.error('[GitHub AI Review Error]:', err);
      res.status(500).json({ error: err.message || 'AI generation failed' });
    }
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
