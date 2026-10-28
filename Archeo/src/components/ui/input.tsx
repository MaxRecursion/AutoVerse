import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-11 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-300/70 focus:outline-none focus:ring-2 focus:ring-cyan-300/10', className)} {...props} />
}
