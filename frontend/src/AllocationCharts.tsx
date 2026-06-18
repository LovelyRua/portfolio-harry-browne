import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Category } from './types';
import { formatCurrency, formatPercent } from './utils';

type AllocationRow = {
  category: Category;
  value: number;
  current: number;
  target: number;
};

export function AllocationCharts(props: {
  rows: AllocationRow[];
  colors: Record<Category, string>;
  baseCurrency: string;
  compactNumbers: boolean;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div
        className="chart-frame"
        role="img"
        aria-label="Current portfolio allocation by asset category"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={props.rows}
              dataKey="value"
              nameKey="category"
              innerRadius={72}
              outerRadius={112}
              paddingAngle={3}
              rootTabIndex={-1}
            >
              {props.rows.map((row) => (
                <Cell key={row.category} fill={props.colors[row.category]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value, props.baseCurrency, props.compactNumbers)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label="Current allocation compared with target allocation by asset category"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={props.rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="category" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value: number) => formatPercent(value)} />
            <Bar dataKey="target" fill="var(--line-strong)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="current" radius={[6, 6, 0, 0]}>
              {props.rows.map((row) => (
                <Cell key={row.category} fill={props.colors[row.category]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
