/**
 * Blog lookup for Nova's DM replies.
 *
 * Nova runs inside the app that owns `blog_posts`, so this reads the table
 * directly instead of calling the public /api/blog over HTTP — no network hop
 * per DM turn, no dependency on APP_BASE_URL being set, and it keeps working
 * if the public endpoint's shape changes.
 *
 * Matching is scored and thresholded deliberately. A naive "does any keyword
 * appear in the title" test matches almost every post, because nearly every
 * LervIT title contains "moving" or "Calgary" — Nova would then paste a
 * confident link to an unrelated article, which is worse for a customer than
 * sending no link at all. Returning null is the right answer most of the time.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { blogPosts } from '@shared/schema';
import { logger } from '../logger';

export interface BlogSuggestion {
  title: string;
  slug: string;
}

interface CandidatePost {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; posts: CandidatePost[] } | null = null;

// Ordinary filler, plus the words carried by nearly every LervIT post. Those
// last few are the important ones: "moving", "movers" and "calgary" are in
// most titles, so treating them as signal makes every post look relevant.
const STOPWORDS = new Set([
  'about', 'after', 'also', 'another', 'anything', 'around', 'back', 'because',
  'been', 'before', 'being', 'best', 'between', 'both', 'came', 'come', 'could',
  'does', 'doing', 'done', 'dont', 'down', 'each', 'even', 'ever', 'every',
  'from', 'gets', 'getting', 'give', 'goes', 'going', 'gone', 'good', 'guys',
  'have', 'having', 'hear', 'hello', 'help', 'here', 'hows', 'into', 'just',
  'keep', 'kind', 'know', 'like', 'look', 'looking', 'made', 'make', 'many',
  'maybe', 'mean', 'might', 'more', 'most', 'much', 'need', 'needs', 'next',
  'note', 'okay', 'once', 'only', 'other', 'over', 'people', 'please', 'really',
  'right', 'said', 'same', 'says', 'send', 'should', 'since', 'some', 'soon',
  'sorry', 'sure', 'take', 'tell', 'than', 'thanks', 'that', 'thats', 'their',
  'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think', 'this',
  'those', 'time', 'twice', 'under', 'until', 'used', 'using', 'very', 'want',
  'wanted', 'wants', 'well', 'were', 'what', 'whats', 'when', 'where', 'which',
  'while', 'will', 'with', 'wondering', 'work', 'would', 'your', 'youre',
  'guy', 'thank',
  // Domain-ubiquitous — present in most titles, so they cannot discriminate.
  'calgary', 'lervit', 'move', 'moved', 'moves', 'moving', 'mover', 'movers',
]);

// A title or tag hit is a real topic match, and a distinctive one is enough on
// its own — "reschedule" or "receipt" appears in exactly one title. Excerpt and
// category hits are weak hints that cannot carry a match by themselves.
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 3;
const EXCERPT_WEIGHT = 1;
const CATEGORY_WEIGHT = 1;
const MIN_SCORE = 3;

/**
 * Fold a word to a crude stem so "photos" matches "photo" and
 * "neighbourhood" matches "Neighbourhoods". Deliberately conservative: it
 * only touches trailing plurals, and leaves words ending in "ss" or shorter
 * than five characters alone so "safe" does not become "saf".
 */
function normalizeToken(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

/** Whole words only — substring matching made "late" hit "calculated". */
function toTokenSet(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.map(normalizeToken));
}

export function tokenizeQuestion(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z]+/g) ?? [];
  return Array.from(
    new Set(
      words
        .map(normalizeToken)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
    ),
  );
}

async function loadPosts(): Promise<CandidatePost[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.posts;

  const rows = await db
    .select({
      title: blogPosts.title,
      slug: blogPosts.slug,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      tags: blogPosts.tags,
    })
    .from(blogPosts)
    .where(eq(blogPosts.status, 'published'))
    .limit(200);

  const posts = rows.map((row) => ({
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ?? '',
    category: row.category ?? '',
    // tags is null on every migrated post today; joining handles both cases.
    tags: (row.tags ?? []).join(' '),
  }));

  cache = { at: now, posts };
  return posts;
}

/** Exported for testing — scores one post against pre-tokenized keywords. */
export function scorePost(
  keywords: string[],
  post: CandidatePost,
): { score: number; strongHit: boolean } {
  const title = toTokenSet(post.title);
  const tags = toTokenSet(post.tags);
  const excerpt = toTokenSet(post.excerpt);
  const category = toTokenSet(post.category);

  let score = 0;
  let strongHit = false;

  for (const keyword of keywords) {
    // Each keyword counts once, at its best available weight.
    if (title.has(keyword)) {
      score += TITLE_WEIGHT;
      strongHit = true;
    } else if (tags.has(keyword)) {
      score += TAG_WEIGHT;
      strongHit = true;
    } else if (excerpt.has(keyword)) {
      score += EXCERPT_WEIGHT;
    } else if (category.has(keyword)) {
      score += CATEGORY_WEIGHT;
    }
  }

  return { score, strongHit };
}

/**
 * The single best-matching published post, or null when nothing is a clear
 * topical match. Never throws — a DB hiccup must not break a DM reply.
 */
export async function findRelevantBlogPost(
  question: string,
): Promise<BlogSuggestion | null> {
  const keywords = tokenizeQuestion(question);
  if (keywords.length === 0) return null;

  try {
    const posts = await loadPosts();

    let best: { post: CandidatePost; score: number } | null = null;
    for (const post of posts) {
      const { score, strongHit } = scorePost(keywords, post);
      if (!strongHit || score < MIN_SCORE) continue;
      if (!best || score > best.score) best = { post, score };
    }

    if (!best) return null;

    return { title: best.post.title, slug: best.post.slug };
  } catch (err) {
    logger.warn({ err }, '[NovaBlog] blog lookup failed — replying without a link');
    return null;
  }
}
