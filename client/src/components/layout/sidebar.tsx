import { Link, useLocation } from "wouter";
import { ChartLine, Bot, Search, Briefcase, Newspaper, Settings, LogOut, Activity } from "lucide-react";

interface SidebarProps {
  onLogout: () => void;
}

export default function Sidebar({ onLogout }: SidebarProps) {
  const [location] = useLocation();
  const isActive = (path: string) => location === path || (path === "/dashboard" && location === "/");

  const navItems = [
    { href: "/dashboard",   icon: ChartLine,  label: "Dashboard"    },
    { href: "/trading-bot", icon: Bot,         label: "AI Bot"       },
    { href: "/analysis",    icon: Search,      label: "Analysis"     },
    { href: "/portfolio",   icon: Briefcase,   label: "Portfolio"    },
    { href: "/market",      icon: Newspaper,   label: "Market News"  },
  ];

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <div style={{
        width: 220,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}>
        {/* Logo */}
        <div style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28,
              background: "var(--accent-cyan)",
              borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Activity size={15} color="#070b14" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: 14,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}>Bull Maharaj</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>ANN Trading</div>
            </div>
          </div>
        </div>

        {/* Live status */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="pulse-dot" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--accent-green)", letterSpacing: "0.1em" }}>
              LIVE MARKET
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          <div className="section-label" style={{ padding: "0 8px", marginBottom: 8 }}>Navigation</div>
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}>
              <div className={`nav-item ${isActive(href) ? "active" : ""}`}>
                <Icon size={14} />
                {label}
              </div>
            </Link>
          ))}

          <div style={{ marginTop: 16 }}>
            <div className="section-label" style={{ padding: "0 8px", marginBottom: 8 }}>System</div>
            <div className="nav-item" style={{ cursor: "default" }}>
              <Settings size={14} />
              Settings
            </div>
          </div>
        </nav>

        {/* Logout */}
        <div style={{ padding: "14px 10px", borderTop: "1px solid var(--border)" }}>
          <div
            className="nav-item"
            onClick={onLogout}
            style={{ color: "var(--accent-red)" }}
          >
            <LogOut size={14} />
            Logout
          </div>
        </div>
      </div>
    </div>
  );
}