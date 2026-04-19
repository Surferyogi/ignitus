import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FH_KEY = "d7hji19r01qhiu0brkigd7hji19r01qhiu0brkj0";

// ── Yahoo Finance fetch helper ─────────────────────────────────────────────────
async function yahooFetch(url: string, timeout = 12000): Promise<any> {
  for (const host of ["query1", "query2"]) {
    const u = url.replace("query1", host);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(u, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
          "Origin": "https://finance.yahoo.com",
          "Referer": "https://finance.yahoo.com/",
        },
      });
      clearTimeout(t);
      if (res.ok) return await res.json();
      console.log(`Yahoo ${host} HTTP ${res.status} for ${u.slice(0,80)}`);
    } catch(e: any) { console.log(`Yahoo ${host} error: ${e.message}`); }
  }
  return null;
}

// ── FX RATES via Yahoo Finance v7 quote ───────────────────────────────────────
async function fetchFxRates(): Promise<Record<string, number>> {
  const defaults: Record<string,number> = {
    USD:1.27, JPY:0.0080, EUR:1.49, HKD:0.163, GBP:1.68, AUD:0.81, CNY:0.175, TWD:0.039, SGD:1.0
  };

  const pairs = ["USDSGD=X","JPYSGD=X","EURSGD=X","HKDSGD=X","GBPSGD=X","AUDSGD=X","CNYSGD=X","TWDSGD=X"];
  const ccyMap: Record<string,string> = {
    "USDSGD=X":"USD","JPYSGD=X":"JPY","EURSGD=X":"EUR","HKDSGD=X":"HKD",
    "GBPSGD=X":"GBP","AUDSGD=X":"AUD","CNYSGD=X":"CNY","TWDSGD=X":"TWD"
  };
  const rates: Record<string,number> = { SGD: 1.0 };

  // Fetch each pair individually via Yahoo v8 chart (more reliable than v7 quote for FX)
  await Promise.allSettled(pairs.map(async (pair) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair)}?interval=1d&range=1d`;
    try {
      const d = await yahooFetch(url, 8000);
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      const meta   = d?.chart?.result?.[0]?.meta;
      const price  = meta?.regularMarketPrice || (closes && closes[closes.length-1]);
      if (price && price > 0) {
        const ccy = ccyMap[pair];
        if (ccy) rates[ccy] = parseFloat(price.toFixed(6));
      }
    } catch(e: any) { console.log(`[fx] ${pair} error: ${e.message}`); }
  }));

  const count = Object.keys(rates).length;
  console.log(`[fx_rates] Got ${count} rates:`, Object.entries(rates).map(([k,v])=>`${k}=${v}`).join(", "));
  return count > 1 ? rates : defaults;
}

// ── STOCK PRICES via Finnhub ──────────────────────────────────────────────────
// ── YAHOO FINANCE MULTI-EXCHANGE TICKER MAPPING ─────────────────────────────
// Map app tickers to Yahoo-format tickers for various exchanges
function yahooTicker(ticker: string, mkt?: string): string {
  // Already has a suffix? Use as-is
  if (ticker.includes(".") || ticker.includes("-")) return ticker;
  // Apply market-specific Yahoo suffix
  switch((mkt||"").toUpperCase()) {
    case "SG": return ticker + ".SI";   // Singapore
    case "HK":
    case "CN": return ticker + ".HK";   // Hong Kong
    case "JP": return ticker + ".T";    // Tokyo
    case "GB": return ticker + ".L";    // London
    case "EU": return ticker + ".PA";   // Paris
    case "DE": return ticker + ".DE";   // Frankfurt
    case "AU": return ticker + ".AX";   // Australia
    case "TW": return ticker + ".TW";   // Taiwan
    default: return ticker;              // US default
  }
}

// ── YAHOO FINANCE PRICE FETCH (primary — no rate limits) ─────────────────────
async function yahooPrices(
  tickers: string[],
  tickerMktMap?: Record<string,string>
): Promise<Record<string,number>> {
  const results: Record<string,number> = {};
  const concurrency = 10; // fetch 10 at a time to be polite
  async function one(ticker: string) {
    const yt = yahooTicker(ticker, tickerMktMap?.[ticker]);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yt)}?interval=1d&range=5d`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
      });
      clearTimeout(t);
      if (!res.ok) return;
      const d = await res.json();
      const meta = d?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice || meta?.previousClose || 0;
      if (price > 0) results[ticker] = parseFloat(price.toFixed(4));
    } catch(e: any) { /* silent - try Finnhub fallback */ }
  }
  // Chunked parallel fetching
  for (let i = 0; i < tickers.length; i += concurrency) {
    const chunk = tickers.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map(one));
  }
  return results;
}

