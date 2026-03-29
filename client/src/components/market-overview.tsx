import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

interface MarketOverviewData {
  indices: {
    SENSEX: MarketIndex;
    NIFTY: MarketIndex;
    BANKNIFTY: MarketIndex;
    INR_USD: MarketIndex;
  };
  lastUpdated: string;
}

function IndexCard({ index }: { index: MarketIndex }) {
  const up = index.changePercent >= 0;
  return (
    <div className="terminal-card fade-in" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 600,
            letterSpacing: "0.12em",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            marginBottom: 8,
          }}>{index.name}</div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 24, fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            {index.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4
        }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 4,
            background: up ? "rgba(0,230,118,0.1)" : "rgba(255,61,87,0.1)",
            border: `1px solid ${up ? "rgba(0,230,118,0.25)" : "rgba(255,61,87,0.25)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {up
              ? <TrendingUp size={15} color="var(--accent-green)" />
              : <TrendingDown size={15} color="var(--accent-red)" />}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span className={up ? "stat-up" : "stat-down"}>
          {up ? "+" : ""}{index.changePercent.toFixed(2)}%
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: up ? "var(--accent-green)" : "var(--accent-red)",
        }}>
          {up ? "+" : ""}{index.change.toFixed(2)}
        </span>
      </div>

      {/* Sparkline bar */}
      <div style={{ marginTop: 12, height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1 }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, Math.abs(index.changePercent) * 20 + 40)}%`,
          background: up ? "var(--accent-green)" : "var(--accent-red)",
          borderRadius: 1,
          boxShadow: up ? "var(--glow-green)" : "var(--glow-red)",
        }} />
      </div>
    </div>
  );
}

export default function MarketOverview() {
  const { data, isLoading, error } = useQuery<MarketOverviewData>({
    queryKey: ['/api/market/overview'],
  });

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="section-label">Market Overview</div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, color: "var(--text-muted)",
        }}>
          {data ? `Updated: ${new Date(data.lastUpdated).toLocaleTimeString("en-IN")}` : ""}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="terminal-card" style={{ padding: 20 }}>
              <Skeleton className="h-3 w-16 mb-3" style={{ background: "var(--border)" }} />
              <Skeleton className="h-7 w-28 mb-3" style={{ background: "var(--border)" }} />
              <Skeleton className="h-4 w-20" style={{ background: "var(--border)" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="terminal-card" style={{ padding: 20, color: "var(--accent-red)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          ERR: Failed to load market data
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {data && Object.values(data.indices).map((index, i) => (
            <IndexCard key={i} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}