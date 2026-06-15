"use client";

export type Period = "1M" | "3M" | "6M" | "1Y" | "2Y" | "ALL";

// 期間→表示する営業日数（ALLは全期間）
export const PERIODS: Record<Period, number> = {
  "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "2Y": 504, "ALL": 999999,
};
const LABEL: Record<Period, string> = {
  "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1Y", "2Y": "2Y", "ALL": "全期間",
};
const ORDER: Period[] = ["1M", "3M", "6M", "1Y", "2Y", "ALL"];

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
          {LABEL[p]}
        </button>
      ))}
    </div>
  );
}
