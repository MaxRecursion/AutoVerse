import { Boxes } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand-lockup"><span className="brand-mark"><Boxes size={17} strokeWidth={2.3} /></span><span className="brand-name">Codebase Archaeologist</span>{!compact && <span className="brand-beta">BETA</span>}</div>
}
