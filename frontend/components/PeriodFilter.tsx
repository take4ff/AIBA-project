"use client";

export type Period = "1M" | "3M" | "6M";

// 期間→表示する営業日数（6Mは全期間）
export const PERIODS: Record<Period, number> = { "1M": 21, "3M": 63, "6M": 9999 };
const ORDER: Period[] = ["1M", "3M", "6M"];

export default function PeriodFilter({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="period-filter">
      {ORDER.map((p) => (
        <button
          key={p}
          className={`period-btn${p === value ? " period-active" : ""}`}
          onClick={() => onChange(p)}
          type="button"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
