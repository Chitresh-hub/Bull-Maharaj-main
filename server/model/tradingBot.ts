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
export type TradingStrategy = "MOVING_AVERAGE" | "RSI" | "MACD" | "BOLLINGER" | "ANN" | "RNN";

// ─── Shared Math Helpers ──────────────────────────────────────────────────────

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

function zerosMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function relu(x: number): number {
  return Math.max(0, x);
}

function tanhFn(x: number): number {
  return Math.tanh(x);
}

function tanhDeriv(tanhVal: number): number {
  return 1 - tanhVal * tanhVal;
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
  weights: Matrix,
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
// Architecture: 7 inputs → 12 hidden (ReLU) → 6 hidden (ReLU) → 3 outputs (Softmax)

class ANN {
  private W1: Matrix; // 12 × 7
  private b1: number[];
  private W2: Matrix; // 6 × 12
  private b2: number[];
  private W3: Matrix; // 3 × 6
  private b3: number[];

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

  forward(input: number[]): number[] {
    const h1 = denseForward(input, this.W1, this.b1, relu);
    const h2 = denseForward(h1,    this.W2, this.b2, relu);
    const logits = denseForward(h2, this.W3, this.b3, x => x);
    return softmax(logits);
  }

  train(input: number[], label: number): void {
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

    const dLogits = probs.map((p, i) => p - (i === label ? 1 : 0));

    const dW3: Matrix = this.W3.map((_, i) => h2.map(hj => dLogits[i] * hj));
    const db3 = dLogits;

    const dH2 = h2.map((_, j) =>
      this.W3.reduce((s, row, i) => s + row[j] * dLogits[i], 0)
    );
    const dH2Raw = dH2.map((d, j) => d * (h2Raw[j] > 0 ? 1 : 0));

    const dW2: Matrix = this.W2.map((_, i) => h1.map(hj => dH2Raw[i] * hj));
    const db2 = dH2Raw;

    const dH1 = h1.map((_, j) =>
      this.W2.reduce((s, row, i) => s + row[j] * dH2Raw[i], 0)
    );
    const dH1Raw = dH1.map((d, j) => d * (h1Raw[j] > 0 ? 1 : 0));

    const dW1: Matrix = this.W1.map((_, i) => input.map(x => dH1Raw[i] * x));
    const db1 = dH1Raw;

    this.t++;
    const bc1 = 1 - Math.pow(this.beta1, this.t);
    const bc2 = 1 - Math.pow(this.beta2, this.t);

    const applyAdam = (W: Matrix, dW: Matrix, mW: Matrix, vW: Matrix) => {
      W.forEach((row, i) => {
        row.forEach((_, j) => {
          mW[i][j] = this.beta1 * mW[i][j] + (1 - this.beta1) * dW[i][j];
          vW[i][j] = this.beta2 * vW[i][j] + (1 - this.beta2) * dW[i][j] ** 2;
          W[i][j] -= this.lr * (mW[i][j] / bc1) / (Math.sqrt(vW[i][j] / bc2) + this.eps);
        });
      });
    };

    if (!this._mW1) this._initMoments();
    applyAdam(this.W1, dW1, this._mW1!, this._vW1!);
    applyAdam(this.W2, dW2, this._mW2!, this._vW2!);
    applyAdam(this.W3, dW3, this._mW3!, this._vW3!);

    [this.b1, db1, this._mb1!, this._vb1!].forEach(() => {});
    this._applyAdamBias(this.b1, db1, this._mb1!, this._vb1!, bc1, bc2);
    this._applyAdamBias(this.b2, db2, this._mb2!, this._vb2!, bc1, bc2);
    this._applyAdamBias(this.b3, db3, this._mb3!, this._vb3!, bc1, bc2);
  }

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

// ─── RNN class ────────────────────────────────────────────────────────────────
// Elman (vanilla) RNN with BPTT over a fixed-length sequence window.
//
// Architecture:
//   Input  x_t : 7 features  (same feature vector as ANN, per timestep)
//   Hidden h_t : 20 neurons  (tanh)       h_t = tanh(Wx·x_t + Wh·h_{t-1} + bh)
//   Output y   : 3 classes   (softmax)    y   = softmax(Wy·h_T + by)
//
// The model processes a sliding window of SEQ_LEN=10 daily feature vectors,
// letting it capture short-term temporal dynamics that a feed-forward ANN cannot.
//
// Training: truncated BPTT through the full SEQ_LEN steps, Adam optimiser.
// Online fine-tuning is applied after every confirmed user trade (same as ANN).

class RNN {
  static readonly INPUT_SIZE  = 7;
  static readonly HIDDEN_SIZE = 20;
  static readonly OUTPUT_SIZE = 3;
  static readonly SEQ_LEN     = 10;   // timesteps per forward pass

  // Recurrent weights
  private Wx: Matrix;   // HIDDEN × INPUT   — input-to-hidden
  private Wh: Matrix;   // HIDDEN × HIDDEN  — hidden-to-hidden (recurrent)
  private bh: number[]; // HIDDEN

  // Output weights
  private Wy: Matrix;   // OUTPUT × HIDDEN
  private by: number[]; // OUTPUT

  // Adam state
  private lr: number;
  private beta1 = 0.9;
  private beta2 = 0.999;
  private eps   = 1e-8;
  private t     = 0;

  // Adam moment buffers (lazy-init)
  private mWx?: Matrix; private vWx?: Matrix;
  private mWh?: Matrix; private vWh?: Matrix;
  private mbh?: number[]; private vbh?: number[];
  private mWy?: Matrix; private vWy?: Matrix;
  private mby?: number[]; private vby?: number[];

  constructor(learningRate: number = 0.001) {
    this.lr = learningRate;
    this.Wx = xavier(RNN.HIDDEN_SIZE, RNN.INPUT_SIZE);
    this.Wh = xavier(RNN.HIDDEN_SIZE, RNN.HIDDEN_SIZE);
    this.bh = zeros(RNN.HIDDEN_SIZE);
    this.Wy = xavier(RNN.OUTPUT_SIZE, RNN.HIDDEN_SIZE);
    this.by = zeros(RNN.OUTPUT_SIZE);
  }

  // ── Forward pass ────────────────────────────────────────────────────────

  /**
   * Run the sequence through the RNN.
   * @param sequence  Array of T feature vectors, each of length INPUT_SIZE.
   * @returns [probs, hiddenStates, rawH]
   *   probs        — softmax output [P(BUY), P(SELL), P(HOLD)]
   *   hiddenStates — h_t for each timestep (needed for BPTT)
   *   rawH         — pre-tanh values (needed for BPTT gradient)
   */
  private forwardFull(sequence: number[][]): {
    probs: number[];
    hiddenStates: number[][];
    rawH: number[][];
  } {
    const H = RNN.HIDDEN_SIZE;
    const T = sequence.length;

    const hiddenStates: number[][] = [zeros(H)]; // h_0 = zeros
    const rawH: number[][] = [];

    for (let t = 0; t < T; t++) {
      const x = sequence[t];
      const hPrev = hiddenStates[t];

      // z_t = Wx·x_t + Wh·h_{t-1} + bh
      const z = this.Wx.map((row, i) => {
        const wx = row.reduce((s, w, j) => s + w * x[j], 0);
        const wh = this.Wh[i].reduce((s, w, j) => s + w * hPrev[j], 0);
        return wx + wh + this.bh[i];
      });

      rawH.push(z);
      hiddenStates.push(z.map(tanhFn));
    }

    // Output from final hidden state
    const hT   = hiddenStates[T];
    const logits = this.Wy.map((row, i) =>
      row.reduce((s, w, j) => s + w * hT[j], 0) + this.by[i]
    );
    const probs = softmax(logits);

    return { probs, hiddenStates, rawH };
  }

  /** Public forward — returns softmax probabilities only */
  forward(sequence: number[][]): number[] {
    return this.forwardFull(sequence).probs;
  }

  // ── Truncated BPTT ───────────────────────────────────────────────────────

  /**
   * One training step over a full sequence.
   * label: 0=BUY, 1=SELL, 2=HOLD
   */
  train(sequence: number[][], label: number): void {
    const T = sequence.length;
    const { probs, hiddenStates, rawH } = this.forwardFull(sequence);

    // ── Output gradient (cross-entropy + softmax) ──
    const dLogits = probs.map((p, i) => p - (i === label ? 1 : 0)); // [OUTPUT]

    // ── Wy, by gradients ──
    const hT = hiddenStates[T];
    const dWy: Matrix = this.Wy.map((_, i) => hT.map(hj => dLogits[i] * hj));
    const dby = [...dLogits];

    // ── Backprop into hT ──
    const dHNext: number[] = hT.map((_, j) =>
      this.Wy.reduce((s, row, i) => s + row[j] * dLogits[i], 0)
    );

    // Accumulate weight gradients over timesteps
    const dWx: Matrix = zerosMatrix(RNN.HIDDEN_SIZE, RNN.INPUT_SIZE);
    const dWh: Matrix = zerosMatrix(RNN.HIDDEN_SIZE, RNN.HIDDEN_SIZE);
    const dbh: number[] = zeros(RNN.HIDDEN_SIZE);

    let dH = dHNext;

    for (let t = T - 1; t >= 0; t--) {
      // dH through tanh
      const dZ = dH.map((d, i) => d * tanhDeriv(hiddenStates[t + 1][i]));

      // Accumulate Wx gradients
      dZ.forEach((dz, i) => {
        sequence[t].forEach((xj, j) => { dWx[i][j] += dz * xj; });
        hiddenStates[t].forEach((hj, j) => { dWh[i][j] += dz * hj; });
        dbh[i] += dz;
      });

      // Propagate gradient to previous hidden state
      dH = hiddenStates[t].map((_, j) =>
        this.Wh.reduce((s, row, i) => s + row[j] * dZ[i], 0)
      );
    }

    // ── Adam update ──
    this.t++;
    if (!this.mWx) this._initMoments();
    this._adamMatrix(this.Wx, dWx, this.mWx!, this.vWx!);
    this._adamMatrix(this.Wh, dWh, this.mWh!, this.vWh!);
    this._adamMatrix(this.Wy, dWy, this.mWy!, this.vWy!);
    this._adamBias(this.bh, dbh, this.mbh!, this.vbh!);
    this._adamBias(this.by, dby, this.mby!, this.vby!);
  }

  // ── Adam helpers ─────────────────────────────────────────────────────────

  private _initMoments(): void {
    const mxLike = (m: Matrix): Matrix => m.map(r => r.map(() => 0));
    this.mWx = mxLike(this.Wx); this.vWx = mxLike(this.Wx);
    this.mWh = mxLike(this.Wh); this.vWh = mxLike(this.Wh);
    this.mWy = mxLike(this.Wy); this.vWy = mxLike(this.Wy);
    this.mbh = zeros(RNN.HIDDEN_SIZE); this.vbh = zeros(RNN.HIDDEN_SIZE);
    this.mby = zeros(RNN.OUTPUT_SIZE); this.vby = zeros(RNN.OUTPUT_SIZE);
  }

  private _adamMatrix(W: Matrix, dW: Matrix, mW: Matrix, vW: Matrix): void {
    const bc1 = 1 - Math.pow(this.beta1, this.t);
    const bc2 = 1 - Math.pow(this.beta2, this.t);
    W.forEach((row, i) => {
      row.forEach((_, j) => {
        mW[i][j] = this.beta1 * mW[i][j] + (1 - this.beta1) * dW[i][j];
        vW[i][j] = this.beta2 * vW[i][j] + (1 - this.beta2) * dW[i][j] ** 2;
        W[i][j] -= this.lr * (mW[i][j] / bc1) / (Math.sqrt(vW[i][j] / bc2) + this.eps);
      });
    });
  }

  private _adamBias(b: number[], db: number[], mb: number[], vb: number[]): void {
    const bc1 = 1 - Math.pow(this.beta1, this.t);
    const bc2 = 1 - Math.pow(this.beta2, this.t);
    b.forEach((_, i) => {
      mb[i] = this.beta1 * mb[i] + (1 - this.beta1) * db[i];
      vb[i] = this.beta2 * vb[i] + (1 - this.beta2) * db[i] ** 2;
      b[i] -= this.lr * (mb[i] / bc1) / (Math.sqrt(vb[i] / bc2) + this.eps);
    });
  }

  setLearningRate(lr: number): void { this.lr = lr; }
}

// ─── TradingBot ───────────────────────────────────────────────────────────────

class TradingBot {
  private static instance: TradingBot;
  private botActive: boolean = true;
  private currentStrategy: TradingStrategy = "ANN";
  private historicalData: Map<number, StockPriceHistory[]> = new Map();

  // ANN model — persists across calls (online learning)
  private ann: ANN;

  // RNN model — persists across calls (online learning)
  private rnn: RNN;

  private learningRate: number = 0.001;

  private constructor() {
    this.ann = new ANN(this.learningRate);
    this.rnn = new RNN(this.learningRate);
    console.log("Trading bot initialised with ANN + RNN models");
    this.initializeHistoricalData();
    this.preTrainANN();
    this.preTrainRNN();
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
      this.rnn.setLearningRate(this.learningRate);
    }
    console.log(`ANN + RNN learning rate set to ${this.learningRate}`);
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
      case "RNN":            return this.rnnStrategy(stock, priceHistory);
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

      // Online fine-tune both models with the confirmed action
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
    const probs = this.ann.forward(input);

    const labels: TradingSignal[] = ["BUY", "SELL", "HOLD"];
    const best  = probs.indexOf(Math.max(...probs));
    const signal: TradingSignal = labels[best];
    const confidence = Math.round(Math.min(97, probs[best] * 100 + 10));

    const closePrices = priceHistory.map(d => d.close);
    const rsi   = this.calculateRSI(closePrices, 14);
    const sma10 = this.calculateSMA(closePrices, 10);
    const sma50 = this.calculateSMA(closePrices, 50);

    const rsiLabel   = rsi < 35 ? "oversold" : rsi > 65 ? "overbought" : "neutral";
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

  // ── RNN Strategy ──────────────────────────────────────────────────────────

  /**
   * Uses the same 7-feature vector as the ANN, but feeds a sliding window of
   * the last SEQ_LEN=10 daily snapshots into the RNN.  The recurrent hidden
   * state lets the model capture short-term temporal patterns (e.g. a trend
   * that has been building over several days) that a single-step ANN cannot.
   *
   * Sequence composition (oldest → newest):
   *   [t-9, t-8, …, t-1, t]  →  h_t  →  softmax([BUY, SELL, HOLD])
   *
   * Confidence is boosted by agreement with the single-step ANN prediction,
   * rewarding cases where both models reach the same conclusion.
   */
  private rnnStrategy(stock: Stock, priceHistory: StockPriceHistory[]): TradingDecision {
    const seqLen = RNN.SEQ_LEN;
    const minLen = 50 + seqLen; // need enough history for feature calc at each step

    if (priceHistory.length < minLen) {
      return {
        signal: "HOLD",
        confidence: 50,
        reason: "Insufficient historical data for RNN strategy",
        indicatorsUsed: ["RNN"]
      };
    }

    // Build a sequence of feature vectors, one per timestep in the window.
    // For timestep t we use priceHistory[0..t] so each vector sees only data
    // available up to that day (no look-ahead bias).
    const totalLen = priceHistory.length;
    const sequence: number[][] = [];

    for (let step = 0; step < seqLen; step++) {
      // Slice history up to this timestep (inclusive)
      const sliceEnd = totalLen - (seqLen - 1 - step);
      const histSlice = priceHistory.slice(0, sliceEnd);
      sequence.push(this.buildFeatureVector(histSlice));
    }

    // Run RNN forward pass over the sequence
    const probs = this.rnn.forward(sequence);
    const labels: TradingSignal[] = ["BUY", "SELL", "HOLD"];
    const best   = probs.indexOf(Math.max(...probs));
    const signal: TradingSignal = labels[best];

    // Optional: cross-check with single-step ANN to calibrate confidence
    const annInput  = this.buildFeatureVector(priceHistory);
    const annProbs  = this.ann.forward(annInput);
    const annBest   = annProbs.indexOf(Math.max(...annProbs));
    const agreement = annBest === best;

    // Confidence: base from RNN output, +5 bonus if ANN agrees
    const baseConf   = Math.round(Math.min(95, probs[best] * 100 + 10));
    const confidence = agreement ? Math.min(97, baseConf + 5) : baseConf;

    // Human-readable momentum summary from the last few steps
    const recent   = sequence.slice(-3).map(v => v[5]); // feature 5 = 5-day return
    const momentum = recent.every(r => r > 0.5) ? "sustained upward momentum"
                   : recent.every(r => r < 0.5) ? "sustained downward momentum"
                   : "mixed momentum";

    const closePrices = priceHistory.map(d => d.close);
    const rsi   = this.calculateRSI(closePrices, 14);
    const rsiLabel = rsi < 35 ? "oversold" : rsi > 65 ? "overbought" : "neutral";

    return {
      signal,
      confidence,
      reason:
        `RNN model (${seqLen}-day sequence): ${momentum}, RSI ${rsiLabel} (${rsi.toFixed(1)}). ` +
        `Sequence confidence: BUY ${(probs[0]*100).toFixed(1)}% / ` +
        `SELL ${(probs[1]*100).toFixed(1)}% / HOLD ${(probs[2]*100).toFixed(1)}%. ` +
        `ANN cross-check: ${agreement ? "agrees" : "disagrees"}.`,
      indicatorsUsed: [
        "RNN", "RSI", "SMA", "Bollinger Bands", "MACD", "Volatility", "Volume", "Sequence"
      ]
    };
  }

  // ── Shared feature builder ────────────────────────────────────────────────

  /** Build normalised [0,1] feature vector of length 7 */
  private buildFeatureVector(priceHistory: StockPriceHistory[]): number[] {
    const closePrices = priceHistory.map(d => d.close);
    const volumes     = priceHistory.map(d => d.volume);

    const rsi  = this.calculateRSI(closePrices, 14);
    const f0   = normalise(rsi, 0, 100);

    const sma10 = this.calculateSMA(closePrices, 10);
    const sma50 = this.calculateSMA(closePrices, 50);
    const f1    = normalise(sma10 / sma50, 0.85, 1.15);

    const { upper, lower } = this.calculateBollingerBands(closePrices, 20, 2);
    const curP = closePrices[closePrices.length - 1];
    const f2   = normalise(curP, lower, upper);

    const { histogram } = this.calculateMACD(closePrices);
    const f3 = normalise(histogram, -curP * 0.02, curP * 0.02);

    const vol = this.calculateVolatility(closePrices, 14);
    const f4  = normalise(vol, 0, 0.06);

    const ret5 = closePrices.length >= 6
      ? (closePrices[closePrices.length - 1] / closePrices[closePrices.length - 6]) - 1
      : 0;
    const f5 = normalise(ret5, -0.05, 0.05);

    const lastVol = volumes[volumes.length - 1];
    const avgVol  = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const f6      = normalise(lastVol / (avgVol || 1), 0, 3);

    return [f0, f1, f2, f3, f4, f5, f6];
  }

  // ── Online learning ───────────────────────────────────────────────────────

  /** Fine-tune both ANN and RNN after a confirmed trade */
  private onlineTrain(stockId: number, action: TradingSignal): void {
    const hist  = this.getHistoricalPriceData(stockId);
    const label = action === "BUY" ? 0 : action === "SELL" ? 1 : 2;

    // ANN: single feature vector
    if (hist.length >= 50) {
      const input = this.buildFeatureVector(hist);
      this.ann.train(input, label);
    }

    // RNN: sequence of feature vectors
    const seqLen = RNN.SEQ_LEN;
    const minLen = 50 + seqLen;
    if (hist.length >= minLen) {
      const totalLen = hist.length;
      const sequence: number[][] = [];
      for (let step = 0; step < seqLen; step++) {
        const sliceEnd = totalLen - (seqLen - 1 - step);
        sequence.push(this.buildFeatureVector(hist.slice(0, sliceEnd)));
      }
      this.rnn.train(sequence, label);
    }
  }

  // ── Pre-training ──────────────────────────────────────────────────────────

  /**
   * Pre-train the ANN on synthetic labeled examples so it starts with
   * sensible weights rather than random Xavier init.
   */
  private preTrainANN(): void {
    for (let i = 0; i < 500; i++) {
      const rsi01 = Math.random();
      const rsi   = rsi01 * 100;
      const label = rsi < 35 ? 0 : rsi > 65 ? 1 : 2;

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

  /**
   * Pre-train the RNN on synthetic sequences.
   *
   * Each sequence is a smooth 10-step trajectory ending at a given RSI level,
   * so the RNN learns to decode trending feature patterns, not just snapshots.
   * Label rule: final RSI < 35 → BUY(0), > 65 → SELL(1), else → HOLD(2).
   */
  private preTrainRNN(): void {
    const seqLen = RNN.SEQ_LEN;

    for (let i = 0; i < 500; i++) {
      const finalRsi = Math.random() * 100;
      const label    = finalRsi < 35 ? 0 : finalRsi > 65 ? 1 : 2;

      // Build a smooth sequence: linearly interpolate from a neutral start
      const startRsi = 45 + (Math.random() * 10 - 5); // start near neutral
      const sequence: number[][] = [];

      for (let t = 0; t < seqLen; t++) {
        const alpha = t / (seqLen - 1);
        const rsi   = startRsi + alpha * (finalRsi - startRsi);
        const rsi01 = normalise(rsi, 0, 100);

        // Correlated features: trend follows RSI direction, noise added
        const trend  = rsi < 50
          ? 0.4 + alpha * 0.1 + (Math.random() - 0.5) * 0.05
          : 0.55 + alpha * 0.1 + (Math.random() - 0.5) * 0.05;
        const pctB   = rsi01 + (Math.random() - 0.5) * 0.1;
        const macd01 = rsi < 50
          ? 0.35 + alpha * 0.15 + (Math.random() - 0.5) * 0.05
          : 0.55 + alpha * 0.1  + (Math.random() - 0.5) * 0.05;
        const vol01  = 0.2 + Math.random() * 0.6;
        const ret01  = rsi < 50
          ? 0.35 + alpha * 0.1 + (Math.random() - 0.5) * 0.05
          : 0.55 + alpha * 0.1 + (Math.random() - 0.5) * 0.05;
        const volR   = 0.2 + Math.random() * 0.6;

        sequence.push([
          Math.min(1, Math.max(0, rsi01)),
          Math.min(1, Math.max(0, trend)),
          Math.min(1, Math.max(0, pctB)),
          Math.min(1, Math.max(0, macd01)),
          Math.min(1, Math.max(0, vol01)),
          Math.min(1, Math.max(0, ret01)),
          Math.min(1, Math.max(0, volR))
        ]);
      }

      this.rnn.train(sequence, label);
    }
    console.log("RNN pre-training complete (500 synthetic sequence epochs)");
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