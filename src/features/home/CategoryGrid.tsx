import { CategoryIcon } from '@/components/learning/CategoryIcon'
import { categories, topics } from '@/lib/content'
import { Link } from 'react-router'
import { HomeSection } from './HomeSection'
import { categoryTiles } from './homeData'

const tiles = categoryTiles(categories, topics)

/** Homepage band: every category with its lesson count. */
export function CategoryGrid() {
  return (
    <HomeSection
      id="categories"
      eyebrow="Browse by system"
      title="Take the car apart, system by system"
      description={`${topics.length} lessons across ${categories.length} categories, from first principles to driving technique.`}
      action={{ to: '/learn', label: 'Lesson index' }}
    >
      <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map(({ category, count }) => (
          <li key={category.id}>
            <Link
              to={`/learn/${category.slug}`}
              className="group panel flex h-full min-h-24 flex-col gap-2.5 p-3.5 transition-colors hover:border-cyan/35 hover:bg-graphite-850/90 sm:p-4"
            >
              {/* Title first in the DOM (it names the link); shown under the icon row. */}
              <span className="order-2 text-sm font-medium leading-snug text-paper transition-colors group-hover:text-cyan sm:text-[15px]">
                {category.title}
              </span>
              <span className="order-1 flex items-center justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-lg border border-white/[0.08] bg-graphite-950/80 text-steel-300 transition-colors group-hover:border-cyan/30 group-hover:text-cyan">
                  <CategoryIcon name={category.icon} className="size-[18px]" />
                </span>
                <span className="font-mono text-[11px] tabular-nums text-steel-400">
                  {count === 0 ? 'Coming soon' : `${count} ${count === 1 ? 'lesson' : 'lessons'}`}
                </span>
              </span>
              <span className="order-3 hidden text-xs leading-relaxed text-steel-400 sm:line-clamp-2">{category.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}