// ── FINNHUB FALLBACK (secondary — for tickers Yahoo couldn't resolve) ───────
async function finnhubPrices(tickers: string[]): Promise<Record<string,number>> {
  const results: Record<string,number> = {};
  async function one(ticker: string) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FH_KEY}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return;
      const d = await res.json();
      const p = d.c || d.pc;
      if (p && p > 0) results[ticker] = parseFloat(p.toFixed(4));
    } catch(e: any) { /* silent */ }
  }
  await Promise.allSettled(tickers.map(one));
  return results;
}

// ── UNIFIED PRICE FETCH — Yahoo primary, Finnhub fallback ───────────────────
async function getPrices(
  tickers: string[],
  tickerMktMap?: Record<string,string>
): Promise<Record<string,number>> {
  // Try Yahoo first for everyone
  console.log(`[getPrices] Yahoo Finance attempt: ${tickers.length} tickers`);
  const yahooResults = await yahooPrices(tickers, tickerMktMap);
  const yahooCount = Object.keys(yahooResults).length;
  console.log(`[getPrices] Yahoo returned ${yahooCount}/${tickers.length}`);

  // For tickers Yahoo missed, fall back to Finnhub (US-only)
  const missing = tickers.filter(t => !yahooResults[t]);
  if (missing.length > 0) {
    console.log(`[getPrices] Finnhub fallback for ${missing.length} tickers`);
    const fhResults = await finnhubPrices(missing);
    const fhCount = Object.keys(fhResults).length;
    console.log(`[getPrices] Finnhub returned ${fhCount}/${missing.length}`);
    Object.assign(yahooResults, fhResults);
  }

  return yahooResults;
}

