"use client";

import type { AgentUiBlock } from "@/lib/agent-contract";

const DONUT_COLORS = ["#1f4bb8", "#6f8ee5", "#9eb4ec", "#c6d6f3", "#8ac4ff"];

function formatAudAmount(value: number) {
  return `AUD ${Math.round(value).toLocaleString("en-AU")}`;
}

export function AgentUiBlockRenderer({ block }: { block: AgentUiBlock }) {
  if (block.type === "asset_donut") {
    return <AssetDonutBlock block={block} />;
  }
  return <FinanceTrendLineBlock block={block} />;
}

function AssetDonutBlock({
  block,
}: {
  block: Extract<AgentUiBlock, { type: "asset_donut" }>;
}) {
  const total = block.items.reduce((sum, item) => sum + item.amount, 0);
  const fallbackTotal = total > 0 ? total : 1;
  let angle = 0;

  const gradient = block.items
    .map((item, index) => {
      const ratio = item.amount / fallbackTotal;
      const start = angle;
      angle += ratio * 360;
      const end = angle;
      const color = DONUT_COLORS[index % DONUT_COLORS.length] ?? "#1f4bb8";
      return `${color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {block.title ?? "資產配置"}
      </p>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <div
          className="grid size-[110px] place-items-center rounded-full"
          style={{
            background:
              gradient ||
              "conic-gradient(#1f4bb8 0deg 359deg, #c6d6f3 359deg 360deg)",
          }}
        >
          <div className="grid size-[74px] place-items-center rounded-full bg-white text-center shadow-inner">
            <strong className="text-xs text-slate-800">
              {Math.round(total).toLocaleString("en-AU")}
            </strong>
            <span className="text-[10px] text-slate-500">Total</span>
          </div>
        </div>
        <ul className="space-y-1">
          {block.items.map((item, index) => {
            const percent = Math.round((item.amount / fallbackTotal) * 100);
            const color = DONUT_COLORS[index % DONUT_COLORS.length] ?? "#1f4bb8";
            return (
              <li
                key={`${item.label}-${index}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-700">{item.label}</span>
                <span className="text-slate-500">
                  {formatAudAmount(item.amount)} ({percent}%)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function FinanceTrendLineBlock({
  block,
}: {
  block: Extract<AgentUiBlock, { type: "finance_trend_line" }>;
}) {
  const width = 290;
  const height = 150;
  const padding = 18;
  const maxValue = Math.max(
    ...block.points.flatMap((point) => [point.assets, point.liabilities]),
    1
  );
  const xStep =
    block.points.length > 1
      ? (width - padding * 2) / (block.points.length - 1)
      : width - padding * 2;
  const yScale = (height - padding * 2) / maxValue;

  const toPointString = (key: "assets" | "liabilities") =>
    block.points
      .map((point, index) => {
        const x = padding + index * xStep;
        const y = height - padding - point[key] * yScale;
        return `${x},${y}`;
      })
      .join(" ");

  const assetsPoints = toPointString("assets");
  const liabilitiesPoints = toPointString("liabilities");
  const midIndex = Math.floor((block.points.length - 1) / 2);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {block.title ?? "資產與負債趨勢"}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Finance trend line chart"
        className="h-[150px] w-full rounded-md border border-slate-200 bg-white"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          stroke="#d5dce7"
          strokeWidth="1"
        />
        <line
          x1={padding}
          x2={padding}
          y1={padding}
          y2={height - padding}
          stroke="#d5dce7"
          strokeWidth="1"
        />
        <polyline
          points={assetsPoints}
          fill="none"
          stroke="#1f4bb8"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={liabilitiesPoints}
          fill="none"
          stroke="#bf111b"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>{block.points[0]?.label}</span>
        <span>{block.points[midIndex]?.label}</span>
        <span>{block.points[block.points.length - 1]?.label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#1f4bb8]" />
          Assets
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#bf111b]" />
          Liabilities
        </span>
      </div>
    </div>
  );
}
