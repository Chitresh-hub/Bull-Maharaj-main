"""
trading_bot.py
Converted from tradingBot.ts (Bull Maharaj)

Architecture:
  ANN  : 7 → 12 (ReLU) → 6 (ReLU) → 3 (Softmax)   — single-step
  RNN  : Elman, 7-input / 20-hidden (tanh) / 3-output — 10-step sequence
Both trained with Adam optimiser + online fine-tuning after each confirmed trade.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple

# ─── Type aliases ──────────────────────────────────────────────────────────────

TradingSignal   = Literal["BUY", "SELL", "HOLD"]
TradingStrategy = Literal["MOVING_AVERAGE", "RSI", "MACD", "BOLLINGER", "ANN", "RNN"]
Matrix          = List[List[float]]

# ─── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class StockPriceHistory:
    date:   str
    open:   float
    high:   float
    low:    float
    close:  float
    volume: int


@dataclass
class TradingDecision:
    signal:          TradingSignal
    confidence:      float
    reason:          str
    indicators_used: List[str]


@dataclass
class PerformanceTimepoint:
    date:   str
    value:  float
    change: float


@dataclass
class BotPerformanceMetrics:
    total_return:            float
    total_return_percentage: float
    win_rate:                float
    total_trades:            int
    successful_trades:       int
    failed_trades:           int
    average_holding_period:  float
    performance_timeline:    List[PerformanceTimepoint]


@dataclass
class Stock:
    """Minimal stock representation (mirrors the shared schema)."""
    id:            int
    symbol:        str
    current_price: float


@dataclass
class TradeRecord:
    user_id:     int
    stock_id:    int
    action:      TradingSignal
    quantity:    int
    price:       float
    profit_loss: Optional[float] = None


# ─── Shared math helpers ───────────────────────────────────────────────────────

def _xavier(rows: int, cols: int) -> Matrix:
    limit = math.sqrt(6 / (rows + cols))
    return [[random.uniform(-limit, limit) for _ in range(cols)] for _ in range(rows)]


def _zeros(size: int) -> List[float]:
    return [0.0] * size


def _zeros_matrix(rows: int, cols: int) -> Matrix:
    return [[0.0] * cols for _ in range(rows)]


def _relu(x: float) -> float:
    return max(0.0, x)


def _tanh(x: float) -> float:
    return math.tanh(x)


def _tanh_deriv(tanh_val: float) -> float:
    return 1.0 - tanh_val * tanh_val


def _softmax(logits: List[float]) -> List[float]:
    m = max(logits)
    exps = [math.exp(v - m) for v in logits]
    s = sum(exps)
    return [e / s for e in exps]


def _dense_forward(
    inp: List[float],
    weights: Matrix,
    biases: List[float],
    activation
) -> List[float]:
    return [
        activation(sum(w * inp[j] for j, w in enumerate(row)) + biases[i])
        for i, row in enumerate(weights)
    ]


def _normalise(val: float, mn: float, mx: float) -> float:
    if mx == mn:
        return 0.5
    return min(1.0, max(0.0, (val - mn) / (mx - mn)))


# ─── ANN ──────────────────────────────────────────────────────────────────────
# Architecture: 7 → 12 (ReLU) → 6 (ReLU) → 3 (Softmax)

class ANN:
    def __init__(self, learning_rate: float = 0.001) -> None:
        self.lr     = learning_rate
        self.beta1  = 0.9
        self.beta2  = 0.999
        self.eps    = 1e-8
        self.t      = 0

        self.W1 = _xavier(12, 7)
        self.b1 = _zeros(12)
        self.W2 = _xavier(6, 12)
        self.b2 = _zeros(6)
        self.W3 = _xavier(3, 6)
        self.b3 = _zeros(3)

        # Adam moment buffers (lazy-init)
        self._moments_ready = False

    # ── Forward ──────────────────────────────────────────────────────────────

    def forward(self, inp: List[float]) -> List[float]:
        h1     = _dense_forward(inp, self.W1, self.b1, _relu)
        h2     = _dense_forward(h1,  self.W2, self.b2, _relu)
        logits = _dense_forward(h2,  self.W3, self.b3, lambda x: x)
        return _softmax(logits)

    # ── Training (one step) ───────────────────────────────────────────────────

    def train(self, inp: List[float], label: int) -> None:
        # Forward with cache
        h1_raw = [sum(self.W1[i][j] * inp[j] for j in range(7)) + self.b1[i] for i in range(12)]
        h1     = [_relu(v) for v in h1_raw]

        h2_raw = [sum(self.W2[i][j] * h1[j] for j in range(12)) + self.b2[i] for i in range(6)]
        h2     = [_relu(v) for v in h2_raw]

        logits = [sum(self.W3[i][j] * h2[j] for j in range(6)) + self.b3[i] for i in range(3)]
        probs  = _softmax(logits)

        # Output gradient
        d_logits = [p - (1.0 if i == label else 0.0) for i, p in enumerate(probs)]

        # Layer 3 gradients
        dW3 = [[d_logits[i] * h2[j] for j in range(6)] for i in range(3)]
        db3 = list(d_logits)

        # Layer 2 gradients
        dH2     = [sum(self.W3[i][j] * d_logits[i] for i in range(3)) for j in range(6)]
        dH2_raw = [dH2[j] * (1.0 if h2_raw[j] > 0 else 0.0) for j in range(6)]
        dW2     = [[dH2_raw[i] * h1[j] for j in range(12)] for i in range(6)]
        db2     = list(dH2_raw)

        # Layer 1 gradients
        dH1     = [sum(self.W2[i][j] * dH2_raw[i] for i in range(6)) for j in range(12)]
        dH1_raw = [dH1[j] * (1.0 if h1_raw[j] > 0 else 0.0) for j in range(12)]
        dW1     = [[dH1_raw[i] * inp[j] for j in range(7)] for i in range(12)]
        db1     = list(dH1_raw)

        # Adam update
        self.t += 1
        if not self._moments_ready:
            self._init_moments()

        self._adam_matrix(self.W1, dW1, self._mW1, self._vW1)
        self._adam_matrix(self.W2, dW2, self._mW2, self._vW2)
        self._adam_matrix(self.W3, dW3, self._mW3, self._vW3)
        self._adam_bias(self.b1, db1, self._mb1, self._vb1)
        self._adam_bias(self.b2, db2, self._mb2, self._vb2)
        self._adam_bias(self.b3, db3, self._mb3, self._vb3)

    # ── Adam helpers ──────────────────────────────────────────────────────────

    def _init_moments(self) -> None:
        def mx(m: Matrix) -> Matrix:
            return [[0.0] * len(m[0]) for _ in m]

        self._mW1: Matrix = mx(self.W1); self._vW1: Matrix = mx(self.W1)
        self._mW2: Matrix = mx(self.W2); self._vW2: Matrix = mx(self.W2)
        self._mW3: Matrix = mx(self.W3); self._vW3: Matrix = mx(self.W3)
        self._mb1 = _zeros(12); self._vb1 = _zeros(12)
        self._mb2 = _zeros(6);  self._vb2 = _zeros(6)
        self._mb3 = _zeros(3);  self._vb3 = _zeros(3)
        self._moments_ready = True

    def _adam_matrix(self, W: Matrix, dW: Matrix, mW: Matrix, vW: Matrix) -> None:
        bc1 = 1 - self.beta1 ** self.t
        bc2 = 1 - self.beta2 ** self.t
        for i, row in enumerate(W):
            for j in range(len(row)):
                mW[i][j] = self.beta1 * mW[i][j] + (1 - self.beta1) * dW[i][j]
                vW[i][j] = self.beta2 * vW[i][j] + (1 - self.beta2) * dW[i][j] ** 2
                W[i][j] -= self.lr * (mW[i][j] / bc1) / (math.sqrt(vW[i][j] / bc2) + self.eps)

    def _adam_bias(self, b: List[float], db: List[float],
                   mb: List[float], vb: List[float]) -> None:
        bc1 = 1 - self.beta1 ** self.t
        bc2 = 1 - self.beta2 ** self.t
        for i in range(len(b)):
            mb[i] = self.beta1 * mb[i] + (1 - self.beta1) * db[i]
            vb[i] = self.beta2 * vb[i] + (1 - self.beta2) * db[i] ** 2
            b[i] -= self.lr * (mb[i] / bc1) / (math.sqrt(vb[i] / bc2) + self.eps)

    def set_learning_rate(self, lr: float) -> None:
        self.lr = lr


# ─── RNN ──────────────────────────────────────────────────────────────────────
# Elman RNN: 7-input / 20-hidden (tanh) / 3-output (softmax), SEQ_LEN=10
# Truncated BPTT + Adam

class RNN:
    INPUT_SIZE  = 7
    HIDDEN_SIZE = 20
    OUTPUT_SIZE = 3
    SEQ_LEN     = 10

    def __init__(self, learning_rate: float = 0.001) -> None:
        self.lr    = learning_rate
        self.beta1 = 0.9
        self.beta2 = 0.999
        self.eps   = 1e-8
        self.t     = 0

        H, I, O = self.HIDDEN_SIZE, self.INPUT_SIZE, self.OUTPUT_SIZE
        self.Wx = _xavier(H, I)   # input → hidden
        self.Wh = _xavier(H, H)   # hidden → hidden
        self.bh = _zeros(H)
        self.Wy = _xavier(O, H)   # hidden → output
        self.by = _zeros(O)

        self._moments_ready = False

    # ── Forward ──────────────────────────────────────────────────────────────

    def _forward_full(self, sequence: List[List[float]]):
        H = self.HIDDEN_SIZE
        T = len(sequence)
        hidden_states = [_zeros(H)]   # h_0 = zeros
        raw_h: List[List[float]] = []

        for t in range(T):
            x     = sequence[t]
            h_prev = hidden_states[t]
            z = [
                sum(self.Wx[i][j] * x[j] for j in range(self.INPUT_SIZE))
                + sum(self.Wh[i][j] * h_prev[j] for j in range(H))
                + self.bh[i]
                for i in range(H)
            ]
            raw_h.append(z)
            hidden_states.append([_tanh(v) for v in z])

        h_T    = hidden_states[T]
        logits = [
            sum(self.Wy[i][j] * h_T[j] for j in range(H)) + self.by[i]
            for i in range(self.OUTPUT_SIZE)
        ]
        probs = _softmax(logits)
        return probs, hidden_states, raw_h

    def forward(self, sequence: List[List[float]]) -> List[float]:
        probs, _, _ = self._forward_full(sequence)
        return probs

    # ── BPTT training ─────────────────────────────────────────────────────────

    def train(self, sequence: List[List[float]], label: int) -> None:
        T = len(sequence)
        probs, hidden_states, raw_h = self._forward_full(sequence)

        H, O = self.HIDDEN_SIZE, self.OUTPUT_SIZE

        # Output gradient
        d_logits = [probs[i] - (1.0 if i == label else 0.0) for i in range(O)]

        # Wy, by gradients
        h_T = hidden_states[T]
        dWy = [[d_logits[i] * h_T[j] for j in range(H)] for i in range(O)]
        dby = list(d_logits)

        # Gradient into h_T
        dH_next = [
            sum(self.Wy[i][j] * d_logits[i] for i in range(O))
            for j in range(H)
        ]

        # Accumulate recurrent gradients
        dWx = _zeros_matrix(H, self.INPUT_SIZE)
        dWh = _zeros_matrix(H, H)
        dbh = _zeros(H)
        dH  = dH_next

        for t in range(T - 1, -1, -1):
            # dH through tanh
            dZ = [dH[i] * _tanh_deriv(hidden_states[t + 1][i]) for i in range(H)]

            for i in range(H):
                for j in range(self.INPUT_SIZE):
                    dWx[i][j] += dZ[i] * sequence[t][j]
                for j in range(H):
                    dWh[i][j] += dZ[i] * hidden_states[t][j]
                dbh[i] += dZ[i]

            # Propagate to previous hidden state
            dH = [
                sum(self.Wh[i][j] * dZ[i] for i in range(H))
                for j in range(H)
            ]

        # Adam update
        self.t += 1
        if not self._moments_ready:
            self._init_moments()

        self._adam_matrix(self.Wx, dWx, self._mWx, self._vWx)
        self._adam_matrix(self.Wh, dWh, self._mWh, self._vWh)
        self._adam_matrix(self.Wy, dWy, self._mWy, self._vWy)
        self._adam_bias(self.bh, dbh, self._mbh, self._vbh)
        self._adam_bias(self.by, dby, self._mby, self._vby)

    # ── Adam helpers ──────────────────────────────────────────────────────────

    def _init_moments(self) -> None:
        def mx(m: Matrix) -> Matrix:
            return [[0.0] * len(m[0]) for _ in m]

        self._mWx: Matrix = mx(self.Wx); self._vWx: Matrix = mx(self.Wx)
        self._mWh: Matrix = mx(self.Wh); self._vWh: Matrix = mx(self.Wh)
        self._mWy: Matrix = mx(self.Wy); self._vWy: Matrix = mx(self.Wy)
        self._mbh = _zeros(self.HIDDEN_SIZE); self._vbh = _zeros(self.HIDDEN_SIZE)
        self._mby = _zeros(self.OUTPUT_SIZE); self._vby = _zeros(self.OUTPUT_SIZE)
        self._moments_ready = True

    def _adam_matrix(self, W: Matrix, dW: Matrix, mW: Matrix, vW: Matrix) -> None:
        bc1 = 1 - self.beta1 ** self.t
        bc2 = 1 - self.beta2 ** self.t
        for i, row in enumerate(W):
            for j in range(len(row)):
                mW[i][j] = self.beta1 * mW[i][j] + (1 - self.beta1) * dW[i][j]
                vW[i][j] = self.beta2 * vW[i][j] + (1 - self.beta2) * dW[i][j] ** 2
                W[i][j] -= self.lr * (mW[i][j] / bc1) / (math.sqrt(vW[i][j] / bc2) + self.eps)

    def _adam_bias(self, b: List[float], db: List[float],
                   mb: List[float], vb: List[float]) -> None:
        bc1 = 1 - self.beta1 ** self.t
        bc2 = 1 - self.beta2 ** self.t
        for i in range(len(b)):
            mb[i] = self.beta1 * mb[i] + (1 - self.beta1) * db[i]
            vb[i] = self.beta2 * vb[i] + (1 - self.beta2) * db[i] ** 2
            b[i] -= self.lr * (mb[i] / bc1) / (math.sqrt(vb[i] / bc2) + self.eps)

    def set_learning_rate(self, lr: float) -> None:
        self.lr = lr


# ─── In-memory storage stub ───────────────────────────────────────────────────

class _Storage:
    """Minimal in-memory stand-in for the Express/Drizzle storage layer."""

    def __init__(self) -> None:
        self._stocks: Dict[int, Stock] = {}
        self._history: List[TradeRecord] = []

    def add_stock(self, stock: Stock) -> None:
        self._stocks[stock.id] = stock

    def get_stock(self, stock_id: int) -> Optional[Stock]:
        return self._stocks.get(stock_id)

    def get_trading_history_by_user_id(self, user_id: int) -> List[TradeRecord]:
        return [r for r in self._history if r.user_id == user_id]

    def create_trading_history(self, record: TradeRecord) -> None:
        self._history.append(record)


storage = _Storage()


# ─── TradingBot ───────────────────────────────────────────────────────────────

class TradingBot:
    _instance: Optional["TradingBot"] = None

    def __init__(self) -> None:
        self._bot_active       = True
        self._strategy: TradingStrategy = "ANN"
        self._historical_data: Dict[int, List[StockPriceHistory]] = {}
        self._learning_rate    = 0.001

        self.ann = ANN(self._learning_rate)
        self.rnn = RNN(self._learning_rate)
        print("Trading bot initialised with ANN + RNN models")

        self._initialize_historical_data()
        self._pre_train_ann()
        self._pre_train_rnn()

    @classmethod
    def get_instance(cls) -> "TradingBot":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Public API ────────────────────────────────────────────────────────────

    def is_bot_active(self) -> bool:
        return self._bot_active

    def toggle_bot_status(self) -> bool:
        self._bot_active = not self._bot_active
        return self._bot_active

    def set_strategy(self, strategy: TradingStrategy) -> None:
        self._strategy = strategy
        print(f"Strategy set to {strategy}")

    def update_learning_parameters(self, learning_rate: Optional[float] = None) -> None:
        if learning_rate is not None:
            self._learning_rate = max(0.0001, min(0.05, learning_rate))
            self.ann.set_learning_rate(self._learning_rate)
            self.rnn.set_learning_rate(self._learning_rate)
        print(f"ANN + RNN learning rate set to {self._learning_rate}")

    def get_performance_metrics(self) -> BotPerformanceMetrics:
        history = storage.get_trading_history_by_user_id(1)
        successful = [t for t in history if (t.profit_loss or 0) > 0]
        failed     = [t for t in history if (t.profit_loss or 0) <= 0]
        total_pnl  = sum((t.profit_loss or 0) for t in history)

        return BotPerformanceMetrics(
            total_return=total_pnl,
            total_return_percentage=self._calc_return_pct(total_pnl, history),
            win_rate=(len(successful) / len(history) * 100) if history else 0.0,
            total_trades=len(history),
            successful_trades=len(successful),
            failed_trades=len(failed),
            average_holding_period=5.0,
            performance_timeline=self._generate_performance_timeline(),
        )

    def generate_trading_decision(self, stock_id: int) -> TradingDecision:
        stock = storage.get_stock(stock_id)
        if not stock:
            return TradingDecision("HOLD", 0, "Stock not found", [])

        price_history = self.get_historical_price_data(stock_id)

        dispatch = {
            "MOVING_AVERAGE": self._moving_average_strategy,
            "RSI":            self._rsi_strategy,
            "MACD":           self._macd_strategy,
            "BOLLINGER":      self._bollinger_bands_strategy,
            "RNN":            self._rnn_strategy,
            "ANN":            self._ann_strategy,
        }
        fn = dispatch.get(self._strategy, self._ann_strategy)
        return fn(stock, price_history)

    def generate_signal_for_stock(self, stock_id: int) -> TradingSignal:
        return self.generate_trading_decision(stock_id).signal

    def execute_trade(
        self,
        user_id: int, stock_id: int,
        action: TradingSignal, quantity: int
    ) -> bool:
        if not self._bot_active:
            return False
        stock = storage.get_stock(stock_id)
        if not stock:
            return False

        profit_loss = quantity * stock.current_price * 0.03 if action == "SELL" else None
        storage.create_trading_history(TradeRecord(
            user_id=user_id, stock_id=stock_id, action=action,
            quantity=quantity, price=stock.current_price,
            profit_loss=profit_loss,
        ))
        self._online_train(stock_id, action)
        print(f"Executed {action} x{quantity} of {stock.symbol}")
        return True

    def get_historical_price_data(self, stock_id: int) -> List[StockPriceHistory]:
        return self._historical_data.get(stock_id, [])

    # ── ANN Strategy ──────────────────────────────────────────────────────────

    def _ann_strategy(self, stock: Stock, price_history: List[StockPriceHistory]) -> TradingDecision:
        if len(price_history) < 50:
            return TradingDecision("HOLD", 50, "Insufficient historical data for ANN strategy", ["ANN"])

        inp   = self._build_feature_vector(price_history)
        probs = self.ann.forward(inp)

        labels: List[TradingSignal] = ["BUY", "SELL", "HOLD"]
        best   = probs.index(max(probs))
        signal = labels[best]
        conf   = round(min(97.0, probs[best] * 100 + 10))

        closes    = [d.close for d in price_history]
        rsi       = self._calculate_rsi(closes, 14)
        sma10     = self._calculate_sma(closes, 10)
        sma50     = self._calculate_sma(closes, 50)
        rsi_lbl   = "oversold" if rsi < 35 else "overbought" if rsi > 65 else "neutral"
        trend_lbl = "bullish" if sma10 > sma50 else "bearish"

        return TradingDecision(
            signal=signal,
            confidence=conf,
            reason=(
                f"ANN model: {trend_lbl} trend, RSI {rsi_lbl} ({rsi:.1f}). "
                f"Network confidence: BUY {probs[0]*100:.1f}% / "
                f"SELL {probs[1]*100:.1f}% / HOLD {probs[2]*100:.1f}%"
            ),
            indicators_used=["ANN", "RSI", "SMA", "Bollinger Bands", "MACD", "Volatility", "Volume"],
        )

    # ── RNN Strategy ──────────────────────────────────────────────────────────

    def _rnn_strategy(self, stock: Stock, price_history: List[StockPriceHistory]) -> TradingDecision:
        seq_len = RNN.SEQ_LEN
        if len(price_history) < 50 + seq_len:
            return TradingDecision("HOLD", 50, "Insufficient historical data for RNN strategy", ["RNN"])

        total = len(price_history)
        sequence = [
            self._build_feature_vector(price_history[:total - (seq_len - 1 - step)])
            for step in range(seq_len)
        ]

        probs  = self.rnn.forward(sequence)
        labels: List[TradingSignal] = ["BUY", "SELL", "HOLD"]
        best   = probs.index(max(probs))
        signal = labels[best]

        ann_inp   = self._build_feature_vector(price_history)
        ann_probs = self.ann.forward(ann_inp)
        ann_best  = ann_probs.index(max(ann_probs))
        agreement = ann_best == best

        base_conf  = round(min(95.0, probs[best] * 100 + 10))
        confidence = min(97.0, base_conf + 5) if agreement else base_conf

        recent   = [sequence[-3 + i][5] for i in range(3)]
        momentum = (
            "sustained upward momentum"   if all(r > 0.5 for r in recent) else
            "sustained downward momentum" if all(r < 0.5 for r in recent) else
            "mixed momentum"
        )

        closes    = [d.close for d in price_history]
        rsi       = self._calculate_rsi(closes, 14)
        rsi_lbl   = "oversold" if rsi < 35 else "overbought" if rsi > 65 else "neutral"

        return TradingDecision(
            signal=signal,
            confidence=confidence,
            reason=(
                f"RNN model ({seq_len}-day sequence): {momentum}, RSI {rsi_lbl} ({rsi:.1f}). "
                f"Sequence confidence: BUY {probs[0]*100:.1f}% / "
                f"SELL {probs[1]*100:.1f}% / HOLD {probs[2]*100:.1f}%. "
                f"ANN cross-check: {'agrees' if agreement else 'disagrees'}."
            ),
            indicators_used=["RNN", "RSI", "SMA", "Bollinger Bands", "MACD", "Volatility", "Volume", "Sequence"],
        )

    # ── Feature builder ───────────────────────────────────────────────────────

    def _build_feature_vector(self, price_history: List[StockPriceHistory]) -> List[float]:
        closes  = [d.close  for d in price_history]
        volumes = [d.volume for d in price_history]

        rsi = self._calculate_rsi(closes, 14)
        f0  = _normalise(rsi, 0, 100)

        sma10 = self._calculate_sma(closes, 10)
        sma50 = self._calculate_sma(closes, 50)
        f1    = _normalise(sma10 / sma50 if sma50 else 1, 0.85, 1.15)

        bb    = self._calculate_bollinger_bands(closes, 20, 2)
        cur_p = closes[-1]
        f2    = _normalise(cur_p, bb["lower"], bb["upper"])

        macd = self._calculate_macd(closes)
        f3   = _normalise(macd["histogram"], -cur_p * 0.02, cur_p * 0.02)

        vol = self._calculate_volatility(closes, 14)
        f4  = _normalise(vol, 0, 0.06)

        ret5 = ((closes[-1] / closes[-6]) - 1) if len(closes) >= 6 else 0.0
        f5   = _normalise(ret5, -0.05, 0.05)

        last_vol = volumes[-1]
        avg_vol  = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else (sum(volumes) / len(volumes) or 1)
        f6       = _normalise(last_vol / (avg_vol or 1), 0, 3)

        return [f0, f1, f2, f3, f4, f5, f6]

    # ── Online learning ───────────────────────────────────────────────────────

    def _online_train(self, stock_id: int, action: TradingSignal) -> None:
        hist  = self.get_historical_price_data(stock_id)
        label = {"BUY": 0, "SELL": 1, "HOLD": 2}[action]

        if len(hist) >= 50:
            self.ann.train(self._build_feature_vector(hist), label)

        seq_len = RNN.SEQ_LEN
        if len(hist) >= 50 + seq_len:
            total    = len(hist)
            sequence = [
                self._build_feature_vector(hist[:total - (seq_len - 1 - step)])
                for step in range(seq_len)
            ]
            self.rnn.train(sequence, label)

    # ── Pre-training ──────────────────────────────────────────────────────────

    def _pre_train_ann(self) -> None:
        for _ in range(500):
            rsi01 = random.random()
            rsi   = rsi01 * 100
            label = 0 if rsi < 35 else (1 if rsi > 65 else 2)

            trend  = (0.4 + random.random() * 0.1) if rsi < 50 else (0.55 + random.random() * 0.1)
            pct_b  = (random.random() * 0.2) if rsi < 35 else ((0.8 + random.random() * 0.2) if rsi > 65 else (0.3 + random.random() * 0.4))
            macd01 = (0.3 + random.random() * 0.2) if rsi < 50 else (0.55 + random.random() * 0.2)
            vol01  = 0.2 + random.random() * 0.6
            ret01  = (0.3 + random.random() * 0.2) if rsi < 50 else (0.55 + random.random() * 0.2)
            vol_r  = 0.2 + random.random() * 0.6

            self.ann.train([rsi01, trend, pct_b, macd01, vol01, ret01, vol_r], label)
        print("ANN pre-training complete (500 synthetic epochs)")

    def _pre_train_rnn(self) -> None:
        seq_len = RNN.SEQ_LEN
        for _ in range(500):
            final_rsi = random.random() * 100
            label     = 0 if final_rsi < 35 else (1 if final_rsi > 65 else 2)
            start_rsi = 45 + (random.random() * 10 - 5)
            sequence: List[List[float]] = []

            for t in range(seq_len):
                alpha = t / (seq_len - 1)
                rsi   = start_rsi + alpha * (final_rsi - start_rsi)
                rsi01 = _normalise(rsi, 0, 100)
                noise = lambda: (random.random() - 0.5) * 0.05

                trend  = (0.4 + alpha * 0.1 + noise()) if rsi < 50 else (0.55 + alpha * 0.1 + noise())
                pct_b  = rsi01 + (random.random() - 0.5) * 0.1
                macd01 = (0.35 + alpha * 0.15 + noise()) if rsi < 50 else (0.55 + alpha * 0.1 + noise())
                vol01  = 0.2 + random.random() * 0.6
                ret01  = (0.35 + alpha * 0.1 + noise()) if rsi < 50 else (0.55 + alpha * 0.1 + noise())
                vol_r  = 0.2 + random.random() * 0.6

                sequence.append([
                    min(1.0, max(0.0, v))
                    for v in [rsi01, trend, pct_b, macd01, vol01, ret01, vol_r]
                ])

            self.rnn.train(sequence, label)
        print("RNN pre-training complete (500 synthetic sequence epochs)")

    # ── Technical indicator strategies ───────────────────────────────────────

    def _moving_average_strategy(self, stock: Stock, price_history: List[StockPriceHistory]) -> TradingDecision:
        if len(price_history) < 50:
            return TradingDecision("HOLD", 50, "Insufficient data for MA strategy", ["SMA"])

        closes = [d.close for d in price_history]
        sma10  = self._calculate_sma(closes, 10)
        sma50  = self._calculate_sma(closes, 50)
        p10    = self._calculate_sma(closes[:-1], 10)
        p50    = self._calculate_sma(closes[:-1], 50)

        if p10 <= p50 and sma10 > sma50:
            return TradingDecision("BUY",  75, "Short-term MA crossed above long-term MA", ["SMA10", "SMA50"])
        if p10 >= p50 and sma10 < sma50:
            return TradingDecision("SELL", 75, "Short-term MA crossed below long-term MA", ["SMA10", "SMA50"])

        strength = abs(sma10 - sma50) / sma50 * 100
        direction = "upward" if sma10 > sma50 else "downward"
        return TradingDecision("HOLD", 50 + strength * (1 if sma10 > sma50 else -1),
                               f"Trending {direction} but no crossover", ["SMA10", "SMA50"])

    def _rsi_strategy(self, stock: Stock, price_history: List[StockPriceHistory]) -> TradingDecision:
        if len(price_history) < 15:
            return TradingDecision("HOLD", 50, "Insufficient data for RSI", ["RSI"])

        rsi = self._calculate_rsi([d.close for d in price_history], 14)
        if rsi < 30:
            return TradingDecision("BUY",  max(70.0, 100 - rsi), f"RSI oversold at {rsi:.2f}", ["RSI"])
        if rsi > 70:
            return TradingDecision("SELL", max(70.0, rsi),       f"RSI overbought at {rsi:.2f}", ["RSI"])
        return TradingDecision("HOLD", 50 + abs(rsi - 50), f"RSI neutral at {rsi:.2f}", ["RSI"])

    def _macd_strategy(self, stock: Stock, price_history: List[StockPriceHistory]) -> TradingDecision:
        if len(price_history) < 35:
            return TradingDecision("HOLD", 50, "Insufficient data for MACD", ["MACD"])

        closes = [d.close for d in price_history]
        macd   = self._calculate_macd(closes)
        prev_h = self._calculate_macd(closes[:-1])["histogram"]

        if prev_h <= 0 and macd["histogram"] > 0:
            return TradingDecision("BUY",  80, "MACD bullish crossover", ["MACD"])
        if prev_h >= 0 and macd["histogram"] < 0:
            return TradingDecision("SELL", 80, "MACD bearish crossover", ["MACD"])

        sig = macd["signal_line"] or 1
        strength = min(10.0, abs(macd["histogram"] / sig) * 100)
        direction = "bullish" if macd["histogram"] > 0 else "bearish"
        return TradingDecision("HOLD", 50 + strength * (1 if macd["histogram"] > 0 else -1),
                               f"MACD {direction} but no crossover", ["MACD"])

    def _bollinger_bands_strategy(self, stock: Stock, price_history: List[StockPriceHistory]) -> TradingDecision:
        if len(price_history) < 20:
            return TradingDecision("HOLD", 50, "Insufficient data for Bollinger Bands", ["Bollinger Bands"])

        closes = [d.close for d in price_history]
        cur    = closes[-1]
        bb     = self._calculate_bollinger_bands(closes, 20, 2)
        pct_b  = (cur - bb["lower"]) / (bb["upper"] - bb["lower"])

        if cur < bb["lower"]:
            return TradingDecision("BUY",  min(90.0, 70 + (bb["lower"] - cur) / bb["lower"] * 100),
                                   "Price below lower Bollinger Band (oversold)", ["Bollinger Bands"])
        if cur > bb["upper"]:
            return TradingDecision("SELL", min(90.0, 70 + (cur - bb["upper"]) / bb["upper"] * 100),
                                   "Price above upper Bollinger Band (overbought)", ["Bollinger Bands"])

        reason = "Near upper band" if pct_b > 0.8 else ("Near lower band" if pct_b < 0.2 else "Within normal range")
        return TradingDecision("HOLD", 50, reason, ["Bollinger Bands"])

    # ── Math helpers ──────────────────────────────────────────────────────────

    def _calculate_sma(self, prices: List[float], period: int) -> float:
        if len(prices) < period:
            return prices[-1] if prices else 0.0
        sl = prices[-period:]
        return sum(sl) / period

    def _calculate_ema(self, prices: List[float], period: int) -> float:
        if len(prices) < period:
            return self._calculate_sma(prices, len(prices))
        m   = 2 / (period + 1)
        ema = self._calculate_sma(prices[:period], period)
        for p in prices[period:]:
            ema = (p - ema) * m + ema
        return ema

    def _calculate_rsi(self, prices: List[float], period: int) -> float:
        if len(prices) <= period:
            return 50.0
        g = l = 0.0
        for i in range(1, period + 1):
            d = prices[i] - prices[i - 1]
            if d >= 0: g += d
            else:      l -= d
        ag, al = g / period, l / period
        for i in range(period + 1, len(prices)):
            d  = prices[i] - prices[i - 1]
            ag = (ag * (period - 1) + max(0,  d)) / period
            al = (al * (period - 1) + max(0, -d)) / period
        return 100.0 if al == 0 else 100 - 100 / (1 + ag / al)

    def _calculate_macd(self, prices: List[float]) -> dict:
        if len(prices) < 26:
            return {"macd_line": 0.0, "signal_line": 0.0, "histogram": 0.0}
        macd_line  = self._calculate_ema(prices, 12) - self._calculate_ema(prices, 26)
        macd_arr   = [
            self._calculate_ema(prices[:len(prices) - (8 - k)], 12)
            - self._calculate_ema(prices[:len(prices) - (8 - k)], 26)
            for k in range(9)
        ]
        signal_line = self._calculate_ema(macd_arr, min(9, len(macd_arr)))
        return {
            "macd_line":   macd_line,
            "signal_line": signal_line,
            "histogram":   macd_line - signal_line,
        }

    def _calculate_bollinger_bands(self, prices: List[float], period: int, k: float) -> dict:
        if len(prices) < period:
            avg = sum(prices) / len(prices)
            return {"upper": avg * 1.1, "middle": avg, "lower": avg * 0.9}
        mid = self._calculate_sma(prices, period)
        rec = prices[-period:]
        sd  = math.sqrt(sum((p - mid) ** 2 for p in rec) / period)
        return {"upper": mid + k * sd, "middle": mid, "lower": mid - k * sd}

    def _calculate_volatility(self, prices: List[float], period: int) -> float:
        if len(prices) < period + 1:
            return 0.02
        window = prices[-(period + 1):]
        rets   = [(window[i] / window[i - 1]) - 1 for i in range(1, len(window))]
        mean   = sum(rets) / len(rets)
        return math.sqrt(sum((r - mean) ** 2 for r in rets) / len(rets))

    # ── Data / utility helpers ────────────────────────────────────────────────

    def _calc_return_pct(self, pnl: float, history: List[TradeRecord]) -> float:
        invested = sum(t.price * t.quantity for t in history if t.action == "BUY")
        return 0.0 if invested == 0 else (pnl / invested) * 100

    def _generate_performance_timeline(self) -> List[PerformanceTimepoint]:
        from datetime import date, timedelta
        tl   = []
        v    = 1_000_000.0
        base = date.today()
        for i in range(30, -1, -1):
            d   = base - timedelta(days=i)
            chg = v * ((random.random() * 3.5 - 1.5) / 100)
            v  += chg
            tl.append(PerformanceTimepoint(
                date=d.isoformat(),
                value=round(v, 2),
                change=round(chg, 2),
            ))
        return tl

    def _initialize_historical_data(self) -> None:
        configs = [
            (1, 3400, 0.015,  0.0005),   # TCS
            (2, 2400, 0.02,   0.0007),   # Reliance
            (3, 1680, 0.018, -0.0002),   # HDFC Bank
            (4, 1450, 0.022,  0.001 ),   # Infosys
            (5,  920, 0.016,  0.0004),   # ICICI Bank
            (6,  120, 0.025,  0.0003),   # Tata Steel
        ]
        for stock_id, base, vol, trend in configs:
            self._generate_historical_data(stock_id, 180, base, vol, trend)

    def _generate_historical_data(
        self, stock_id: int, days: int,
        base_price: float, volatility: float, trend: float
    ) -> None:
        from datetime import date, timedelta
        history: List[StockPriceHistory] = []
        cur  = base_price
        base = date.today()

        for i in range(days, -1, -1):
            d = base - timedelta(days=i)
            if d.weekday() >= 5:   # skip Sat/Sun
                continue
            cur  = max(base_price * 0.5,
                       cur * (1 + (random.random() * 2 - 1) * volatility + trend))
            dv   = volatility * 0.7
            op   = cur * (1 + (random.random() * 0.01 - 0.005))
            high = max(op, cur) * (1 + random.random() * dv)
            low  = min(op, cur) * (1 - random.random() * dv)
            vol  = int(base_price * 1000 * (0.5 + random.random()))

            history.append(StockPriceHistory(
                date=d.isoformat(),
                open=round(op,   2),
                high=round(high, 2),
                low=round(low,   2),
                close=round(cur, 2),
                volume=vol,
            ))

        self._historical_data[stock_id] = history


# ─── Singleton export ─────────────────────────────────────────────────────────

trading_bot = TradingBot.get_instance()

# Seed default stocks so the bot has data immediately
_DEFAULT_STOCKS = [
    Stock(id=1, symbol="TCS",       current_price=3400.0),
    Stock(id=2, symbol="RELIANCE",  current_price=2400.0),
    Stock(id=3, symbol="HDFCBANK",  current_price=1680.0),
    Stock(id=4, symbol="INFY",      current_price=1450.0),
    Stock(id=5, symbol="ICICIBANK", current_price=920.0),
    Stock(id=6, symbol="TATASTEEL", current_price=120.0),
]
for _s in _DEFAULT_STOCKS:
    storage.add_stock(_s)


# ─── FastAPI server ───────────────────────────────────────────────────────────

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn

    app = FastAPI(title="Bull Maharaj — Python Model Server")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],   # tighten in production
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request / Response models ─────────────────────────────────────────────

    class StrategyRequest(BaseModel):
        strategy: str

    class LearningRateRequest(BaseModel):
        learning_rate: float

    class ExecuteTradeRequest(BaseModel):
        user_id:  int
        stock_id: int
        action:   str
        quantity: int

    class StockRequest(BaseModel):
        id:            int
        symbol:        str
        current_price: float

    # ── Endpoints ─────────────────────────────────────────────────────────────

    @app.get("/health")
    def health():
        return {"status": "ok", "model": "ANN+RNN", "active": trading_bot.is_bot_active()}


    @app.get("/bot/status")
    def bot_status():
        return {"active": trading_bot.is_bot_active()}


    @app.post("/bot/toggle")
    def toggle_bot():
        return {"active": trading_bot.toggle_bot_status()}


    @app.post("/bot/strategy")
    def set_strategy(req: StrategyRequest):
        valid = {"MOVING_AVERAGE", "RSI", "MACD", "BOLLINGER", "ANN", "RNN"}
        if req.strategy not in valid:
            raise HTTPException(400, f"Invalid strategy. Choose from {valid}")
        trading_bot.set_strategy(req.strategy)   # type: ignore[arg-type]
        return {"strategy": req.strategy}


    @app.post("/bot/learning-rate")
    def set_learning_rate(req: LearningRateRequest):
        trading_bot.update_learning_parameters(req.learning_rate)
        return {"learning_rate": req.learning_rate}


    @app.get("/bot/performance")
    def performance():
        m = trading_bot.get_performance_metrics()
        return {
            "totalReturn":            m.total_return,
            "totalReturnPercentage":  m.total_return_percentage,
            "winRate":                m.win_rate,
            "totalTrades":            m.total_trades,
            "successfulTrades":       m.successful_trades,
            "failedTrades":           m.failed_trades,
            "averageHoldingPeriod":   m.average_holding_period,
            "performanceTimeline": [
                {"date": p.date, "value": p.value, "change": p.change}
                for p in m.performance_timeline
            ],
        }


    @app.get("/bot/decision/{stock_id}")
    def trading_decision(stock_id: int):
        d = trading_bot.generate_trading_decision(stock_id)
        return {
            "signal":         d.signal,
            "confidence":     d.confidence,
            "reason":         d.reason,
            "indicatorsUsed": d.indicators_used,
        }


    @app.get("/bot/signal/{stock_id}")
    def trading_signal(stock_id: int):
        return {"signal": trading_bot.generate_signal_for_stock(stock_id)}


    @app.post("/bot/trade")
    def execute_trade(req: ExecuteTradeRequest):
        valid_actions = {"BUY", "SELL", "HOLD"}
        if req.action not in valid_actions:
            raise HTTPException(400, f"action must be one of {valid_actions}")
        ok = trading_bot.execute_trade(req.user_id, req.stock_id, req.action, req.quantity)  # type: ignore[arg-type]
        return {"success": ok}


    @app.get("/stock/{stock_id}/history")
    def price_history(stock_id: int):
        hist = trading_bot.get_historical_price_data(stock_id)
        return [
            {"date": h.date, "open": h.open, "high": h.high,
             "low": h.low, "close": h.close, "volume": h.volume}
            for h in hist
        ]


    @app.post("/stock")
    def add_stock(req: StockRequest):
        storage.add_stock(Stock(id=req.id, symbol=req.symbol, current_price=req.current_price))
        return {"added": req.symbol}


    if __name__ == "__main__":
        uvicorn.run("trading_bot:app", host="0.0.0.0", port=8000, reload=False)

except ImportError:
    # FastAPI not installed — fall back to smoke-test
    print("FastAPI not found. Run:  pip install fastapi uvicorn")
    print("Running smoke-test instead...\n")
    bot = TradingBot.get_instance()
    for strategy in ("ANN", "RNN", "RSI", "MACD", "MOVING_AVERAGE", "BOLLINGER"):
        bot.set_strategy(strategy)  # type: ignore[arg-type]
        dec = bot.generate_trading_decision(1)
        print(f"[{strategy:>14}]  {dec.signal:<4}  conf={dec.confidence}%  |  {dec.reason[:80]}")