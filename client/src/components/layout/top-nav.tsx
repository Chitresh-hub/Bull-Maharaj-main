import { Bell, Wifi } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

interface TopNavProps {
  onMobileMenuToggle: () => void;
  mobileMenuOpen: boolean;
}

interface MarketOverviewData {
  indices: {
    SENSEX: { name: string; value: number; change: number; changePercent: number };
    NIFTY:  { name: string; value: number; change: number; changePercent: number };
    BANKNIFTY: { name: string; value: number; change: number; changePercent: number };
    INR_USD: { name: string; value: number; change: number; changePercent: number };
  };
}

function TickerItem({ name, value, change, changePercent }: {
  name: string; value: number; change: number; changePercent: number;
}) {
  const up = changePercent >= 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "0 18px",
      borderRight: "1px solid var(--border)",
    }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 600,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>{name}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13, fontWeight: 600,
        color: "var(--text-primary)",
      }}>
        {value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, fontWeight: 600,
        color: up ? "var(--accent-green)" : "var(--accent-red)",
      }}>
        {up ? "▲" : "▼"} {Math.abs(changePercent).toFixed(2)}%
      </span>
    </div>
  );
}

export default function TopNav({ onMobileMenuToggle, mobileMenuOpen }: TopNavProps) {
  const { data, isLoading } = useQuery<MarketOverviewData>({
    queryKey: ['/api/market/overview'],
  });

  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div style={{
      background: "var(--bg-secondary)",
      borderBottom: "1px solid var(--border)",
      height: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 0 0 0",
      flexShrink: 0,
      zIndex: 20,
    }}>
      {/* Left - mobile toggle */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div className="md:hidden" style={{ padding: "0 12px" }}>
          <Button variant="ghost" size="icon" onClick={onMobileMenuToggle} style={{ color: "var(--text-muted)" }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </Button>
        </div>

        {/* Ticker row */}
        {!isLoading && data && (
          <div style={{ display: "flex", alignItems: "center", height: 50 }}>
            <TickerItem {...data.indices.SENSEX} />
            <TickerItem {...data.indices.NIFTY} />
            <TickerItem {...data.indices.BANKNIFTY} />
            <TickerItem {...data.indices.INR_USD} />
          </div>
        )}
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 16px" }}>
        {/* Live clock */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: "var(--text-muted)",
          padding: "4px 10px",
          border: "1px solid var(--border)",
          borderRadius: 3,
          marginRight: 8,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Wifi size={10} color="var(--accent-green)" />
          NSE · IST
        </div>

        <Button variant="ghost" size="icon" style={{ color: "var(--text-muted)", position: "relative" }}>
          <Bell size={15} />
          <span style={{
            position: "absolute", top: 6, right: 6,
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--accent-red)",
          }} />
        </Button>

        <Avatar style={{ width: 28, height: 28, border: "1px solid var(--border)" }}>
          <AvatarFallback style={{
            background: "var(--bg-card)",
            color: "var(--accent-cyan)",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
          }}>DU</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}