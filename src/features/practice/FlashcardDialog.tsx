/*
 * Adapted from Watermelon UI "card-swipe" (MIT), see THIRD_PARTY_NOTICES.md:
 * a card you can throw to either side, with a velocity threshold. Every swipe
 * is also a button and an arrow key, and the flip is a button and Space; the
 * card itself is only an extra way to do what the buttons do.
 */
import { useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { GlossaryEntry } from '@/lib/glossary'
import { cn } from '@/lib/utils'
import { useProgress } from '@/stores/progress'
import { answerCard, deckDone, orderForPractice, startDeck, swipeDecision } from './deck'

interface FlashcardDialogProps {
  entries: readonly GlossaryEntry[]
  onClose: () => void
}

/** Flashcards for a set of glossary terms: see the term, recall it, flip to check, then "Got it" or "Again". */
export default function FlashcardDialog({ entries, onClose }: FlashcardDialogProps) {
  const reviewTerm = useProgress((s) => s.reviewTerm)
  const bySlug = useMemo(() => new Map(entries.map((e) => [e.slug, e])), [entries])
  const deal = () => startDeck(orderForPractice([...bySlug.keys()], useProgress.getState().practice, Date.now()))
  const [deck, setDeck] = useState(deal)
  const [flipped, setFlipped] = useState(false)
  const dragged = useRef(false)
  const x = useMotionValue(0)
  const tilt = useTransform(x, [-160, 160], [-9, 9])
  const againHint = useTransform(x, [-110, -20], [1, 0])
  const knownHint = useTransform(x, [20, 110], [0, 1])

  const finished = deckDone(deck)
  const current = finished ? undefined : bySlug.get(deck.queue[0]!)
  const left = deck.queue.length

  const decide = (known: boolean) => {
    if (!current) return
    reviewTerm(current.slug, known)
    setDeck(answerCard(deck, known))
    setFlipped(false)
    x.set(0)
  }
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const d = swipeDecision(info.offset.x, info.velocity.x)
    // A drag also ends in a click on some browsers; ignore the flip it would cause.
    window.setTimeout(() => (dragged.current = false), 60)
    if (d) decide(d === 'known')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg border-white/10 bg-graphite-900 p-4 sm:p-6"
        onKeyDown={(e) => {
          if (finished) return
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            decide(true)
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            decide(false)
          } else if (e.key === ' ' && !(e.target as HTMLElement).closest('button, a')) {
            e.preventDefault()
            setFlipped((f) => !f)
          }
        }}
      >
        <DialogTitle className="text-lg">Practise terms</DialogTitle>
        <DialogDescription className="text-sm text-steel-300">
          {finished ? 'Round complete.' : 'Recall the meaning, flip to check, then say whether you knew it. Space flips; arrow keys answer.'}
        </DialogDescription>

        {current ? (
          <>
            <div className="flex items-center gap-3">
              <Progress value={Math.round(((deck.total - left) / Math.max(1, deck.total)) * 100)} aria-label="Round progress" className="h-1.5 flex-1 bg-graphite-700" />
              <p className="font-mono text-xs tabular-nums text-steel-300" aria-live="polite">
                {deck.known} of {deck.total} known
              </p>
            </div>

            <div className="relative [perspective:1200px]">
              <motion.div
                key={`${current.slug}-${deck.again}-${deck.known}`}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.75}
                dragSnapToOrigin
                onDragStart={() => (dragged.current = true)}
                onDragEnd={onDragEnd}
                style={{ x, rotate: tilt, touchAction: 'pan-y' }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18 }}
                onClick={() => !dragged.current && setFlipped((f) => !f)}
                className="relative cursor-grab select-none active:cursor-grabbing"
                data-testid="flashcard"
              >
                <motion.div
                  className="relative min-h-64 [transform-style:preserve-3d]"
                  animate={{ rotateY: flipped ? 180 : 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                >
                  <div
                    aria-hidden={flipped}
                    className="panel tactile absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center [backface-visibility:hidden]"
                  >
                    <p className="eyebrow">Term</p>
                    <p className="font-display text-3xl text-paper">{current.term}</p>
                    <p className="text-xs text-steel-400">What does it mean?</p>
                  </div>
                  <div
                    aria-hidden={!flipped}
                    inert={!flipped}
                    className="panel tactile absolute inset-0 flex flex-col gap-3 overflow-y-auto p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                  >
                    <p className="eyebrow">{current.term}</p>
                    <p className="text-[15px] leading-relaxed text-paper">{current.definition}</p>
                    {current.equation && (
                      <code className="block overflow-x-auto whitespace-pre rounded-md border border-white/[0.06] bg-graphite-950 px-3 py-2 font-mono text-[13px] text-amber">
                        {current.equation}
                      </code>
                    )}
                    <p className="mt-auto text-xs text-steel-400">
                      Explained in{' '}
                      {current.topics.map((t, i) => (
                        <span key={t.id}>
                          {i > 0 && ', '}
                          <Link to={`/topics/${t.slug}`} onClick={onClose} className="relative text-cyan underline-offset-4 hover:underline" onPointerDownCapture={(e) => e.stopPropagation()}>
                            {t.title}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </div>
                </motion.div>
                <motion.span aria-hidden style={{ opacity: againHint }} className="pointer-events-none absolute left-3 top-3 rounded-full border border-danger/50 bg-danger/15 px-2.5 py-0.5 font-mono text-[11px] uppercase text-danger">
                  Again
                </motion.span>
                <motion.span aria-hidden style={{ opacity: knownHint }} className="pointer-events-none absolute right-3 top-3 rounded-full border border-ok/50 bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] uppercase text-ok">
                  Got it
                </motion.span>
              </motion.div>
            </div>

            <p className="sr-only" aria-live="polite">
              {flipped ? `${current.term}: ${current.definition}` : `Card: ${current.term}`}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => decide(false)}>
                <ArrowLeft aria-hidden /> Again
              </Button>
              <Button variant="ghost" className="h-11 flex-1 sm:flex-none" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
                <RotateCcw aria-hidden /> {flipped ? 'Show term' : 'Show meaning'}
              </Button>
              <Button className="h-11 flex-1 sm:flex-none" onClick={() => decide(true)}>
                Got it <ArrowRight aria-hidden />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-4" data-testid="flashcard-summary">
            <p className="flex items-center gap-2 font-display text-2xl text-paper">
              <Check aria-hidden className="size-6 text-ok" />
              {deck.total} {deck.total === 1 ? 'term' : 'terms'} covered
            </p>
            <p className={cn('text-sm', deck.again ? 'text-steel-300' : 'text-ok')}>
              {deck.again ? `You asked to see ${deck.again === 1 ? 'one card' : `${deck.again} cards`} again before knowing ${deck.again === 1 ? 'it' : 'them'}.` : 'You knew every term first time.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-11"
                onClick={() => {
                  setDeck(deal())
                  setFlipped(false)
                }}
              >
                <RotateCcw aria-hidden /> Practise again
              </Button>
              <Button variant="outline" className="h-11" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