// ── HISTORICAL CANDLES via Yahoo ──────────────────────────────────────────────
async function yahooHistory(ticker: string, period: string): Promise<number[]> {
  const rangeMap:    Record<string,string> = {"30d":"1mo","6m":"6mo","1y":"1y","5y":"5y","all":"10y"};
  const intervalMap: Record<string,string> = {"30d":"1d","6m":"1d","1y":"1d","5y":"1wk","all":"1wk"};
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${intervalMap[period]||"1d"}&range=${rangeMap[period]||"6mo"}`;
  try {
    const d      = await yahooFetch(url);
    const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!closes?.length) return [];
    return closes.filter((v: any) => v != null && !isNaN(v)).map((v: number) => parseFloat(v.toFixed(4)));
  } catch(e: any) { console.log(`History error ${ticker}: ${e.message}`); return []; }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body   = await req.json();
    const action = body.action || "prices";

    if (action === "fx_rates") {
      const rates = await fetchFxRates();
      return new Response(JSON.stringify({ rates }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "prices") {
      const { tickers, holdings } = body;
      if (!Array.isArray(tickers) || !tickers.length)
        return new Response(JSON.stringify({ error: "tickers required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Build ticker→market map for Yahoo suffix selection
      const tickerMktMap: Record<string,string> = {};
      if (Array.isArray(holdings)) {
        holdings.forEach((h: any) => {
          if (h?.ticker && h?.mkt) tickerMktMap[h.ticker] = h.mkt;
        });
      }

      console.log(`[prices] ${tickers.length} tickers, ${Object.keys(tickerMktMap).length} with market info`);
      const prices = await getPrices(tickers, tickerMktMap);
      console.log(`[prices] Total returned: ${Object.keys(prices).length}/${tickers.length}`);
      return new Response(JSON.stringify({ prices, count: Object.keys(prices).length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "history") {
      const { ticker, period } = body;
      if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.log(`[history] ${ticker} ${period}`);
      const closes = await yahooHistory(ticker, period || "6m");
      console.log(`[history] ${closes.length} candles for ${ticker}`);
      return new Response(JSON.stringify({ ticker, period, closes, count: closes.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "portfolio_chart") {
      const { indexTicker, holdingTickers, period } = body;
      if (!indexTicker) return new Response(JSON.stringify({ error: "indexTicker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.log(`[portfolio_chart] index=${indexTicker} holdings=${holdingTickers?.length} period=${period}`);
      const allTickers = [indexTicker, ...(holdingTickers || [])];
      const histMap: Record<string, number[]> = {};
      await Promise.allSettled(allTickers.map(async (t: string) => {
        const c = await yahooHistory(t, period || "6m");
        if (c.length > 1) histMap[t] = c;
      }));
      const indexCloses = histMap[indexTicker] || [];
      const holdingHistories: Record<string,number[]> = {};
      (holdingTickers || []).forEach((t: string) => { if (histMap[t]) holdingHistories[t] = histMap[t]; });
      console.log(`[portfolio_chart] index=${indexCloses.length}pts holdings=${Object.keys(holdingHistories).length}/${holdingTickers?.length}`);
      return new Response(JSON.stringify({ indexCloses, holdingHistories, indexTicker, period }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── SENATE TRADES ─────────────────────────────────────────────────────────
    if (action === "senate_trades") {
      // Quiver Quantitative congressional trading API
      const QQ_TOKEN = "6785fd1cc434bf4d026c0f700caf903d8ab30f7a";
      const url = "https://api.quiverquant.com/beta/live/congresstrading";

      // Retry wrapper
      async function tryFetch(attempt = 1): Promise<any[]> {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(url, {
            signal: ctrl.signal,
            headers: {
              "Accept": "application/json",
              "Authorization": `Token ${QQ_TOKEN}`,
              "X-CSRFToken": "quiverquant",
              "User-Agent": "Ignitus/1.0",
            },
          });
          clearTimeout(t);
          console.log(`[senate_trades] Attempt ${attempt} status: ${res.status}`);
          if (!res.ok) {
            const errText = (await res.text()).slice(0, 300);
            console.error(`[senate_trades] Attempt ${attempt} error: ${errText}`);
            if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
              await new Promise(r => setTimeout(r, 2000));
              return tryFetch(attempt + 1);
            }
            throw new Error(`HTTP ${res.status}`);
          }
          const all = await res.json();
          if (!Array.isArray(all)) throw new Error("Non-array response");
          return all;
        } catch(e: any) {
          if (attempt < 2) {
            console.log(`[senate_trades] Retrying after error: ${e.message}`);
            await new Promise(r => setTimeout(r, 2000));
            return tryFetch(attempt + 1);
          }
          throw e;
        }
      }

      try {
        console.log("[senate_trades] Fetching from Quiver Quantitative");
        const all = await tryFetch();
        console.log(`[senate_trades] Quiver returned ${all.length} total records`);

        if (all.length === 0) {
          return new Response(
            JSON.stringify({ trades: [], error: "Quiver returned empty list" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Debug: log field names of first record
        console.log("[senate_trades] First record fields:", Object.keys(all[0]).join(", "));

        // Step 1: Get only Senate chamber records (preferred)
        let filtered = all.filter((t: any) => {
          const chamber = (t.Chamber || t.chamber || "").toString();
          const ticker = (t.Ticker || t.ticker || "").toString().trim();
          const txn = (t.Transaction || t.transaction || t.Type || "").toString();
          return chamber === "Senate" &&
            ticker && ticker !== "--" && ticker.length <= 6 &&
            (txn.includes("Purchase") || txn.includes("Sale") || txn.includes("Buy") || txn.includes("Sell"));
        });
        console.log(`[senate_trades] Senate filter: ${filtered.length}`);

        // Step 2: If no Senate-only records, try including House too (user sees SOMETHING)
        if (filtered.length === 0) {
          filtered = all.filter((t: any) => {
            const ticker = (t.Ticker || t.ticker || "").toString().trim();
            const txn = (t.Transaction || t.transaction || t.Type || "").toString();
            return ticker && ticker !== "--" && ticker.length <= 6 &&
              (txn.includes("Purchase") || txn.includes("Sale") || txn.includes("Buy") || txn.includes("Sell"));
          });
          console.log(`[senate_trades] Expanded to all congress: ${filtered.length}`);
        }

        // Sort by most recent, take top 10
        const sorted = filtered
          .sort((a: any, b: any) => {
            const da = new Date(a.TransactionDate || a.transaction_date || a.Date || 0);
            const db = new Date(b.TransactionDate || b.transaction_date || b.Date || 0);
            return db.getTime() - da.getTime();
          })
          .slice(0, 10)
          .map((t: any) => {
            const rawAmt = t.Amount || t.amount || 0;
            let amtStr = "N/A";
            if (typeof rawAmt === "string" && rawAmt.includes("$")) {
              amtStr = rawAmt;
            } else {
              const n = parseFloat(rawAmt) || 0;
              if (n >= 1000001) amtStr = "$1,000,001+";
              else if (n >= 500001) amtStr = "$500,001 - $1,000,000";
              else if (n >= 250001) amtStr = "$250,001 - $500,000";
              else if (n >= 100001) amtStr = "$100,001 - $250,000";
              else if (n >= 50001)  amtStr = "$50,001 - $100,000";
              else if (n >= 15001)  amtStr = "$15,001 - $50,000";
              else if (n >= 1001)   amtStr = "$1,001 - $15,000";
              else if (n > 0)       amtStr = `$${n.toLocaleString()}`;
            }
            return {
              name:   t.Representative || t.representative || t.Senator || "Unknown",
              ticker: (t.Ticker || t.ticker || "").trim().toUpperCase(),
              action: (t.Transaction || t.transaction || "").includes("Sale") ? "SELL" : "BUY",
              amount: amtStr,
              date:   t.TransactionDate || t.transaction_date || t.Date || "",
              sector: t.Sector || t.sector || t.Industry || "",
              source: "Quiver Quant / STOCK Act",
              party:  t.Party || t.party || "?",
            };
          });

        console.log(`[senate_trades] Returning ${sorted.length} trades`);
        return new Response(JSON.stringify({ trades: sorted, total: all.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch(e: any) {
        console.error(`[senate_trades] Final failure: ${e.message}`);
        return new Response(JSON.stringify({ trades: [], error: e.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (action === "senate_prices") {
      // Fetch live price + basic metrics for senate tickers not in portfolio
      // Used to compute Graham Number intrinsic value
      const FH_KEY = "d7hji19r01qhiu0brkigd7hji19r01qhiu0brkj0";
      const tickers: string[] = body.tickers || [];
      if (tickers.length === 0) {
        return new Response(JSON.stringify({ prices: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const results = await Promise.allSettled(tickers.map(async (ticker) => {
        try {
          // Fetch quote + metrics in parallel
          const [qRes, mRes] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FH_KEY}`),
            fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FH_KEY}`)
          ]);

          const q = qRes.ok ? await qRes.json() : {};
          const m = mRes.ok ? await mRes.json() : {};

          const price = q.c || q.pc || 0;
          const metric = m.metric || {};

          // Graham Number = sqrt(22.5 × EPS × BVPS)
          const eps  = metric.epsBasicExclExtraItemsTTM || metric.epsTTM || 0;
          const bvps = metric.bookValuePerShareAnnual   || metric.bvps   || 0;
          const pe   = metric.peBasicExclExtraTTM       || metric.peTTM  || 0;
          const div  = metric.dividendYieldIndicatedAnnual || 0;

          let intrinsic = 0;
          if (eps > 0 && bvps > 0) {
            intrinsic = parseFloat(Math.sqrt(22.5 * eps * bvps).toFixed(2));
          } else if (price > 0 && pe > 0 && pe < 50) {
            // Fallback: fair PE estimate (15x)
            intrinsic = parseFloat((eps * 15).toFixed(2));
          }

          return { ticker, price, intrinsic, pe, eps, bvps, div };
        } catch(e) {
          return { ticker, price: 0, intrinsic: 0, pe: 0, eps: 0, bvps: 0, div: 0 };
        }
      }));

      const prices = results
        .filter(r => r.status === "fulfilled")
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .filter(r => r.price > 0);

      console.log(`[senate_prices] Fetched ${prices.length}/${tickers.length} prices`);
      return new Response(JSON.stringify({ prices }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    if (action === "senate_history") {
      // Fetch historical stock price on a specific date for senate trades
      const ticker: string = body.ticker || "";
      const date: string = body.date || ""; // YYYY-MM-DD
      if (!ticker || !date) {
        return new Response(JSON.stringify({ price: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        // Convert date to Unix timestamps
        const d = new Date(date);
        const from = Math.floor(d.getTime() / 1000) - 86400; // day before
        const to   = Math.floor(d.getTime() / 1000) + 86400; // day after
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${from}&period2=${to}`;
        
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
        });
        if (!res.ok) throw new Error(`Yahoo ${res.status}`);
        const d2 = await res.json();
        const closes = d2?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
        const price = closes.find((p: number) => p > 0) || d2?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;

        return new Response(JSON.stringify({ ticker, date, price: parseFloat((price||0).toFixed(2)) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch(e: any) {
        return new Response(JSON.stringify({ ticker, date, price: 0, error: e.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }


    if (action === "live_indices") {
      // Fetch live values for all major indices from Yahoo Finance
      const INDICES: Record<string,string> = {
        US_SP500:    "^GSPC",   // S&P 500
        US_NASDAQ:   "^IXIC",   // Nasdaq Composite
        US_DOW:      "^DJI",    // Dow Jones
        SG_STI:      "^STI",    // Straits Times Index
        JP_NIKKEI:   "^N225",   // Nikkei 225
        CN_HSI:      "^HSI",    // Hang Seng
        EU_CAC:      "^FCHI",   // CAC 40
        EU_DAX:      "^GDAXI",  // DAX
        GB_FTSE:     "^FTSE",   // FTSE 100
        AU_ASX:      "^AXJO",   // ASX 200
      };

      const results: Record<string, any> = {};
      await Promise.allSettled(Object.entries(INDICES).map(async ([key, sym]) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`;
          const res = await yahooFetch(url, 8000);
          const meta = res?.chart?.result?.[0]?.meta;
          const closes: number[] = res?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
          const price = meta?.regularMarketPrice || 0;
          const prev  = meta?.chartPreviousClose   || 0;
          const change = prev > 0 ? ((price - prev) / prev * 100) : 0;
          // YTD: find first trading day of current year
          const firstOfYear = closes.find((c: number) => c > 0) || prev;
          const ytd = firstOfYear > 0 ? ((price - firstOfYear) / firstOfYear * 100) : 0;
          results[key] = {
            symbol: sym, price: +price.toFixed(2),
            change: +change.toFixed(2), ytd: +ytd.toFixed(2)
          };
        } catch(e: any) { results[key] = null; }
      }));

      console.log(`[live_indices] Fetched ${Object.values(results).filter(v=>v).length}/${Object.keys(INDICES).length}`);
      return new Response(JSON.stringify({ indices: results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "valuation") {
      // Multi-source valuation: analyst target + DCF + financials
      const FH_KEY = "d7hji19r01qhiu0brkigd7hji19r01qhiu0brkj0";
      const ticker: string = body.ticker || "";
      if (!ticker) {
        return new Response(JSON.stringify({ error: "ticker required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        // Fetch in parallel: price target, metrics, financials, current quote
        const [tRes, mRes, qRes, rRes] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${FH_KEY}`),
          fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FH_KEY}`),
          fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FH_KEY}`),
          fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${FH_KEY}`),
        ]);

        const t = tRes.ok ? await tRes.json() : {};
        const m = mRes.ok ? await mRes.json() : {};
        const q = qRes.ok ? await qRes.json() : {};
        const r = rRes.ok ? await rRes.json() : [];

        const currentPrice = q.c || 0;
        const metric = m.metric || {};

        // 1. Analyst consensus target (Wall Street median)
        const analystTarget = t.targetMean || t.targetMedian || 0;
        const analystHigh   = t.targetHigh   || 0;
        const analystLow    = t.targetLow    || 0;
        const numAnalysts   = t.numberOfAnalysts || 0;

        // 2. Graham Number: sqrt(22.5 * EPS * BVPS)
        const eps  = metric.epsBasicExclExtraItemsTTM || metric.epsTTM || 0;
        const bvps = metric.bookValuePerShareAnnual || 0;
        const graham = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : 0;

        // 3. DCF using free cash flow per share
        // Formula: FCFps × (1+g) / (r-g) where g=5%, r=10%
        const fcfPerShare = metric.freeCashFlowPerShareTTM || metric.fcfShareTTM || 0;
        const growth = 0.05;    // 5% growth assumption (conservative)
        const discount = 0.10;  // 10% required return
        const terminal = 0.025; // 2.5% terminal growth
        let dcf = 0;
        if (fcfPerShare > 0) {
          // 5-year explicit FCF projection + terminal value
          let sum = 0;
          for (let year = 1; year <= 5; year++) {
            sum += fcfPerShare * Math.pow(1 + growth, year) / Math.pow(1 + discount, year);
          }
          const terminalVal = fcfPerShare * Math.pow(1 + growth, 5) * (1 + terminal) / (discount - terminal);
          sum += terminalVal / Math.pow(1 + discount, 5);
          dcf = sum;
        }

        // 4. PE-based fair value: industry PE × EPS
        const industryPE = 18; // conservative mid-cycle
        const peFair = eps > 0 ? eps * industryPE : 0;

        // Recommendation consensus (last period)
        const latestRec = r[0] || {};
        const recStrength = (latestRec.strongBuy||0) * 2 + (latestRec.buy||0) - (latestRec.sell||0) - (latestRec.strongSell||0) * 2;
        const recTotal = (latestRec.strongBuy||0) + (latestRec.buy||0) + (latestRec.hold||0) + (latestRec.sell||0) + (latestRec.strongSell||0);

        // Compute average of available estimates
        const estimates = [analystTarget, graham, dcf, peFair].filter(v => v > 0);
        const avg = estimates.length > 0 ? estimates.reduce((s, v) => s + v, 0) / estimates.length : 0;

        const result = {
          ticker,
          currentPrice: +currentPrice.toFixed(2),
          valuations: {
            analystTarget: +analystTarget.toFixed(2),
            analystHigh:   +analystHigh.toFixed(2),
            analystLow:    +analystLow.toFixed(2),
            numAnalysts,
            graham:        +graham.toFixed(2),
            dcf:           +dcf.toFixed(2),
            peFair:        +peFair.toFixed(2),
            average:       +avg.toFixed(2),
          },
          inputs: {
            eps, bvps, fcfPerShare,
            pe: metric.peBasicExclExtraTTM || metric.peTTM || 0,
            divYield: metric.dividendYieldIndicatedAnnual || 0,
          },
          recommendation: {
            strongBuy: latestRec.strongBuy||0,
            buy:       latestRec.buy||0,
            hold:      latestRec.hold||0,
            sell:      latestRec.sell||0,
            strongSell:latestRec.strongSell||0,
            period:    latestRec.period || "",
            totalAnalysts: recTotal,
            score: recTotal > 0 ? +(recStrength / recTotal).toFixed(2) : 0,
          },
          assumptions: {
            dcf: "5% growth / 10% discount / 2.5% terminal / 5yr + terminal",
            graham: "√(22.5 × EPS × BVPS) — Benjamin Graham's formula",
            peFair: "EPS × 18x (conservative mid-cycle PE)",
            analyst: `Median of ${numAnalysts} Wall Street analyst 12-month targets`,
          }
        };

        console.log(`[valuation] ${ticker}: analyst=${analystTarget}, dcf=${dcf.toFixed(0)}, graham=${graham.toFixed(0)}, peFair=${peFair.toFixed(0)}, avg=${avg.toFixed(0)}`);
        return new Response(JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch(e: any) {
        console.error(`[valuation] Failed: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }


    return new Response(JSON.stringify({ error: "unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch(e: any) {
    console.error("Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
