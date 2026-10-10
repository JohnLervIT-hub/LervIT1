// Seed 23 curated blog posts (originally hardcoded in the marketing repo's
// src/data/blogData.ts) into the blog_posts table on the app DB.
//
// Idempotent on slug — safe to re-run. Preserves slugs so existing external
// links (Google, Bing, social) continue to resolve.
//
// Usage: npx tsx scripts/seed-blog-from-marketing.ts
//        npx tsx scripts/seed-blog-from-marketing.ts --slug=<slug>   # one post
//
// --slug narrows the run to a single post. Adding one post should not rewrite
// the other rows, which matters because the upsert below overwrites `image`.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../server/db';
import { blogPosts } from '../shared/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, 'data/curated-blog-posts.json');

type MarketingPost = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  category: string;
  readTime: string;
  image: string;
  publishDate: string;
  excerpt: string;
  sections: { h2: string; paragraphs: string[] }[];
  faq: { q: string; a: string }[];
  topCta: { text: string; href: string };
  bottomCta: { text: string; sub: string; href: string };
  related: string[];
  oldPath: string;
};

// The JSON carries site-relative image paths, but the images are hosted on the
// marketing site, not the app — so a relative path 404s on app.lervit.com.
// Migration 0043 rewrites them on boot; normalising here too means a re-run of
// this seed writes the same absolute URL instead of reverting every row to a
// relative path that stays broken until the next deploy.
const MARKETING_ORIGIN = 'https://lervit.com';

function toAbsoluteImage(image: string): string {
  return image.startsWith('/') ? `${MARKETING_ORIGIN}${image}` : image;
}

function sectionsToMarkdown(sections: MarketingPost['sections']): string {
  return sections
    .map(s => `## ${s.h2}\n\n${s.paragraphs.join('\n\n')}`)
    .join('\n\n');
}

async function seed() {
  const raw = readFileSync(DATA_PATH, 'utf8');
  const all = JSON.parse(raw) as MarketingPost[];

  const slugArg = process.argv.find(a => a.startsWith('--slug='))?.slice('--slug='.length);
  const posts = slugArg ? all.filter(p => p.slug === slugArg) : all;
  if (slugArg && posts.length === 0) {
    console.error(`No post in ${DATA_PATH} with slug "${slugArg}"`);
    process.exit(1);
  }
  if (slugArg) console.log(`Seeding single post: ${slugArg}`);

  let inserted = 0;
  let updated = 0;

  for (const post of posts) {
    const values = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: sectionsToMarkdown(post.sections),
      category: post.category,
      seoTitle: post.metaTitle,
      seoDescription: post.metaDescription,
      status: 'published' as const,
      publishedAt: new Date(post.publishDate),
      generatedBy: 'seed' as const,
      sections: post.sections,
      faq: post.faq,
      topCta: post.topCta,
      bottomCta: post.bottomCta,
      related: post.related,
      image: toAbsoluteImage(post.image),
      readTime: post.readTime,
      oldPath: post.oldPath,
    };

    const result = await db
      .insert(blogPosts)
      .values(values)
      .onConflictDoUpdate({
        target: blogPosts.slug,
        set: {
          title: values.title,
          excerpt: values.excerpt,
          content: values.content,
          category: values.category,
          seoTitle: values.seoTitle,
          seoDescription: values.seoDescription,
          publishedAt: values.publishedAt,
          sections: values.sections,
          faq: values.faq,
          topCta: values.topCta,
          bottomCta: values.bottomCta,
          related: values.related,
          image: values.image,
          readTime: values.readTime,
          oldPath: values.oldPath,
          updatedAt: new Date(),
        },
      })
      .returning({ id: blogPosts.id, createdAt: blogPosts.createdAt, updatedAt: blogPosts.updatedAt });

    const [row] = result;
    if (row.createdAt.getTime() === row.updatedAt.getTime()) inserted++;
    else updated++;
  }

  console.log(`Seed complete: ${inserted} inserted, ${updated} updated, ${posts.length} total`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
