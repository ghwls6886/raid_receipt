/**
 * 의존성 없는 SVG 다중 라인 차트 (정수 y축).
 * x축 = 라벨(날짜), 시리즈별 값 배열은 labels 길이에 정렬되어야 한다.
 */

export interface LineChartSeries {
  name: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  labels: string[];
  series: LineChartSeries[];
  /** y축 눈금 포맷 (기본: 정수 그대로) */
  yFormat?: (v: number) => string;
  /** viewBox 높이 (기본 220). 낮출수록 차트가 납작해짐 */
  height?: number;
}

const W = 640;
const PAD_L = 42;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;
const INNER_W = W - PAD_L - PAD_R;

function integerTicks(max: number): number[] {
  if (max <= 5) return Array.from({ length: max + 1 }, (_, i) => i);
  const step = Math.ceil(max / 4);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

export function LineChart({ labels, series, yFormat, height = 220 }: LineChartProps) {
  const H = height;
  const INNER_H = H - PAD_T - PAD_B;
  const fmt = yFormat ?? ((v: number) => String(v));
  const n = labels.length;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = integerTicks(maxVal);

  const x = (i: number): number =>
    n <= 1 ? PAD_L + INNER_W / 2 : PAD_L + (INNER_W * i) / (n - 1);
  const y = (v: number): number => PAD_T + INNER_H - (INNER_H * v) / maxVal;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[480px]"
        role="img"
        aria-label="일자별 공대 레이드 횟수"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              y1={y(t)}
              x2={W - PAD_R}
              y2={y(t)}
              stroke="var(--color-border-subtle)"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 6}
              y={y(t) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-text-muted)"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        {labels.map((lb, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={9}
            fill="var(--color-text-muted)"
          >
            {lb}
          </text>
        ))}

        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />
            ))}
          </g>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s) => (
          <div key={s.name} className="text-text-secondary flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}
