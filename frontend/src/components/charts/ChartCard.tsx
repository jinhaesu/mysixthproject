"use client";
import { ResponsiveContainer } from "recharts";

interface Props {
  title: string;
  subtitle?: string;
  height?: number;
  children: React.ReactNode;
}

export default function ChartCard({ title, subtitle, height = 280, children }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
