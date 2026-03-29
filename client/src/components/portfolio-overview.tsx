import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart } from "@/components/charts/line-chart";
import { PieChart } from "@/components/charts/pie-chart";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Stock {
  id: number; symbol: string; name: string;
  currentPrice: number; prevClosePrice: number;
  change: number; changePercent: number; updatedAt: string;
}

interface PortfolioItem {
  id: number; userId: number; stockId: number;
  quantity: number; avgPrice: number; currentValue: number;
  profitLoss: number; profitLossPercent: number; stock: Stock;
}

const COLORS = ["#00e676","#00b0ff","#7c4dff","#ffd600","#ff3d57","#00bcd4","#ff9800","#69f0ae"];

const getRandomColor = (id: number) => COLORS[id % COLORS.length];

const generatePortfolioValueData = (totalValue: number, totalPL: number) => {
  const data = []; let value = totalValue - totalPL;
  for (let i = 30; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    const progress = 1 - i / 30;
    const cur = value + totalPL * progress;
    data.push({ x: date.toISOString().split("T")[0], y: Math.round(cur * (1 + (Math.random() * 0.02 - 0.01)) * 100) / 100 });
  }
  return data;
};

function RecommendationBadge({ pct }: { pct: number }) {
  if (pct > 5)  return <span className="signal-hold">HOLD</span>;
  if (pct > 0)  return <span className="signal-buy">BUY</span>;
  if (pct > -5) return <span className="signal-hold">HOLD</span>;
  return <span className="signal-sell">SELL</span>;
}

export default function PortfolioOverview() {
  const { data: portfolio, isLoading } = useQuery<PortfolioItem[]>({ queryKey: ['/api/portfolio'] });

  const totalValue = portfolio?.reduce((s, i) => s + i.currentValue, 0) || 0;
  const totalPL    = portfolio?.reduce((s, i) => s + i.profitLoss,   0) || 0;
  const totalPLPct = totalValue > 0 ? (totalPL / (totalValue - totalPL)) * 100 : 0;

  const allocationData = portfolio?.map(item => ({
    name: item.stock.symbol, value: item.currentValue, fill: getRandomColor(item.stockId)
  })) || [];

  return (
    <div style={{ marginTop: 28, marginBottom: 40 }}>
      <div className="section-label" style={{ marginBottom: 14 }}>Portfolio Overview</div>

      {/* Summary bar */}
      <div className="terminal-card" style={{ padding: "16px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 4 }}>TOTAL PORTFOLIO VALUE</div>
            {isLoading
              ? <Skeleton className="h-8 w-40" style={{ background: "var(--border)" }} />
              : <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                  ₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
            }
          </div>
          {!isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px",
                background: totalPL >= 0 ? "rgba(0,230,118,0.08)" : "rgba(255,61,87,0.08)",
                border: `1px solid ${totalPL >= 0 ? "rgba(0,230,118,0.25)" : "rgba(255,61,87,0.25)"}`,
                borderRadius: 4,
              }}>
                {totalPL >= 0
                  ? <TrendingUp size={16} color="var(--accent-green)" />
                  : <TrendingDown size={16} color="var(--accent-red)" />
                }
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, color: totalPL >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                    {totalPL >= 0 ? "+" : ""}₹{Math.abs(totalPL).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: totalPL >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                    {totalPL >= 0 ? "+" : ""}{totalPLPct.toFixed(2)}% All time
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="terminal-card" style={{ padding: 16 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 10 }}>PORTFOLIO VALUE — 30D</div>
          <div className="chart-container" style={{ height: 180 }}>
            {isLoading
              ? <Skeleton className="h-full w-full" style={{ background: "var(--border)" }} />
              : <LineChart data={generatePortfolioValueData(totalValue, totalPL)} xAxisKey="x" yAxisKey="y" color="var(--accent-cyan)" />
            }
          </div>
        </div>
        <div className="terminal-card" style={{ padding: 16 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 10 }}>ALLOCATION</div>
          <div style={{ height: 180 }}>
            {isLoading
              ? <Skeleton className="h-full w-full" style={{ background: "var(--border)" }} />
              : <PieChart data={allocationData} nameKey="name" valueKey="value" innerRadius={40} outerRadius={70} />
            }
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="terminal-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="section-label">Holdings</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Symbol", "Qty", "Avg Price", "LTP", "Current Value", "P&L", "P&L%", "Rec."].map(h => (
                  <th key={h} style={{ textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array(4).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(8).fill(0).map((_, j) => (
                        <td key={j}><Skeleton className="h-4 w-16" style={{ background: "var(--border)" }} /></td>
                      ))}
                    </tr>
                  ))
                : portfolio?.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{item.stock.symbol}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.stock.name.slice(0, 20)}</div>
                      </td>
                      <td style={{ color: "var(--text-primary)" }}>{item.quantity}</td>
                      <td>₹{item.avgPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td style={{ color: item.stock.changePercent >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                        ₹{item.stock.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: "var(--text-primary)" }}>₹{item.currentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td style={{ color: item.profitLoss >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                        {item.profitLoss >= 0 ? "+" : ""}₹{Math.abs(item.profitLoss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className={item.profitLossPercent >= 0 ? "stat-up" : "stat-down"}>
                          {item.profitLossPercent >= 0 ? "+" : ""}{item.profitLossPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td><RecommendationBadge pct={item.profitLossPercent} /></td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}