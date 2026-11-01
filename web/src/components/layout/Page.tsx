import type { HTMLAttributes } from 'react';

function classes(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

export function Page({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('flex min-h-full flex-col gap-[var(--card-gap)] p-[var(--page-gutter)]', className)} {...props} />;
}

export function PageHeader({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <header className={classes('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)} {...props} />;
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('rounded-card border border-border-subtle bg-panel', className)} {...props} />;
}
