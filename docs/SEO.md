# SEO and AI-search plan

Goal: AutoVerse pages are fully readable by search engines and AI crawlers, are understood as educational content about specific automotive topics, and are eligible to rank for the questions people actually ask ("how does a four-stroke engine work", "what does a differential do", "who invented the disc brake").

**What cannot be promised.** No site can guarantee a position on Google. Broad head terms ("cars", "engines") are dominated by large publishers; a new site realistically ranks first for long-tail educational questions, over weeks to months, and climbs as it earns links. AI assistants mostly answer from search indexes (ChatGPT search: Bing plus OpenAI's own crawler; Gemini and AI Overviews: Google; Claude: web search plus page fetches; Perplexity: its own crawler), so being well indexed is the lever. Whether a model's *training data* includes the site is not controllable.

## 1. Audit (live site, 26 Oct 2026) and fixes

| # | Finding | Impact | Fix |
|---|---|---|---|
| 1 | Pages shipped an empty app root; the text existed only inside `<noscript>` (844 words on the four-stroke lesson, 1 word outside it). | Most AI crawlers do not run JavaScript and many text extractors drop `<noscript>`: to them, pages were nearly empty. Google renders JS, but later and less reliably. | Every public page is rendered to real HTML at build time (3,456 words in the four-stroke page's app root). |
| 2 | Canonical and sitemap URLs (`…/topics/x`) 301-redirected to `…/topics/x/`. | Canonicals should point at the 200 URL; every crawl started with a redirect. | Pages are written as `topics/x.html`, so `/topics/x` answers 200; `404.html` sends trailing-slash URLs to the canonical one. |
| 3 | `robots.txt` exists only at `/AutoVerse/robots.txt`; crawlers read robots only at the host root (`maxrecursion.github.io/robots.txt` → 404). | The sitemap line is never discovered; per-bot rules cannot apply. | Owner action (section 3). The sitemap is still found through Search Console, Bing and IndexNow submissions. |
| 4 | No structured data, no share image, generic `summary` card. | No breadcrumbs or article understanding; poor previews in search, social and AI link cards. | JSON-LD on every page; a 1200×630 share image per page; `summary_large_image`. |
| 5 | Lesson titles/descriptions were the lesson name + summary; no question-shaped content. | Weak match for how people phrase searches and AI prompts. | Search-intent titles and descriptions for all 34 lessons and every hub; 106 common questions answered on the lesson pages. |
| 6 | The technical explanation and the engineer stories were not in the DOM until clicked. | Depth content was invisible to crawlers. | Both explanation levels and every story are in the page, collapsed with `hidden`. |
| 7 | `/progress` (personal) was indexable; no sitemap `lastmod` per page. | Wasted crawl, misleading freshness. | `noindex` and robots `Disallow` for personal pages; per-page `lastmod` from git history. |

## 2. What is in place

1. **Real HTML for every page.** `npm run build` renders the actual React pages (React Router static handler + `renderToString`) into each page's HTML, so crawlers get the same headings, text and links users see. The browser takes over without a loading flash. Personal pages stay client-only. Contract: [ARCHITECTURE.md](ARCHITECTURE.md#static-rendering-search-and-ai-discovery).
2. **URL hygiene.** Canonical, `og:url`, sitemap and internal links agree on the 200 URL; `noindex, follow` on personal pages and the 404.
3. **Metadata.** Unique search titles (lesson part up to 60 characters, plus " · AutoVerse") and descriptions (70–160 characters) for every page; `max-snippet:-1, max-image-preview:large` robots directive; Open Graph and Twitter cards with a per-page share image (`npm run og:images`).
4. **Structured data (JSON-LD).** `Organization` and `WebSite` on every page; lessons as `TechArticle` + `LearningResource` (level, time required, what it teaches, the Wikipedia entity it is `about`, its lab as an interactive part) with `BreadcrumbList` and `FAQPage`; hubs as `CollectionPage` + `ItemList`; `DefinedTermSet` for the glossary; `Person` entries for the engineers; labs as interactive `LearningResource`s. Note: since 2023 Google shows FAQ rich results only for well-known government and health sites, so `FAQPage` will not produce an FAQ snippet here. The visible questions still match how people search and are easy for AI answers to quote.
5. **Content shaped for questions.** A "Common questions" section on every lesson (3–4 question-and-answer pairs); the other explanation level and the engineer stories present in the page; a `/glossary` page built from every key concept, each linked to its lesson.
6. **AI-agent access.** `robots.txt` names and allows the search and AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Google-Extended, Applebot and others); `llms.txt` (site map for agents), `llms-full.txt` (all lessons as Markdown) and a Markdown twin of each lesson linked with `rel="alternate" type="text/markdown"`.
7. **Freshness and submission.** Per-page `lastmod` from git history (the deploy checks out full history). Optional repository variables: `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` add ownership meta tags; `INDEXNOW_KEY` publishes the key file and, after each deploy, tells IndexNow engines which pages changed (`scripts/prerender/indexnow.ts`).
8. **Checked like a crawler.** `tests/e2e/seo.spec.ts` loads every sitemap page with JavaScript off and checks words, one `h1`, title and description length and uniqueness, canonical, robots, JSON-LD, lesson depth, robots.txt, the llms files and a clean boot. Unit tests cover structured data, the sitemap, robots, the Markdown output, share images and lesson search copy.

## 3. Owner checklist (cannot be done from code)

1. **Google Search Console.** Done on 2026-10-28 for the production site, `https://autoverse.maxrecursion.dev/` (Vercel): a URL-prefix property verified with the HTML tag, whose `content` value is the `GOOGLE_SITE_VERIFICATION` environment variable in the Vercel project (Production). Changing it needs a new production build. The GitHub Pages mirror, if it is kept, reads the same name from a repository variable (Settings → Secrets and variables → Actions → Variables). After a change, press Verify, submit `sitemap.xml`, and use URL Inspection → Request indexing for the home page and a few key lessons.
2. **Bing Webmaster Tools** (Bing also feeds ChatGPT search, Copilot and DuckDuckGo results). Import the site from Search Console, or verify with the meta tag (`BING_SITE_VERIFICATION`), and submit the sitemap.
3. **IndexNow.** Create a key (for example `openssl rand -hex 16`), save it as the `INDEXNOW_KEY` repository variable, then run the deploy workflow once by hand with "Submit every page to IndexNow" ticked. After that, every deploy submits only the pages whose content changed.
4. **Root robots.txt and favicon.** Done: the custom domain `autoverse.maxrecursion.dev` serves `robots.txt` and the favicon at the host root. Keep `SITE_URL` pointed at it so canonicals and the sitemap name the domain Google should credit.
5. **Earn links.** Share genuinely useful lessons where learners and enthusiasts gather (forums, Reddit, Hacker News "Show HN", maker and education communities), and ask teachers or clubs to link to specific lessons. Links are what move a new site from page five to page one.
6. **Keep publishing and measuring.** Every new, well-sourced lesson is another chance to rank. Check Search Console's Pages and Performance reports monthly; queries with impressions but few clicks point at titles and descriptions worth rewriting.

## 4. Writing for search

- **Title:** the question or comparison people type ("How a Clutch Works (and Why It Slips)", "FWD vs RWD vs AWD"). Up to 60 characters; unique.
- **Description:** what the page answers, in 70–160 characters; unique.
- **Common questions:** real questions people ask about the topic, answered in 40–75 words, in original wording, consistent with the lesson and with no claim it does not support.
- **About:** the Wikipedia article(s) for the lesson's subject, checked to exist (not a redirect or disambiguation page).
- `npm run validate:content -- --strict` enforces presence, lengths and uniqueness; `npm run og:images` redraws the share card after a title change.
