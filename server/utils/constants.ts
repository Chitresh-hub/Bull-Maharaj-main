// Index Data (Updated as of March 29, 2024)
export const MARKET_INDICES = {
  SENSEX: { name: "SENSEX",   value: 74265.63, change: 533.64,  changePercent: 0.72  },
  NIFTY:  { name: "NIFTY",    value: 22503.30, change: 148.95,  changePercent: 0.67  },
  BANKNIFTY: { name: "BANKNIFTY", value: 47721.30, change: 320.45, changePercent: 0.68 },
  INR_USD: { name: "INR/USD", value: 83.42,    change: -0.05,   changePercent: -0.06 }
};

export interface StockInfo {
  baseValue: number;
  volatility: number;
  trend: number;
}

export const INDIAN_STOCKS: Record<string, StockInfo> = {
  "TCS":       { baseValue: 3945.55, volatility: 0.015, trend: 0.0005 },
  "RELIANCE":  { baseValue: 2918.95, volatility: 0.02,  trend: 0.0008 },
  "HDFCBANK":  { baseValue: 1549.40, volatility: 0.018, trend: 0.0004 },
  "INFY":      { baseValue: 1677.95, volatility: 0.022, trend: 0.0006 },
  "ICICIBANK": { baseValue: 1033.10, volatility: 0.016, trend: 0.0007 },
  "TATASTEEL": { baseValue:  164.80, volatility: 0.025, trend: 0.0003 },
  "WIPRO":     { baseValue:  493.60, volatility: 0.020, trend: 0.0002 },
  "HCLTECH":   { baseValue: 1541.70, volatility: 0.021, trend: 0.0004 },
  "BAJFINANCE":{ baseValue: 6912.35, volatility: 0.025, trend: 0.0006 },
  "SUNPHARMA": { baseValue: 1335.90, volatility: 0.018, trend: 0.0003 },
  "ADANIPORTS":{ baseValue: 1314.95, volatility: 0.026, trend: 0.0008 },
  "ADANIENT":  { baseValue:  887.10, volatility: 0.028, trend: 0.0010 },
  "ASIANPAINT":{ baseValue: 2885.25, volatility: 0.017, trend: 0.0003 },
  "AXISBANK":  { baseValue: 1052.50, volatility: 0.019, trend: 0.0005 },
  "JSWSTEEL":  { baseValue:  968.35, volatility: 0.024, trend: 0.0002 }
};

// ── Updated: ANN replaces reinforcement learning in the insight text ──
export const MARKET_SENTIMENT = {
  sentiment: "BULLISH",
  sentimentScore: 73,
  volatilityIndex: 38,
  volatilityLevel: "MODERATE",
  sectorStrength: 82,
  sectorStrengthLevel: "STRONG",
  aiInsights:
    "Our Artificial Neural Network (ANN) model indicates a sustained bullish trend for Indian " +
    "markets, with NIFTY and SENSEX continuing their upward momentum. The ANN evaluates 7 " +
    "technical features — RSI, SMA trend ratio, Bollinger %B, MACD histogram, volatility, " +
    "5-day return, and volume ratio — through a 7→12→6→3 feedforward network trained with the " +
    "Adam optimiser. IT and Banking sectors show strong signals based on Q4 earnings and global " +
    "tech momentum. The model assigns a 76 % probability to a continued uptrend over the next " +
    "2–3 weeks with moderate volatility, and updates its weights online after every confirmed trade."
};

export const SECTOR_PERFORMANCE = {
  "IT":      { performance: 4.8, outlook: "POSITIVE", topPicks: ["TCS", "INFY", "HCLTECH"] },
  "BANKING": { performance: 2.9, outlook: "POSITIVE", topPicks: ["HDFCBANK", "ICICIBANK", "AXISBANK"] },
  "ENERGY":  { performance: 1.7, outlook: "NEUTRAL",  topPicks: ["RELIANCE", "ADANIENT", "NTPC"] },
  "PHARMA":  { performance: 3.5, outlook: "POSITIVE", topPicks: ["SUNPHARMA", "DRREDDY", "CIPLA"] },
  "METALS":  { performance: 0.8, outlook: "NEUTRAL",  topPicks: ["TATASTEEL", "JSWSTEEL", "HINDALCO"] },
  "FMCG":    { performance: 1.5, outlook: "POSITIVE", topPicks: ["HINDUNILVR", "ITC", "NESTLEIND"] },
  "AUTO":    { performance: 2.1, outlook: "POSITIVE", topPicks: ["MARUTI", "TATAMOTORS", "M&M"] }
};

export const generateChartData = (days: number, trend: "up" | "down" | "volatile" = "up") => {
  const data = [];
  let base = 100;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now); date.setDate(date.getDate() - i);
    const change =
      trend === "up"       ? (Math.random() * 3 - 0.5) / 100 :
      trend === "down"     ? (Math.random() * 3 - 2.5) / 100 :
                             (Math.random() * 6 - 3)   / 100;
    base *= 1 + change;
    data.push({ date: date.toISOString().split('T')[0], value: Math.round(base * 100) / 100 });
  }
  return data;
};

export const generateOHLCVData = (symbol: string, days: number = 180) => {
  const data = [];
  const now = new Date();
  const info = INDIAN_STOCKS[symbol] ?? { baseValue: 1000, volatility: 0.02, trend: 0.0001 };
  let cur = info.baseValue;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now); date.setDate(date.getDate() - i);
    if ([0, 6].includes(date.getDay())) continue;

    let em = 1;
    if (i % 60 === 0) em = 1.5;
    else if (i % 90 === 0) em = 1.3;
    else if (i % 45 === 0) em = 1.2;

    cur = Math.max(info.baseValue * 0.6, cur * (1 + (Math.random() * 2 - 1) * info.volatility * em + info.trend));
    const open = cur * (1 + (Math.random() * 0.01 - 0.005));
    const high = Math.max(open, cur) * (1 + Math.random() * info.volatility * 0.7);
    const low  = Math.min(open, cur) * (1 - Math.random() * info.volatility * 0.7);
    const vol  = Math.round(info.baseValue * 500 * (0.5 + Math.abs((Math.random() * 2 - 1) * info.volatility * 50) + Math.random()));

    data.push({
      date:   date.toISOString().split('T')[0],
      open:   parseFloat(open.toFixed(2)),
      high:   parseFloat(high.toFixed(2)),
      low:    parseFloat(low.toFixed(2)),
      close:  parseFloat(cur.toFixed(2)),
      volume: vol
    });
  }
  return data;
};