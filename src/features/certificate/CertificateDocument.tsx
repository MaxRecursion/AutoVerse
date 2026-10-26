import type { Course } from './courses'
import { certificateCode, formatStudyTime, studyMinutes } from './courses'

const PAPER = '#f7f2e6'
const INK = '#161a20'
const GOLD = '#a8782a'
const TEAL = '#0d7f93'

const formatDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(iso))

/**
 * The certificate as a document. It is always drawn on light "paper" (so it
 * prints well from a dark UI) and sized with container-query units, so the
 * same markup fills a phone screen or an A4 landscape page. `id="certificate"`
 * is what the print stylesheet keeps.
 */
export function CertificateDocument({
  name,
  course,
  earnedAt,
  averageScore,
}: {
  name: string
  course: Course
  earnedAt: string
  averageScore: number | null
}) {
  const displayName = name.trim()
  const code = certificateCode(course.id, earnedAt, displayName)
  const labs = course.topics.filter((t) => t.labId).length
  const facts = [
    `${course.topics.length} ${course.topics.length === 1 ? 'lesson' : 'lessons'}`,
    labs > 0 ? `${labs} interactive ${labs === 1 ? 'lab' : 'labs'}` : null,
    `about ${formatStudyTime(studyMinutes(course))} of study`,
    averageScore !== null ? `average quiz score ${averageScore}%` : null,
  ].filter((f): f is string => !!f)

  return (
    <figure
      id="certificate"
      aria-label={`Certificate of completion: ${course.title}`}
      className="relative m-0 mx-auto aspect-[1.414/1] w-full max-w-[1100px] overflow-hidden shadow-2xl [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ background: PAPER, color: INK, containerType: 'inline-size' }}
    >
      {/* Frames */}
      <div aria-hidden className="absolute" style={{ inset: '2.2cqw', border: `0.18cqw solid ${GOLD}` }} />
      <div aria-hidden className="absolute" style={{ inset: '3cqw', border: `0.07cqw solid ${INK}`, opacity: 0.55 }} />
      {[
        { top: '2.2cqw', left: '2.2cqw' },
        { top: '2.2cqw', right: '2.2cqw' },
        { bottom: '2.2cqw', left: '2.2cqw' },
        { bottom: '2.2cqw', right: '2.2cqw' },
      ].map((pos, i) => (
        <span key={i} aria-hidden className="absolute" style={{ ...pos, width: '1.6cqw', height: '1.6cqw', background: TEAL, transform: 'translate(0,0) rotate(45deg)', margin: '-0.8cqw' }} />
      ))}

      <div className="absolute inset-0 flex flex-col items-center px-[8cqw] py-[5.2cqw] text-center">
        <div className="flex items-center gap-[1cqw]">
          <svg viewBox="0 0 32 32" aria-hidden style={{ width: '3.2cqw', height: '3.2cqw' }}>
            <circle cx="16" cy="16" r="10" fill="none" stroke={TEAL} strokeWidth="2" />
            <circle cx="16" cy="16" r="3.2" fill={GOLD} />
            <path d="M16 6v4.5M16 21.5V26M6 16h4.5M21.5 16H26" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="font-display font-semibold tracking-tight" style={{ fontSize: '2.4cqw' }}>
            Auto<span style={{ color: TEAL }}>Verse</span>
          </span>
        </div>

        <p className="font-mono uppercase" style={{ marginTop: '2.6cqw', fontSize: '1.35cqw', letterSpacing: '0.42em', color: GOLD }}>
          Certificate of completion
        </p>
        <p style={{ marginTop: '2.2cqw', fontSize: '1.7cqw', opacity: 0.75 }}>This certifies that</p>

        <p
          className="font-display font-semibold leading-tight"
          style={{
            marginTop: '1.2cqw',
            minWidth: '45cqw',
            maxWidth: '78cqw',
            fontSize: displayName.length > 32 ? '4.2cqw' : '5.6cqw',
            borderBottom: `0.14cqw solid ${GOLD}`,
            padding: '0 2cqw 0.8cqw',
            opacity: displayName ? 1 : 0.35,
            overflowWrap: 'anywhere',
          }}
        >
          {displayName || 'Your name'}
        </p>

        <p style={{ marginTop: '2.2cqw', fontSize: '1.7cqw', opacity: 0.75 }}>has completed the AutoVerse course</p>
        <h2 className="font-display font-semibold leading-tight" style={{ marginTop: '1cqw', fontSize: '4cqw', color: TEAL, maxWidth: '78cqw' }}>
          {course.title}
        </h2>
        <p style={{ marginTop: '1.4cqw', fontSize: '1.45cqw', lineHeight: 1.5, maxWidth: '70cqw', opacity: 0.8 }}>{facts.join('  ·  ')}</p>

        <div className="mt-auto grid w-full grid-cols-3 items-end">
          <div className="text-left">
            <p className="font-mono uppercase" style={{ fontSize: '1.05cqw', letterSpacing: '0.2em', opacity: 0.6 }}>
              Date earned
            </p>
            <p className="font-medium" style={{ fontSize: '1.7cqw', marginTop: '0.4cqw' }}>
              {formatDate(earnedAt)}
            </p>
          </div>

          <svg viewBox="0 0 100 100" aria-hidden className="mx-auto" style={{ width: '11cqw', height: '11cqw' }}>
            <circle cx="50" cy="50" r="46" fill="none" stroke={GOLD} strokeWidth="2.2" />
            <circle cx="50" cy="50" r="41" fill="none" stroke={GOLD} strokeWidth="0.8" strokeDasharray="1.2 2.6" />
            <circle cx="50" cy="50" r="30" fill="none" stroke={TEAL} strokeWidth="2.6" />
            <circle cx="50" cy="50" r="9" fill={GOLD} />
            <path d="M50 14v12M50 74v12M14 50h12M74 50h12" stroke={TEAL} strokeWidth="3" strokeLinecap="round" />
          </svg>

          <div className="text-right">
            <p className="font-mono uppercase" style={{ fontSize: '1.05cqw', letterSpacing: '0.2em', opacity: 0.6 }}>
              Certificate no.
            </p>
            <p className="font-mono font-medium" style={{ fontSize: '1.7cqw', marginTop: '0.4cqw' }}>
              {code}
            </p>
          </div>
        </div>

        <p style={{ marginTop: '2cqw', fontSize: '0.95cqw', lineHeight: 1.45, maxWidth: '72cqw', opacity: 0.55 }}>
          Awarded by AutoVerse for personal learning. Progress is recorded in the learner’s own browser, so this certificate is not independently verified.
        </p>
      </div>
    </figure>
  )
}
