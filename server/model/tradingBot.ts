import { storage } from '../storage';
import { Stock } from '@shared/schema';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface BotPerformanceMetrics {
  totalReturn: number;
  totalReturnPercentage: number;
  winRate: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  averageHoldingPeriod: number;
  performanceTimeline: PerformanceTimepoint[];
}

interface PerformanceTimepoint {
  date: string;
  value: number;
  change: number;
}

interface StockPriceHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradingDecision {
  signal: TradingSignal;
  confidence: number;
  reason: string;
  indicatorsUsed: string[];
}

export type TradingSignal = "BUY" | "SELL" | "HOLD";
export type TradingStrategy = "MOVING_AVERAGE" | "RSI" | "MACD" | "BOLLINGER" | "ANN";

// ─── ANN Core (pure TypeScript, no external libraries) ────────────────────────
// Architecture: 7 inputs → 12 hidden (ReLU) → 6 hidden (ReLU) → 3 outputs (Softmax)
// Outputs: [P(BUY), P(SELL), P(HOLD)]

type Matrix = number[][];

/** Xavier weight initialisation */
function xavier(rows: number, cols: number): Matrix {
  const limit = Math.sqrt(6 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * limit)
  );
}

function zeros(size: number): number[] {
  return new Array(size).fill(0);
}

