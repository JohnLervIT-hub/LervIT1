import { db } from '../server/db';
import { leads } from '../shared/schema';
import { like } from 'drizzle-orm';

async function cleanup() {
  const result = await db.update(leads)
    .set({
      contactEmail: null,
      updatedAt: new Date()
    })
    .where(like(leads.contactEmail, '%adevinta.com%'));

  console.log('Cleaned adevinta leads:', result);
  process.exit(0);
}

cleanup().catch(console.error);
