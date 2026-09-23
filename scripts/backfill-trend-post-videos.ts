/**
 * Give existing Instagram trend posts the Higgsfield video they never got.
 *
 * generate_trend_post only started auto-triggering video after this commit, so
 * Instagram posts drafted before it have copy and no B-roll.
 *
 * A social_posts row cannot hold a video — no videoUrl/providerJobId columns, and
 * the 30s poller in background-jobs only reads content_items. So "backfilling a
 * video" means creating the companion content_items row the live path now creates,
 * then submitting it to Higgsfield. The poller fills in videoUrl from there.
 *
 * Candidates are Instagram social_posts with no content_items row already carrying
 * their caption, so re-running this cannot double-submit.
 *
 * Run:
 *   tsx scripts/backfill-trend-post-videos.ts             # dry-run (SELECT only)
 *   tsx scripts/backfill-trend-post-videos.ts --execute   # create rows + submit
 */
import { db } from '../server/db';
import { socialPosts, contentItems } from '../shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { ember } from '../server/agents/ember';

async function main() {
  const execute = process.argv.includes('--execute');

  const posts = await db
    .select({
      id: socialPosts.id,
      content: socialPosts.content,
      hashtags: socialPosts.hashtags,
      status: socialPosts.status,
      createdAt: socialPosts.createdAt,
    })
    .from(socialPosts)
    .where(eq(socialPosts.platform, 'instagram'))
    .orderBy(desc(socialPosts.createdAt));

  // Already-videoed posts are the ones whose caption is on a higgsfield_video
  // content_items row — that's the only link the two tables have.
  const videoed = await db
    .select({ caption: contentItems.caption })
    .from(contentItems)
    .where(
      and(eq(contentItems.type, 'higgsfield_video'), eq(contentItems.platform, 'instagram')),
    );
  const videoedCaptions = new Set(videoed.map((v) => (v.caption ?? '').trim()).filter(Boolean));

  const candidates = posts.filter((p) => !videoedCaptions.has(p.content.trim()));

  console.log(`Instagram social posts:        ${posts.length}`);
  console.log(`Already have a video item:     ${posts.length - candidates.length}`);
  console.log(`Missing a video (candidates):  ${candidates.length}\n`);

  for (const p of candidates) {
    console.log(`  - [${p.id}] status=${p.status} created=${p.createdAt?.toISOString()}`);
    console.log(`    ${p.content.slice(0, 90).replace(/\n/g, ' ')}`);
  }

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to create video items and submit them.');
    process.exit(0);
  }

  let submitted = 0;
  for (const p of candidates) {
    const [videoItem] = await db
      .insert(contentItems)
      .values({
        type: 'higgsfield_video',
        platform: 'instagram',
        status: 'draft',
        caption: p.content,
        hashtags: p.hashtags,
        generator: 'higgsfield',
        aspectRatio: '9:16',
      })
      .returning();

    const res = await ember.generateHiggsfieldVideo({
      contentItemId: videoItem.id,
      prompt: `Calgary moving lifestyle, urban energy, professional movers, cinematic. ${p.content.slice(0, 50)}`,
    });

    if ('submitted' in res && res.submitted) {
      submitted++;
      console.log(`  submitted ${p.id} -> item ${videoItem.id} job ${res.jobId}`);
    } else {
      console.error(`  FAILED ${p.id} -> item ${videoItem.id}:`, res);
    }
  }

  console.log(`\nSubmitted ${submitted}/${candidates.length}. The 30s poller writes videoUrl as renders finish.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