function relu(x: number): number {
  return Math.max(0, x);
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

/** Forward pass through one dense layer */
function denseForward(
  input: number[],
  weights: Matrix,   // [outSize][inSize]
  biases: number[],
  activation: (x: number) => number
): number[] {
  return weights.map((row, i) => {
    const z = row.reduce((sum, w, j) => sum + w * input[j], 0) + biases[i];
    return activation(z);
  });
}

/** Min-max normalise a value into [0, 1] */
function normalise(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.min(1, Math.max(0, (val - min) / (max - min)));
}

// ─── ANN class ────────────────────────────────────────────────────────────────

class ANN {
  // Layer weights: [outNeurons][inNeurons]
  private W1: Matrix; // 12 × 7
  private b1: number[];
  private W2: Matrix; // 6 × 12
  private b2: number[];
  private W3: Matrix; // 3 × 6
  private b3: number[];

  // Adam optimiser state (for online fine-tuning)
  private lr: number;
  private beta1 = 0.9;
  private beta2 = 0.999;
  private eps = 1e-8;
  private t = 0;

  constructor(learningRate: number = 0.001) {
    this.lr = learningRate;
    this.W1 = xavier(12, 7);
    this.b1 = zeros(12);
    this.W2 = xavier(6, 12);
    this.b2 = zeros(6);
    this.W3 = xavier(3, 6);
    this.b3 = zeros(3);
  }

  /** Forward pass — returns softmax probabilities [BUY, SELL, HOLD] */
  forward(input: number[]): number[] {
    const h1 = denseForward(input, this.W1, this.b1, relu);
    const h2 = denseForward(h1,    this.W2, this.b2, relu);
    const logits = denseForward(h2, this.W3, this.b3, x => x); // linear
    return softmax(logits);
  }

  /**
   * Single online SGD update (cross-entropy loss).
   * label: 0=BUY, 1=SELL, 2=HOLD
   */
  train(input: number[], label: number): void {
    // ── forward ──
    const h1Raw = this.W1.map((row, i) =>
      row.reduce((s, w, j) => s + w * input[j], 0) + this.b1[i]
    );
    const h1 = h1Raw.map(relu);

    const h2Raw = this.W2.map((row, i) =>
      row.reduce((s, w, j) => s + w * h1[j], 0) + this.b2[i]
    );
    const h2 = h2Raw.map(relu);

    const logits = this.W3.map((row, i) =>
      row.reduce((s, w, j) => s + w * h2[j], 0) + this.b3[i]
    );
    const probs = softmax(logits);

    // ── output gradient (cross-entropy + softmax combined) ──
    const dLogits = probs.map((p, i) => p - (i === label ? 1 : 0)); // [3]

    // ── W3 / b3 gradients ──
    const dW3: Matrix = this.W3.map((_, i) => h2.map(hj => dLogits[i] * hj));
    const db3 = dLogits;

    // ── back through h2 ──
    const dH2 = h2.map((_, j) =>
      this.W3.reduce((s, row, i) => s + row[j] * dLogits[i], 0)
    );
    const dH2Raw = dH2.map((d, j) => d * (h2Raw[j] > 0 ? 1 : 0)); // ReLU deriv

    // ── W2 / b2 gradients ──
    const dW2: Matrix = this.W2.map((_, i) => h1.map(hj => dH2Raw[i] * hj));
    const db2 = dH2Raw;

    // ── back through h1 ──
    const dH1 = h1.map((_, j) =>
      this.W2.reduce((s, row, i) => s + row[j] * dH2Raw[i], 0)
    );
    const dH1Raw = dH1.map((d, j) => d * (h1Raw[j] > 0 ? 1 : 0));

    // ── W1 / b1 gradients ──
    const dW1: Matrix = this.W1.map((_, i) => input.map(x => dH1Raw[i] * x));
    const db1 = dH1Raw;

    // ── Adam update (shared step counter) ──
    this.t++;
    const bc1 = 1 - Math.pow(this.beta1, this.t);
    const bc2 = 1 - Math.pow(this.beta2, this.t);

    const applyAdam = (
      W: Matrix, dW: Matrix,
      mW: Matrix, vW: Matrix
    ) => {
      W.forEach((row, i) => {
        row.forEach((_, j) => {
          mW[i][j] = this.beta1 * mW[i][j] + (1 - this.beta1) * dW[i][j];
          vW[i][j] = this.beta2 * vW[i][j] + (1 - this.beta2) * dW[i][j] ** 2;
          W[i][j] -= this.lr * (mW[i][j] / bc1) / (Math.sqrt(vW[i][j] / bc2) + this.eps);
        });
      });
    };

    // lazy-init Adam moment buffers
    if (!this._mW1) this._initMoments();
    applyAdam(this.W1, dW1, this._mW1!, this._vW1!);
    applyAdam(this.W2, dW2, this._mW2!, this._vW2!);
    applyAdam(this.W3, dW3, this._mW3!, this._vW3!);

    [this.b1, db1, this._mb1!, this._vb1!].forEach(() => {});
    this._applyAdamBias(this.b1, db1, this._mb1!, this._vb1!, bc1, bc2);
    this._applyAdamBias(this.b2, db2, this._mb2!, this._vb2!, bc1, bc2);
    this._applyAdamBias(this.b3, db3, this._mb3!, this._vb3!, bc1, bc2);
  }

  // ── Adam moment buffers ──
  private _mW1?: Matrix; private _vW1?: Matrix;
  private _mW2?: Matrix; private _vW2?: Matrix;
  private _mW3?: Matrix; private _vW3?: Matrix;
  private _mb1?: number[]; private _vb1?: number[];
  private _mb2?: number[]; private _vb2?: number[];
  private _mb3?: number[]; private _vb3?: number[];

  private _initMoments() {
    const mxLike = (m: Matrix) => m.map(r => r.map(() => 0));
    this._mW1 = mxLike(this.W1); this._vW1 = mxLike(this.W1);
    this._mW2 = mxLike(this.W2); this._vW2 = mxLike(this.W2);
    this._mW3 = mxLike(this.W3); this._vW3 = mxLike(this.W3);
    this._mb1 = zeros(12); this._vb1 = zeros(12);
    this._mb2 = zeros(6);  this._vb2 = zeros(6);
    this._mb3 = zeros(3);  this._vb3 = zeros(3);
  }

  private _applyAdamBias(
    b: number[], db: number[],
    mb: number[], vb: number[],
    bc1: number, bc2: number
  ) {
    b.forEach((_, i) => {
      mb[i] = this.beta1 * mb[i] + (1 - this.beta1) * db[i];
      vb[i] = this.beta2 * vb[i] + (1 - this.beta2) * db[i] ** 2;
      b[i] -= this.lr * (mb[i] / bc1) / (Math.sqrt(vb[i] / bc2) + this.eps);
    });
  }

  setLearningRate(lr: number) { this.lr = lr; }
}

// ─── TradingBot ───────────────────────────────────────────────────────────────

class TradingBot {
  private static instance: TradingBot;
  private botActive: boolean = true;
  private currentStrategy: TradingStrategy = "ANN";
  private historicalData: Map<number, StockPriceHistory[]> = new Map();

  // ANN model — persists across calls (online learning)
  private ann: ANN;
  private learningRate: number = 0.001;

  private constructor() {
    this.ann = new ANN(this.learningRate);
    console.log("Trading bot initialised with ANN model");
    this.initializeHistoricalData();
    // Pre-train on synthetic data so the model isn't cold on first request
    this.preTrainANN();
  }

  public static getInstance(): TradingBot {
    if (!TradingBot.instance) {
      TradingBot.instance = new TradingBot();
    }
    return TradingBot.instance;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public isBotActive(): boolean { return this.botActive; }

  public toggleBotStatus(): boolean {
    this.botActive = !this.botActive;
    return this.botActive;
  }

  public setStrategy(strategy: TradingStrategy): void {
    this.currentStrategy = strategy;
    console.log(`Strategy set to ${strategy}`);
  }

  public updateLearningParameters(learningRate?: number, _explorationRate?: number): void {
    if (learningRate !== undefined) {
      this.learningRate = Math.max(0.0001, Math.min(0.05, learningRate));
      this.ann.setLearningRate(this.learningRate);
    }
    console.log(`ANN learning rate set to ${this.learningRate}`);
  }

  public async getPerformanceMetrics(): Promise<BotPerformanceMetrics> {
    const userId = 1;
    const tradingHistory = await storage.getTradingHistoryByUserId(userId);

    const successfulTrades = tradingHistory.filter(t => (t.profitLoss ?? 0) > 0).length;
    const failedTrades     = tradingHistory.filter(t => (t.profitLoss ?? 0) <= 0).length;
    const totalProfitLoss  = tradingHistory.reduce((s, t) => s + (t.profitLoss ?? 0), 0);

    return {
      totalReturn: totalProfitLoss,
      totalReturnPercentage: this.calcReturnPct(totalProfitLoss, tradingHistory),
      winRate: tradingHistory.length > 0
        ? (successfulTrades / tradingHistory.length) * 100
        : 0,
      totalTrades: tradingHistory.length,
      successfulTrades,
      failedTrades,
      averageHoldingPeriod: 5,
      performanceTimeline: this.generatePerformanceTimeline()
    };
  }

  public async generateTradingDecision(stockId: number): Promise<TradingDecision> {
    const stock = await storage.getStock(stockId);
    if (!stock) {
      return { signal: "HOLD", confidence: 0, reason: "Stock not found", indicatorsUsed: [] };
    }

    const priceHistory = this.getHistoricalPriceData(stockId);

    switch (this.currentStrategy) {
      case "MOVING_AVERAGE": return this.movingAverageStrategy(stock, priceHistory);
      case "RSI":            return this.rsiStrategy(stock, priceHistory);
      case "MACD":           return this.macdStrategy(stock, priceHistory);
      case "BOLLINGER":      return this.bollingerBandsStrategy(stock, priceHistory);
      case "ANN":
      default:               return this.annStrategy(stock, priceHistory);
    }
  }

  public async generateSignalForStock(stockId: number): Promise<TradingSignal> {
    const d = await this.generateTradingDecision(stockId);
    return d.signal;
  }

  public async executeTrade(
    userId: number, stockId: number, action: TradingSignal, quantity: number
  ): Promise<boolean> {
    if (!this.botActive) return false;
    try {
      const stock = await storage.getStock(stockId);
      if (!stock) return false;

      await storage.createTradingHistory({
        userId, stockId, action, quantity,
        price: stock.currentPrice,
        timestamp: new Date(),
        profitLoss: action === "SELL" ? quantity * stock.currentPrice * 0.03 : null
      });

      // Online fine-tune: reward the action the user confirmed
      this.onlineTrain(stockId, action);
      console.log(`Executed ${action} x${quantity} of ${stock.symbol}`);
      return true;
    } catch (err) {
      console.error("executeTrade error:", err);
      return false;
    }
  }

  public getHistoricalPriceData(stockId: number): StockPriceHistory[] {
    return this.historicalData.get(stockId) ?? [];
  }

  // ── ANN Strategy ──────────────────────────────────────────────────────────

  /**
   * Build a 7-feature input vector, run the ANN, and return a TradingDecision.
   *
   * Features (all normalised to [0,1]):
   *   0. RSI(14)           — momentum
   *   1. SMA10 / SMA50     — trend direction
   *   2. %B Bollinger      — mean-reversion position
   *   3. MACD histogram    — crossover signal
   *   4. Volatility(14)    — risk level
   *   5. 5-day return      — short momentum
   *   6. Volume ratio      — participation
   */
  private annStrategy(stock: Stock, priceHistory: StockPriceHistory[]): TradingDecision {
    if (priceHistory.length < 50) {
      return {
        signal: "HOLD",
        confidence: 50,
        reason: "Insufficient historical data for ANN strategy",
        indicatorsUsed: ["ANN"]
      };
    }

    const input = this.buildFeatureVector(priceHistory);
    const probs = this.ann.forward(input); // [P(BUY), P(SELL), P(HOLD)]

    const labels: TradingSignal[] = ["BUY", "SELL", "HOLD"];
    const best  = probs.indexOf(Math.max(...probs));
    const signal: TradingSignal = labels[best];
    const confidence = Math.round(Math.min(97, probs[best] * 100 + 10));

    // Human-readable feature insights
    const closePrices = priceHistory.map(d => d.close);
    const rsi  = this.calculateRSI(closePrices, 14);
    const sma10 = this.calculateSMA(closePrices, 10);
    const sma50 = this.calculateSMA(closePrices, 50);

    const rsiLabel  = rsi < 35 ? "oversold" : rsi > 65 ? "overbought" : "neutral";
    const trendLabel = sma10 > sma50 ? "bullish" : "bearish";

    return {
      signal,
      confidence,
      reason: `ANN model: ${trendLabel} trend, RSI ${rsiLabel} (${rsi.toFixed(1)}). ` +
              `Network confidence: BUY ${(probs[0]*100).toFixed(1)}% / ` +
              `SELL ${(probs[1]*100).toFixed(1)}% / HOLD ${(probs[2]*100).toFixed(1)}%`,
      indicatorsUsed: ["ANN", "RSI", "SMA", "Bollinger Bands", "MACD", "Volatility", "Volume"]
    };
  }

  /** Build normalised [0,1] feature vector of length 7 */
  private buildFeatureVector(priceHistory: StockPriceHistory[]): number[] {
    const closePrices = priceHistory.map(d => d.close);
    const volumes     = priceHistory.map(d => d.volume);

    // 1. RSI → [0,1]
    const rsi = this.calculateRSI(closePrices, 14);
    const f0   = normalise(rsi, 0, 100);

    // 2. SMA10 / SMA50 ratio → [0,1]  (0.5 = neutral, >0.5 = bullish)
    const sma10 = this.calculateSMA(closePrices, 10);
    const sma50 = this.calculateSMA(closePrices, 50);
    const f1    = normalise(sma10 / sma50, 0.85, 1.15);

    // 3. %B Bollinger Bands → already ~[0,1]
    const { upper, lower } = this.calculateBollingerBands(closePrices, 20, 2);
    const curP = closePrices[closePrices.length - 1];
    const f2   = normalise(curP, lower, upper);

    // 4. MACD histogram → normalised
    const { histogram } = this.calculateMACD(closePrices);
    const f3 = normalise(histogram, -curP * 0.02, curP * 0.02);

    // 5. Volatility(14) → [0,1]
    const vol = this.calculateVolatility(closePrices, 14);
    const f4  = normalise(vol, 0, 0.06);

    // 6. 5-day return → [0,1]
    const ret5 = closePrices.length >= 6
      ? (closePrices[closePrices.length - 1] / closePrices[closePrices.length - 6]) - 1
      : 0;
    const f5 = normalise(ret5, -0.05, 0.05);

    // 7. Volume ratio (last / avg-20) → [0,1]
    const lastVol = volumes[volumes.length - 1];
    const avgVol  = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const f6      = normalise(lastVol / (avgVol || 1), 0, 3);

    return [f0, f1, f2, f3, f4, f5, f6];
  }

  /** Online training after a confirmed trade */
  private onlineTrain(stockId: number, action: TradingSignal): void {
    const hist = this.getHistoricalPriceData(stockId);
    if (hist.length < 50) return;

    const input = this.buildFeatureVector(hist);
    const label = action === "BUY" ? 0 : action === "SELL" ? 1 : 2;
    this.ann.train(input, label);
  }

  /**
   * Pre-train the ANN on synthetic labeled examples so it starts with
   * sensible weights rather than random Xavier init.
   */
  private preTrainANN(): void {
    // Rules: RSI<35 → BUY(0), RSI>65 → SELL(1), else → HOLD(2)
    for (let i = 0; i < 500; i++) {
      const rsi01 = Math.random();         // 0=RSI 0, 1=RSI 100
      const rsi   = rsi01 * 100;
      const label = rsi < 35 ? 0 : rsi > 65 ? 1 : 2;

      // Construct a plausible feature vector consistent with the RSI
      const trend  = rsi < 50 ? 0.4 + Math.random() * 0.1 : 0.55 + Math.random() * 0.1;
      const pctB   = rsi < 35 ? Math.random() * 0.2 : rsi > 65 ? 0.8 + Math.random() * 0.2 : 0.3 + Math.random() * 0.4;
      const macd01 = rsi < 50 ? 0.3 + Math.random() * 0.2 : 0.55 + Math.random() * 0.2;
      const vol01  = 0.2 + Math.random() * 0.6;
      const ret01  = rsi < 50 ? 0.3 + Math.random() * 0.2 : 0.55 + Math.random() * 0.2;
      const volR   = 0.2 + Math.random() * 0.6;

      this.ann.train([rsi01, trend, pctB, macd01, vol01, ret01, volR], label);
    }
    console.log("ANN pre-training complete (500 synthetic epochs)");
  }

  // ── Technical strategies (unchanged from original) ────────────────────────

  private movingAverageStrategy(stock: Stock, priceHistory: StockPriceHistory[]): TradingDecision {
    if (priceHistory.length < 50) {
      return { signal: "HOLD", confidence: 50, reason: "Insufficient data for MA strategy", indicatorsUsed: ["SMA"] };
    }
    const closes  = priceHistory.map(d => d.close);
    const sma10   = this.calculateSMA(closes, 10);
    const sma50   = this.calculateSMA(closes, 50);
    const pSma10  = this.calculateSMA(closes.slice(0, -1), 10);
    const pSma50  = this.calculateSMA(closes.slice(0, -1), 50);

    if (pSma10 <= pSma50 && sma10 > sma50)
      return { signal: "BUY",  confidence: 75, reason: "Short-term MA crossed above long-term MA", indicatorsUsed: ["SMA10", "SMA50"] };
    if (pSma10 >= pSma50 && sma10 < sma50)
      return { signal: "SELL", confidence: 75, reason: "Short-term MA crossed below long-term MA", indicatorsUsed: ["SMA10", "SMA50"] };

    const str = Math.abs(sma10 - sma50) / sma50 * 100;
    return { signal: "HOLD", confidence: 50 + str * (sma10 > sma50 ? 1 : -1),
      reason: `Trending ${sma10 > sma50 ? 'upward' : 'downward'} but no crossover`, indicatorsUsed: ["SMA10", "SMA50"] };
  }

  private rsiStrategy(stock: Stock, priceHistory: StockPriceHistory[]): TradingDecision {
    if (priceHistory.length < 15)
      return { signal: "HOLD", confidence: 50, reason: "Insufficient data for RSI", indicatorsUsed: ["RSI"] };

    const rsi = this.calculateRSI(priceHistory.map(d => d.close), 14);
    if (rsi < 30)
      return { signal: "BUY",  confidence: Math.max(70, 100 - rsi), reason: `RSI oversold at ${rsi.toFixed(2)}`, indicatorsUsed: ["RSI"] };
    if (rsi > 70)
      return { signal: "SELL", confidence: Math.max(70, rsi),       reason: `RSI overbought at ${rsi.toFixed(2)}`, indicatorsUsed: ["RSI"] };
    return { signal: "HOLD", confidence: 50 + Math.abs(rsi - 50), reason: `RSI neutral at ${rsi.toFixed(2)}`, indicatorsUsed: ["RSI"] };
  }

  private macdStrategy(stock: Stock, priceHistory: StockPriceHistory[]): TradingDecision {
    if (priceHistory.length < 35)
      return { signal: "HOLD", confidence: 50, reason: "Insufficient data for MACD", indicatorsUsed: ["MACD"] };

    const closes = priceHistory.map(d => d.close);
    const { histogram, signalLine } = this.calculateMACD(closes);
    const prevH   = this.calculateMACD(closes.slice(0, -1)).histogram;

    if (prevH <= 0 && histogram > 0)
      return { signal: "BUY",  confidence: 80, reason: "MACD bullish crossover", indicatorsUsed: ["MACD"] };
    if (prevH >= 0 && histogram < 0)
      return { signal: "SELL", confidence: 80, reason: "MACD bearish crossover", indicatorsUsed: ["MACD"] };

    const str = Math.min(10, Math.abs(histogram / (signalLine || 1)) * 100);
    return { signal: "HOLD", confidence: 50 + str * (histogram > 0 ? 1 : -1),
      reason: `MACD ${histogram > 0 ? 'bullish' : 'bearish'} but no crossover`, indicatorsUsed: ["MACD"] };
  }

  private bollingerBandsStrategy(stock: Stock, priceHistory: StockPriceHistory[]): TradingDecision {
    if (priceHistory.length < 20)
      return { signal: "HOLD", confidence: 50, reason: "Insufficient data for Bollinger Bands", indicatorsUsed: ["Bollinger Bands"] };

    const closes = priceHistory.map(d => d.close);
    const cur    = closes[closes.length - 1];
    const { upper, middle, lower } = this.calculateBollingerBands(closes, 20, 2);
    const pctB   = (cur - lower) / (upper - lower);

    if (cur < lower)
      return { signal: "BUY",  confidence: Math.min(90, 70 + (lower - cur) / lower * 100),
        reason: "Price below lower Bollinger Band (oversold)", indicatorsUsed: ["Bollinger Bands"] };
    if (cur > upper)
      return { signal: "SELL", confidence: Math.min(90, 70 + (cur - upper) / upper * 100),
        reason: "Price above upper Bollinger Band (overbought)", indicatorsUsed: ["Bollinger Bands"] };

    const reason = pctB > 0.8 ? "Near upper band" : pctB < 0.2 ? "Near lower band" : "Within normal range";
    return { signal: "HOLD", confidence: 50, reason, indicatorsUsed: ["Bollinger Bands"] };
  }

  // ── Math helpers ──────────────────────────────────────────────────────────

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] ?? 0;
    const sl = prices.slice(-period);
    return sl.reduce((a, b) => a + b, 0) / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return this.calculateSMA(prices, prices.length);
    const m = 2 / (period + 1);
    let ema  = this.calculateSMA(prices.slice(0, period), period);
    for (let i = period; i < prices.length; i++) ema = (prices[i] - ema) * m + ema;
    return ema;
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length <= period) return 50;
    let g = 0, l = 0;
    for (let i = 1; i <= period; i++) {
      const d = prices[i] - prices[i - 1];
      d >= 0 ? (g += d) : (l -= d);
    }
    let ag = g / period, al = l / period;
    for (let i = period + 1; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      ag = (ag * (period - 1) + Math.max(0,  d)) / period;
      al = (al * (period - 1) + Math.max(0, -d)) / period;
    }
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }

  private calculateMACD(prices: number[]): { macdLine: number; signalLine: number; histogram: number } {
    if (prices.length < 26) return { macdLine: 0, signalLine: 0, histogram: 0 };
    const macdLine  = this.calculateEMA(prices, 12) - this.calculateEMA(prices, 26);
    const macdArr   = prices.slice(-9).map((_, k, a) => {
      const sl = prices.slice(0, prices.length - (a.length - 1 - k));
      return this.calculateEMA(sl, 12) - this.calculateEMA(sl, 26);
    });
    const signalLine = this.calculateEMA(macdArr, Math.min(9, macdArr.length));
    return { macdLine, signalLine, histogram: macdLine - signalLine };
  }

  private calculateBollingerBands(prices: number[], period: number, k: number) {
    if (prices.length < period) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return { upper: avg * 1.1, middle: avg, lower: avg * 0.9 };
    }
    const mid = this.calculateSMA(prices, period);
    const rec = prices.slice(-period);
    const sd  = Math.sqrt(rec.reduce((s, p) => s + (p - mid) ** 2, 0) / period);
    return { upper: mid + k * sd, middle: mid, lower: mid - k * sd };
  }

  private calculateVolatility(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0.02;
    const rets = prices.slice(-period - 1).map((p, i, a) => i === 0 ? 0 : (p / a[i - 1]) - 1).slice(1);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    return Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length);
  }

  // ── Data / utility helpers ────────────────────────────────────────────────

  private calcReturnPct(pnl: number, history: any[]): number {
    const inv = history.filter(t => t.action === "BUY")
      .reduce((s, t) => s + t.price * t.quantity, 0);
    return inv === 0 ? 0 : (pnl / inv) * 100;
  }

  private generatePerformanceTimeline(): PerformanceTimepoint[] {
    const tl: PerformanceTimepoint[] = [];
    let v = 1_000_000;
    const now = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const chg = v * ((Math.random() * 3.5 - 1.5) / 100);
      v += chg;
      tl.push({ date: d.toISOString().split('T')[0], value: Math.round(v * 100) / 100, change: Math.round(chg * 100) / 100 });
    }
    return tl;
  }

  private initializeHistoricalData(): void {
    const configs = [
      { id: 1, base: 3400, vol: 0.015, trend:  0.0005 }, // TCS
      { id: 2, base: 2400, vol: 0.02,  trend:  0.0007 }, // Reliance
      { id: 3, base: 1680, vol: 0.018, trend: -0.0002 }, // HDFC Bank
      { id: 4, base: 1450, vol: 0.022, trend:  0.001  }, // Infosys
      { id: 5, base:  920, vol: 0.016, trend:  0.0004 }, // ICICI Bank
      { id: 6, base:  120, vol: 0.025, trend:  0.0003 }, // Tata Steel
    ];
    configs.forEach(c => this.generateHistoricalData(c.id, 180, c.base, c.vol, c.trend));
  }

  private generateHistoricalData(stockId: number, days: number, basePrice: number, volatility: number, trend: number): void {
    const history: StockPriceHistory[] = [];
    let cur = basePrice;
    const now = new Date();

    for (let i = days; i >= 0; i--) {
      const date = new Date(now); date.setDate(date.getDate() - i);
      if ([0, 6].includes(date.getDay())) continue;

      cur = Math.max(basePrice * 0.5, cur * (1 + (Math.random() * 2 - 1) * volatility + trend));
      const dv   = volatility * 0.7;
      const open = cur * (1 + (Math.random() * 0.01 - 0.005));
      const high = Math.max(open, cur) * (1 + Math.random() * dv);
      const low  = Math.min(open, cur) * (1 - Math.random() * dv);
      const vol  = Math.round(basePrice * 1000 * (0.5 + Math.random()));

      history.push({
        date: date.toISOString().split('T')[0],
        open:   Math.round(open * 100) / 100,
        high:   Math.round(high * 100) / 100,
        low:    Math.round(low  * 100) / 100,
        close:  Math.round(cur  * 100) / 100,
        volume: vol
      });
    }
    this.historicalData.set(stockId, history);
  }
}

export const tradingBot = TradingBot.getInstance();