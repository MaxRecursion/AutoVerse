import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const styles = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-45', {
  variants: {
    variant: {
      primary: 'bg-cyan-300 text-slate-950 hover:bg-cyan-200',
      secondary: 'border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]',
      ghost: 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
      danger: 'border border-rose-400/20 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15',
    },
    size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs', icon: 'size-9' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof styles> {}
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(styles({ variant, size }), className)} {...props} />
}
