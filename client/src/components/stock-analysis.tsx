import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart } from "@/components/charts/line-chart";
import { RefreshCcw, Search, Brain, Target, Clock, TrendingUp } from "lucide-react";

interface Stock {
  id: number; symbol: string; name: string;
  currentPrice: number; prevClosePrice: number;
  change: number; changePercent: number; updatedAt: string;
}

interface StockPrediction {
  id: number; stockId: number; signal: string;
  confidence: number; targetPrice: number;
  expectedReturn: number; timeHorizon: string;
  createdAt: string; stock: Stock;
}

interface MarketSentiment {
  sentiment: string; sentimentScore: number;
  volatilityIndex: number; volatilityLevel: string;
  sectorStrength: number; sectorStrengthLevel: string;
  aiInsights: string; lastUpdated: string;
}

const generateChartData = (stockId: number) => {
  const data = []; let value = 100;
  for (let i = 30; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    const trend = stockId % 3 === 0 ? -0.3 : stockId % 2 === 0 ? 0 : 0.4;
    value *= 1 + (Math.random() * 3 - 1 + trend) / 100;
    data.push({ x: date.toISOString().split('T')[0], y: Math.round(value * 100) / 100 });
  }
  return data;
};

function SignalBadge({ signal }: { signal: string }) {
  if (signal.includes("BUY"))  return <span className="signal-buy">{signal.replace("_", " ")}</span>;
  if (signal.includes("SELL")) return <span className="signal-sell">{signal.replace("_", " ")}</span>;
  return <span className="signal-hold">{signal}</span>;
}

function PredictionCard({ prediction }: { prediction: StockPrediction }) {
  const up = prediction.stock.changePercent >= 0;
  const chartColor = prediction.signal.includes("BUY") ? "#00e676"
    : prediction.signal.includes("SELL") ? "#ff3d57" : "#ffd600";

  return (
    <div className="terminal-card fade-in" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {prediction.stock.symbol}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {prediction.stock.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            ₹{prediction.stock.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: up ? "var(--accent-green)" : "var(--accent-red)", marginTop: 2 }}>
            {up ? "▲" : "▼"} {Math.abs(prediction.stock.changePercent).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Signal + confidence */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <SignalBadge signal={prediction.signal} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-muted)" }}>CONFIDENCE</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--accent-cyan)", fontWeight: 600 }}>{prediction.confidence}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill-cyan" style={{ width: `${prediction.confidence}%` }} />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container" style={{ height: 130, marginBottom: 14 }}>
        <LineChart data={generateChartData(prediction.stockId)} xAxisKey="x" yAxisKey="y" color={chartColor} />
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { icon: Target, label: "TARGET", value: `₹${prediction.targetPrice.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
          { icon: TrendingUp, label: "EXP. RETURN", value: `${prediction.expectedReturn > 0 ? "+" : ""}${prediction.expectedReturn.toFixed(2)}%`, color: prediction.expectedReturn > 0 ? "var(--accent-green)" : "var(--accent-red)" },
          { icon: Clock, label: "HORIZON", value: prediction.timeHorizon },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: 3, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: color || "var(--text-primary)" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StockAnalysis() {
  const { data: predictions, isLoading: isLoadingPredictions } = useQuery<StockPrediction[]>({ queryKey: ['/api/predictions'] });
  const { data: sentiment, isLoading: isLoadingSentiment } = useQuery<MarketSentiment>({ queryKey: ['/api/market/sentiment'] });

  return (
    <div style={{ marginTop: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="section-label">Stock Analysis & ANN Predictions</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-terminal" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCcw size={11} /> Refresh
          </button>
          <button className="btn-terminal" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Search size={11} /> Search
          </button>
        </div>
      </div>

      {/* Prediction cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        {isLoadingPredictions
          ? Array(2).fill(0).map((_, i) => (
              <div key={i} className="terminal-card" style={{ padding: 20 }}>
                <Skeleton className="h-5 w-24 mb-3" style={{ background: "var(--border)" }} />
                <Skeleton className="h-4 w-40 mb-4" style={{ background: "var(--border)" }} />
                <Skeleton className="h-32 w-full" style={{ background: "var(--border)" }} />
              </div>
            ))
          : predictions?.slice(0, 2).map(p => <PredictionCard key={p.id} prediction={p} />)
        }
      </div>

      {/* Market Analysis Panel */}
      <div className="terminal-card" style={{ padding: 20 }}>
        <div className="section-label" style={{ marginBottom: 16 }}>Market Intelligence</div>

        {/* Sentiment meters */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          {isLoadingSentiment
            ? Array(3).fill(0).map((_, i) => (
                <div key={i} style={{ padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: 4 }}>
                  <Skeleton className="h-3 w-24 mb-3" style={{ background: "var(--border)" }} />
                  <Skeleton className="h-2 w-full" style={{ background: "var(--border)" }} />
                </div>
              ))
            : sentiment && [
                { label: "Market Sentiment", value: sentiment.sentimentScore, level: sentiment.sentiment, cls: "progress-fill-green" },
                { label: "Volatility Index",  value: sentiment.volatilityIndex, level: sentiment.volatilityLevel, cls: "progress-fill-yellow" },
                { label: "Sector Strength",   value: sentiment.sectorStrength,  level: sentiment.sectorStrengthLevel, cls: "progress-fill-cyan" },
              ].map(({ label, value, level, cls }) => (
                <div key={label} style={{ padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{label.toUpperCase()}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--accent-cyan)", fontWeight: 600 }}>{value}%</span>
                  </div>
                  <div className="progress-track">
                    <div className={cls} style={{ width: `${value}%` }} />
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>{level}</div>
                </div>
              ))
          }
        </div>

        {/* AI Insights */}
        <div style={{ background: "rgba(0,176,255,0.04)", border: "1px solid rgba(0,176,255,0.15)", borderRadius: 4, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Brain size={13} color="var(--accent-cyan)" />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--accent-cyan)", letterSpacing: "0.1em", fontWeight: 600 }}>ANN MARKET INSIGHTS</span>
          </div>
          {isLoadingSentiment
            ? <Skeleton className="h-16 w-full" style={{ background: "var(--border)" }} />
            : <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>{sentiment?.aiInsights}</p>
          }
        </div>
      </div>
    </div>
  );
}