import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        // Bright blue CTA
        primary:
          'bg-primary text-white shadow-[0_8px_24px_-8px_rgba(14,165,233,0.6)] hover:bg-primary-600 hover:shadow-[0_10px_30px_-6px_rgba(14,165,233,0.7)]',
        // Dark with light border + hover glow
        secondary:
          'bg-white/[0.03] text-text-primary border border-glow hover:bg-white/[0.06] hover:shadow-glow',
        ghost: 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]',
        danger:
          'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/20',
        success:
          'bg-success/10 text-success border border-success/25 hover:bg-success/20',
      },
      size: {
        sm: 'h-9 px-3.5',
        md: 'h-11 px-5',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
