# Affiliate Websites — Step-by-Step Business Plan

A practical plan for building content websites that earn commission through
affiliate partner links. Work through the phases in order; each one ends with
a checkpoint so you know when to move on.

| File | What it's for |
|---|---|
| `README.md` (this file) | The full business plan, phase by phase |
| `CHECKLIST.md` | Tick-box version of the plan to track progress |
| `templates/niche-scorecard.md` | Score and compare niche ideas |
| `templates/review-article.md` | Outline for a single-product review |
| `templates/comparison-article.md` | Outline for a "best X for Y" roundup |
| `templates/disclosure.md` | FTC-style affiliate disclosure + page text |
| `templates/budget.md` | Startup costs and a 12-month revenue model |

---

## How affiliate sites make money (the 60-second version)

1. You publish genuinely helpful content (reviews, comparisons, how-tos)
   aimed at people who are close to buying something.
2. Readers arrive mostly from search engines (Google/Bing), plus Pinterest,
   YouTube, newsletters, or social.
3. They click your tracked partner link and buy.
4. The merchant pays you a commission (typically 1–10% for physical goods,
   20–50%+ or a flat bounty for software, courses, and services).

**Revenue ≈ Visitors × Click-through rate × Conversion rate × Avg. commission**

Example: 20,000 visits/mo × 8% CTR × 5% conversion × $15 commission = **$1,200/mo**.
Every phase below is about raising one of those four numbers.

**Realistic expectations:** most new sites earn little or nothing for the
first 4–9 months while search engines learn to trust them. Plan for 12–18
months to reach meaningful income, and treat it like building an asset, not
a quick win.

---

## Phase 1 — Pick a niche (Week 1)

The niche decision matters more than anything else you'll do.

**Step 1.1 — Brainstorm 15–20 ideas.** Pull from hobbies, your job, problems
you've solved, and things you've bought after lots of research. Good niches
sit at the intersection of *people spend money*, *people research before
buying*, and *you can credibly talk about it*.

**Step 1.2 — Score each idea** with `templates/niche-scorecard.md` on:
- **Buyer intent** — are there lots of "best ___", "___ vs ___", "___ review" searches?
- **Commission value** — average order value × commission rate. Aim for ≥ $10/sale or recurring commissions.
- **Competition** — are the top search results huge brands only, or are small sites/forums ranking too? (Forums and thin small sites ranking = opportunity.)
- **Content depth** — can you list 100+ article ideas?
- **Your edge** — experience, access to products, expertise, or a unique angle.
- **Evergreen-ness** — will people still search this in 5 years?

**Step 1.3 — Go narrow first.** "Home coffee" is huge; "espresso gear for
small kitchens" is winnable. You can widen later.

**Avoid at the start:** health claims/supplements, finance/credit, and
legal topics (Google holds these "YMYL" topics to a much higher bar), and
niches tied to fads.

✅ **Checkpoint:** one niche scoring highest, with 100+ article ideas listed.

---

## Phase 2 — Find affiliate programs (Week 1–2)

**Step 2.1 — Check the main networks** for merchants in your niche:
- **Amazon Associates** — easy approval, huge catalog, low rates (1–4%), 24-hour cookie. Good starter, poor long-term sole source.
- **Impact, CJ (Commission Junction), Rakuten, Awin, ShareASale (now part of Awin)** — thousands of brands, higher rates.
- **PartnerStack** — software/SaaS (recurring commissions).
- **Direct brand programs** — search "[brand] affiliate program". Often the best rates.

**Step 2.2 — Build a program shortlist** (spreadsheet columns): merchant,
network, commission %, cookie length, avg order value, EPC (earnings per
click, if shown), payout threshold, approval requirements.

**Step 2.3 — Note approval rules.** Many programs want a live site with
~10–20 quality posts before approving you. Apply to Amazon and easy-approval
networks early; apply to the picky ones after Phase 5.

✅ **Checkpoint:** 5+ viable programs identified, at least 2 you can join now.

---

## Phase 3 — Set up the business (Week 2)

**Step 3.1 — Legal structure.** Start as a sole proprietor if you like; form
an LLC once income is real or if you want liability separation. (Check your
state's rules — this isn't legal advice.)

**Step 3.2 — Separate money.** A dedicated bank account and card for the
business. Track every expense from day one (domain, hosting, tools).

**Step 3.3 — Taxes.** Networks will ask for a W-9 (US) or W-8BEN (non-US).
Set aside ~25–30% of profit for taxes; talk to an accountant once you're
earning.

**Step 3.4 — Brand.** Pick a brandable name (not "BestCheapBlendersReview.com").
Short, memorable, room to grow. Check the domain (.com preferred) and social
handles are free.

✅ **Checkpoint:** business account open, name chosen, domain registered.

---

## Phase 4 — Build the website (Week 2–3)

**Step 4.1 — Choose a platform.**

| Option | Best for | Cost |
|---|---|---|
| WordPress (self-hosted) + lightweight theme (GeneratePress, Kadence, Astra) | Most people; huge plugin ecosystem | ~$5–30/mo hosting |
| Static site (Astro / Next.js) on Vercel or Netlify | Developers who want speed and control | Often free |
| Ghost | Content + newsletter in one | ~$9–25/mo |

Since you already work with Next.js, a static Next.js/Astro site is a strong
choice — but WordPress is faster if you'd rather focus purely on content.

**Step 4.2 — Essential pages before launch:**
- Home (who the site helps, links to your best content)
- About (real person, real experience — this builds trust and E-E-A-T)
- Contact
- Affiliate disclosure (see `templates/disclosure.md`)
- Privacy policy and terms (required by most networks; use a generator, then review)

