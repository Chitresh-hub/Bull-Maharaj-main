import { useEffect, useState } from "react";
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend } from "recharts";

interface PieChartProps {
  data: Array<{ [key: string]: any }>;
  nameKey: string; valueKey: string;
  colors?: string[]; innerRadius?: number; outerRadius?: number;
}

const COLORS = ["#00e676","#00b0ff","#7c4dff","#ffd600","#ff3d57","#00bcd4","#ff9800","#69f0ae"];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d1526", border: "1px solid #1e3a5f", borderRadius: 3, padding: "8px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
      <div style={{ color: payload[0].payload.fill, fontWeight: 600, marginBottom: 2 }}>{payload[0].name}</div>
      <div style={{ color: "#e2eaf6" }}>₹{payload[0].value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
    </div>
  );
};

const CustomLegend = ({ payload }: any) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", justifyContent: "center", marginTop: 4 }}>
    {payload?.map((entry: any, i: number) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: entry.color }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#7a9bc4" }}>{entry.value}</span>
      </div>
    ))}
  </div>
);

export function PieChart({ data, nameKey, valueKey, colors, innerRadius = 0, outerRadius = 70 }: PieChartProps) {
  const [chartData, setChartData] = useState(data);
  useEffect(() => { setChartData(data); }, [data]);

  if (!chartData.length) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#3d6080", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>NO DATA</div>
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPieChart>
        <Pie data={chartData} cx="50%" cy="45%" innerRadius={innerRadius} outerRadius={outerRadius}
          dataKey={valueKey} nameKey={nameKey} paddingAngle={2}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill || (colors ? colors[i % colors.length] : COLORS[i % COLORS.length])}
              stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}