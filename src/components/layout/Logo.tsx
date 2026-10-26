import { Link } from 'react-router'

export function Logo() {
  return (
    <Link to="/" className="group relative hit-area flex items-center gap-2.5" aria-label="AutoVerse home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <circle cx="16" cy="16" r="10" fill="none" stroke="var(--cyan)" strokeWidth="2" />
        <circle cx="16" cy="16" r="3.2" fill="var(--amber)" />
        <path d="M16 6v4.5M16 21.5V26M6 16h4.5M21.5 16H26" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round" className="origin-center transition-transform duration-700 group-hover:rotate-90" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight">
        Auto<span className="text-cyan">Verse</span>
      </span>
    </Link>
  )
}