**Step 4.3 — Technical basics:**
- HTTPS, fast hosting, mobile-first design (most traffic is mobile)
- Clean URLs (`/best-espresso-grinders/`), XML sitemap, robots.txt
- Google Search Console + Bing Webmaster Tools connected
- Privacy-friendly analytics (Plausible, Fathom) or GA4
- Affiliate links marked `rel="sponsored nofollow"` (Google requires this)
- A link manager (e.g. Pretty Links/ThirstyAffiliates on WordPress, or a
  `/go/product-name` redirect route on a custom site) so you can update links
  in one place and track clicks

**Step 4.4 — Design for conversion:** comparison tables near the top, clear
"Check price" buttons, pros/cons boxes, a "Our top pick" summary for skimmers.

✅ **Checkpoint:** site live, essential pages published, Search Console verified.

---

## Phase 5 — Content strategy (Weeks 3–12, then ongoing)

**Step 5.1 — Keyword research.** Use free tools (Google autocomplete,
"People also ask", AnswerThePublic, Google Keyword Planner) or paid ones
(Ahrefs, Semrush, LowFruits). Group keywords by intent:

| Intent | Example | Purpose |
|---|---|---|
| **Commercial** | "best espresso grinder under $200" | Money pages |
| **Comparison** | "Baratza Encore vs Fellow Opus" | Money pages |
| **Review** | "Fellow Opus review" | Money pages |
| **Informational** | "how fine to grind for espresso" | Traffic + links to money pages |

**Step 5.2 — Build topic clusters.** One "pillar" roundup (e.g. *Best Espresso
Grinders*) supported by 5–10 reviews, comparisons, and how-tos that all link
to it and to each other. Finish one cluster before starting the next.

**Step 5.3 — Launch content mix:** ~30–40 articles in the first 3 months,
roughly 40% money pages / 60% informational. Consistency beats bursts.

**Step 5.4 — Make it genuinely useful (this is what ranks in 2026):**
- First-hand experience: your own photos, test results, measurements, video
- Clear verdicts ("buy this if…, skip it if…")
- Honest downsides — trust converts better than hype
- Updated dates and real maintenance; refresh prices/models quarterly
- AI tools are fine for outlines and editing, but mass-produced, unedited AI
  content gets demoted. Your experience is the moat.

Use `templates/review-article.md` and `templates/comparison-article.md`.

✅ **Checkpoint:** 30+ published articles in 2–3 complete clusters.

---

## Phase 6 — Get traffic (Month 2 onward)

1. **SEO (primary channel):** internal linking, descriptive titles, answer the
   query in the first paragraph, schema markup (Product, Review, FAQ).
2. **Pinterest:** excellent for home, food, fashion, DIY, travel niches.
3. **YouTube / short video:** reviews and demos; link to your site in descriptions.
4. **Email list (from day one):** offer a checklist/buyer's guide. Email is the
   traffic you own when algorithms change.
5. **Communities:** Reddit, forums, Facebook groups — help first, link rarely,
   follow each community's rules.
6. **Backlinks:** guest posts, HARO-style journalist requests (Qwoted,
   Featured), original data/surveys others will cite. Never buy links.

✅ **Checkpoint:** Search Console shows impressions growing month over month.

---

## Phase 7 — Monetize and optimize (Month 4 onward)

- **Track per-page earnings:** clicks (link manager) → conversions (network
  dashboards). Find your top 10 earning pages and improve them first.
- **A/B test** button text, table placement, and top-pick boxes.
- **Upgrade programs:** once a merchant drives sales via Amazon, apply to that
  brand's direct program and ask for a higher rate when you have volume.
- **Diversify income:** display ads (Ezoic → Mediavine ~50k sessions/mo →
  Raptive ~100k pageviews/mo; thresholds change, check current terms),
  sponsored reviews (disclosed), your own digital products.
- **Refresh content** older than 6–12 months; updated pages often jump in ranking.

---

## Phase 8 — Scale (Month 9 onward)

- **Hire writers** with genuine niche experience; you edit and add expertise.
  Build a style guide from your best articles first.
- **Systemize:** content calendar, SOPs for publishing, link checking, and updates.
- **Second site or expand the niche?** Usually expanding the proven site wins —
  launch site #2 only once site #1 is profitable and mostly systemized.
- **Exit option:** content sites sell for roughly 30–45× monthly profit on
  marketplaces (Empire Flippers, Motion Invest, Flippa). Keep clean records so
  the site is sellable.

---

## Compliance essentials (do not skip)

- **Disclose clearly** near the top of every page with affiliate links, not
  just in the footer (FTC requirement in the US; similar rules in UK/EU/Canada).
- **Follow each program's rules** — e.g. Amazon prohibits showing cached
  prices, using links in emails/PDFs, and requires its exact disclosure sentence.
- **No fake reviews or claims** of testing you didn't do. The FTC's 2024 rule
  on fake reviews carries real penalties.
- **Privacy:** cookie consent if you have EU/UK visitors; privacy policy that
  mentions affiliate cookies and analytics.

---

## 12-month roadmap at a glance

| Month | Focus | Target |
|---|---|---|
| 1 | Niche, programs, business setup, site live | 10 articles |
| 2–3 | Content clusters, email signup, Pinterest/social started | 30–40 articles |
| 4–6 | Keep publishing, first backlinks, apply to premium programs | 60 articles, first commissions |
| 7–9 | Optimize top pages, refresh content, test conversion | 80–100 articles, growing income |
| 10–12 | Display ads if eligible, consider writers, plan scale | Consistent monthly profit |

Next step: open `CHECKLIST.md` and start Phase 1 with
`templates/niche-scorecard.md`. Come back with your top 3 niche ideas and we
can score them together.
