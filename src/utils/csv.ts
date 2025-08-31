// src/utils/csv.ts
import { toMMDDYYYY } from '@/lib/date';

type EquityPointUI = {
  date: Date;
  equity: number;
};

export function equityToCsv(rows: EquityPointUI[]) {
  const header = 'Date,Equity';
  const body = rows
    .map((r) => `${toMMDDYYYY(r.date)},${r.equity}`)
    .join('\n');
  return `${header}\n${body}`;
}
