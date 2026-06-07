'use client';

import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        solid: '',
        outline: 'border bg-transparent',
        ghost: 'bg-transparent',
        soft: '',
      },
      tone: {
        primary: '',
        success: '',
        danger: '',
        neutral: '',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9 p-0',
      },
    },
    compoundVariants: [
      { variant: 'solid', tone: 'primary', class: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90' },
      { variant: 'solid', tone: 'success', class: 'bg-emerald-500 text-white hover:bg-emerald-600' },
      { variant: 'solid', tone: 'danger', class: 'bg-[hsl(var(--destructive))] text-white hover:opacity-90' },
      { variant: 'solid', tone: 'neutral', class: 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:opacity-90' },
      { variant: 'outline', tone: 'primary', class: 'border-[hsl(var(--primary))] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.1)]' },
      { variant: 'outline', tone: 'success', class: 'border-emerald-500 text-emerald-500 hover:bg-emerald-500/10' },
      { variant: 'outline', tone: 'danger', class: 'border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]' },
      { variant: 'outline', tone: 'neutral', class: 'border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]' },
      { variant: 'ghost', tone: 'primary', class: 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.1)]' },
      { variant: 'ghost', tone: 'success', class: 'text-emerald-500 hover:bg-emerald-500/10' },
      { variant: 'ghost', tone: 'danger', class: 'text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]' },
      { variant: 'ghost', tone: 'neutral', class: 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]' },
      { variant: 'soft', tone: 'primary', class: 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.25)]' },
      { variant: 'soft', tone: 'success', class: 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25' },
      { variant: 'soft', tone: 'danger', class: 'bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.25)]' },
      { variant: 'soft', tone: 'neutral', class: 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:opacity-90' },
    ],
    defaultVariants: {
      variant: 'solid',
      tone: 'primary',
      size: 'md',
    },
  }
);

const Button = forwardRef(function Button(
  { className, variant, tone, size, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, tone, size }), className)}
      {...props}
    />
  );
});

const ButtonGroup = forwardRef(function ButtonGroup({ className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      role="group"
      className={cn(
        'inline-flex items-center overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] divide-x divide-[hsl(var(--border))] [&>*]:rounded-none [&>*]:border-0 [&>*]:focus-visible:ring-offset-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export { Button, ButtonGroup, buttonVariants };
export default Button;
