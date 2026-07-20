import { Download } from "lucide-react";
import { useId, useMemo } from "react";

export interface PlotPoint {
  readonly x: number;
  readonly y: number;
}

interface EngineeringPlotProps {
  readonly title: string;
  readonly subtitle: string;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly data: readonly PlotPoint[];
  readonly source: string;
  readonly fidelity: string;
  readonly color?: string;
  readonly compact?: boolean;
}

const width = 720;
const height = 260;
const padding = { left: 54, right: 18, top: 20, bottom: 38 };

function download(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EngineeringPlot({
  title,
  subtitle,
  xLabel,
  yLabel,
  data,
  source,
  fidelity,
  color = "#48d7b5",
  compact = false
}: EngineeringPlotProps) {
  const identifier = useId().replaceAll(":", "");
  const model = useMemo(() => {
    const xs = data.map((point) => point.x);
    const ys = data.map((point) => point.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMinRaw = Math.min(...ys);
    const yMaxRaw = Math.max(...ys);
    const yMargin = Math.max(1e-6, (yMaxRaw - yMinRaw) * 0.12);
    const yMin = yMinRaw - yMargin;
    const yMax = yMaxRaw + yMargin;
    const xScale = (value: number): number =>
      padding.left +
      ((value - xMin) / Math.max(1e-9, xMax - xMin)) * (width - padding.left - padding.right);
    const yScale = (value: number): number =>
      height -
      padding.bottom -
      ((value - yMin) / Math.max(1e-9, yMax - yMin)) * (height - padding.top - padding.bottom);
    return {
      xMin,
      xMax,
      yMin,
      yMax,
      xScale,
      yScale,
      path: data
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${xScale(point.x).toFixed(2)},${yScale(point.y).toFixed(2)}`
        )
        .join(" ")
    };
  }, [data]);

  const exportCsv = (): void => {
    const rows = [`${xLabel},${yLabel}`, ...data.map((point) => `${point.x},${point.y}`)];
    download(
      `${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}.csv`,
      rows.join("\n"),
      "text/csv"
    );
  };

  return (
    <figure className={`engineering-plot ${compact ? "engineering-plot--compact" : ""}`}>
      <figcaption className="plot-header">
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <button
          className="icon-button icon-button--quiet"
          type="button"
          onClick={exportCsv}
          title="Export plot data as CSV"
          aria-label={`Export ${title} data`}
        >
          <Download size={14} />
        </button>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${identifier}-title ${identifier}-description`}
      >
        <title id={`${identifier}-title`}>{title}</title>
        <desc id={`${identifier}-description`}>
          {subtitle}. X axis {xLabel}; Y axis {yLabel}.
        </desc>
        <defs>
          <linearGradient id={`${identifier}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, index) => {
          const fraction = index / 4;
          const y = padding.top + fraction * (height - padding.top - padding.bottom);
          const value = model.yMax - fraction * (model.yMax - model.yMin);
          return (
            <g key={index}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                className="plot-gridline"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="plot-tick">
                {value.toFixed(2)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 5 }, (_, index) => {
          const fraction = index / 4;
          const x = padding.left + fraction * (width - padding.left - padding.right);
          const value = model.xMin + fraction * (model.xMax - model.xMin);
          return (
            <text key={index} x={x} y={height - 17} textAnchor="middle" className="plot-tick">
              {value.toFixed(value < 10 ? 1 : 0)}
            </text>
          );
        })}
        <path
          d={`${model.path} L${model.xScale(model.xMax)},${height - padding.bottom} L${model.xScale(model.xMin)},${height - padding.bottom} Z`}
          fill={`url(#${identifier}-fill)`}
        />
        <path
          d={model.path}
          fill="none"
          stroke={color}
          strokeWidth="2.3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.length <= 30 &&
          data.map((point, index) => (
            <circle
              key={index}
              cx={model.xScale(point.x)}
              cy={model.yScale(point.y)}
              r="2.4"
              fill={color}
            />
          ))}
        <text
          x={(padding.left + width - padding.right) / 2}
          y={height - 2}
          textAnchor="middle"
          className="plot-label"
        >
          {xLabel}
        </text>
        <text
          x="12"
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${height / 2})`}
          className="plot-label"
        >
          {yLabel}
        </text>
      </svg>
      <footer className="plot-footer">
        <span>{source}</span>
        <span>{fidelity}</span>
      </footer>
    </figure>
  );
}
