import 'server-only';
import { randomUUID } from 'node:crypto';
import { schema as s, type Tx } from '@/db';

/** Admin audit entries are written only here, inside the transaction of the change they describe. */
export async function recordAudit(tx: Tx, actor: string, action: string, target = '') {
  await tx.insert(s.adminAudit).values({ id: randomUUID(), actor: actor.slice(0, 100), action: action.slice(0, 120), target: target.slice(0, 200) });
}
