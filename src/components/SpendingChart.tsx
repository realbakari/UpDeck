import { money, type Transaction } from '../domain';

export function SpendingChart({
  transactions,
  days,
  hidden,
}: {
  transactions: Transaction[];
  days: number;
  hidden: boolean;
}) {
  const bins = Array.from({ length: 12 }, () => 0);
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  const range = now.getTime() - start.getTime() + 1;
  for (const t of transactions) {
    if (t.amount >= 0 || t.transfer) continue;
    const index = Math.min(
      11,
      Math.max(0, Math.floor(((new Date(t.createdAt).getTime() - start.getTime()) / range) * 12)),
    );
    bins[index] -= t.amount;
  }
  const max = Math.max(...bins, 100);
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        hidden
          ? 'Spending chart hidden'
          : `Spending over the last ${days} days. Total ${money(bins.reduce((a, b) => a + b, 0))}.`
      }
    >
      <div className="chart-top">
        <span>{hidden ? '••••' : money(max)}</span>
        <span>Spending over time</span>
      </div>
      <div className={`chart-bars ${hidden ? 'chart-hidden' : ''}`}>
        {bins.map((amount, i) => (
          <div className="bar-slot" key={i}>
            <div
              className={`chart-bar ${i === 11 ? 'last' : ''}`}
              style={{ height: `${Math.max(3, (amount / max) * 100)}%` }}
            >
              <span className="bar-tooltip">{hidden ? '••••' : money(amount)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="chart-axis">
        <span>{start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
        <span>{days} days of little moments</span>
        <span>Today</span>
      </div>
    </div>
  );
}
