import { cn } from '@/lib/cn';
import {
  MANNER_TEMP_INITIAL,
  formatTemperature,
  getTemperatureBand,
  temperaturePercent,
} from './domain';

interface MannerTemperatureBadgeProps {
  temperature: number;
  className?: string;
}

/** 목록·카드에 곁들이는 작은 온도 칩 */
export function MannerTemperatureBadge({ temperature, className }: MannerTemperatureBadgeProps) {
  const band = getTemperatureBand(temperature);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        band.chip,
        className,
      )}
      title={`매너온도 ${formatTemperature(temperature)} — ${band.label}`}
    >
      {formatTemperature(temperature)}
    </span>
  );
}

interface MannerTemperatureGaugeProps {
  temperature: number;
  /** 기준선(가입 시 온도)을 함께 표시할지 */
  showBaseline?: boolean;
  className?: string;
}

/**
 * 프로필 상단에 쓰는 큰 온도 게이지.
 * 숫자를 크게 두고 그 아래 얇은 트랙을 깔아, 절대값과 상대 위치를 같이 읽게 한다.
 */
export function MannerTemperatureGauge({
  temperature,
  showBaseline = true,
  className,
}: MannerTemperatureGaugeProps) {
  const band = getTemperatureBand(temperature);
  const percent = temperaturePercent(temperature);
  const baselinePercent = temperaturePercent(MANNER_TEMP_INITIAL);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-text-primary text-3xl leading-none font-bold tabular-nums">
            {formatTemperature(temperature)}
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', band.chip)}>
            {band.label}
          </span>
        </div>
        <span className="text-text-tertiary text-xs">매너온도</span>
      </div>

      <div
        aria-label="매너온도"
        aria-valuemax={99}
        aria-valuemin={0}
        aria-valuenow={Number(temperature.toFixed(1))}
        className="bg-bg-muted relative h-2 w-full overflow-hidden rounded-full"
        role="meter"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', band.fill)}
          style={{ width: `${String(percent)}%` }}
        />
        {showBaseline && (
          <span
            aria-hidden="true"
            className="bg-text-tertiary/50 absolute top-0 h-full w-px"
            style={{ left: `${String(baselinePercent)}%` }}
          />
        )}
      </div>

      {showBaseline && (
        <p className="text-text-tertiary text-[11px]">
          가입 시 {MANNER_TEMP_INITIAL}.0°C에서 시작 · 좋아요 +0.5 / 싫어요 −0.5
        </p>
      )}
    </div>
  );
}
