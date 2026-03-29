import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";

interface LineChartProps {
  data: Array<{ [key: string]: any }>;
  xAxisKey: string;
  yAxisKey: string;
  color?: string;
  showGrid?: boolean;
}

const CustomTooltip = ({ active, payload, label, color }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d1526", border: "1px solid #1e3a5f",
      borderRadius: 3, padding: "8px 12px",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
    }}>
      <div style={{ color: "#7a9bc4", marginBottom: 4, fontSize: 10 }}>{label}</div>
      <div style={{ color: color || "#00b0ff", fontWeight: 600 }}>
        {payload[0].value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
};

export function LineChart({ data, xAxisKey, yAxisKey, color = "#00b0ff", showGrid = false }: LineChartProps) {
  const [chartData, setChartData] = useState(data);
  useEffect(() => { setChartData(data); }, [data]);

  if (!chartData.length) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#3d6080", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
      NO DATA
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        {showGrid && <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" vertical={false} />}
        <XAxis dataKey={xAxisKey} tick={{ fontSize: 9, fill: "#3d6080", fontFamily: "'JetBrains Mono',monospace" }}
          tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis tick={{ fontSize: 9, fill: "#3d6080", fontFamily: "'JetBrains Mono',monospace" }}
          tickLine={false} axisLine={false}
          tickFormatter={(v) => v > 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(1)} width={40} />
        <Tooltip content={<CustomTooltip color={color} />} />
        <Line type="monotone" dataKey={yAxisKey} stroke={color} strokeWidth={1.5}
          dot={false} activeDot={{ r: 4, fill: color, stroke: "#0d1526", strokeWidth: 2 }} />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}