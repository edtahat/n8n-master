import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function ChartCard({ title, subtitle, children, footer }: ChartCardProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {subtitle ? <p className="card-sub">{subtitle}</p> : null}
      {children}
      {footer}
    </section>
  );
}
