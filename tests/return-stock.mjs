import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const request = '33333333-3333-4333-8333-333333333333';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.item_labels(id uuid primary key, name text not null, is_active boolean not null default true);
    insert into public.item_labels(id,name) values('${first}','마우스'),('${second}','가위');
    grant usage on schema public to service_role,anon,authenticated;
    grant select on public.item_labels to service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261126031548_return_stock_increment.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const call = (id, label=first) => db.query('select * from public.confirm_item_return($1,$2)',[id,label]);
  assert.equal((await call(request)).rows[0].quantity,1);
  assert.equal((await call(request)).rows[0].quantity,1);
  assert.equal((await db.query('select quantity from public.item_stock where label_id=$1',[first])).rows[0].quantity,1);
  await assert.rejects(call(request,second),e=>e.code==='22023');
  assert.equal((await db.query('select quantity from public.item_stock where label_id=$1',[second])).rows[0].quantity,0);
  await Promise.all(Array.from({length:10},(_,i)=>call(`44444444-4444-4444-8444-${String(i).padStart(12,'0')}`)));
  assert.equal((await db.query('select quantity from public.item_stock where label_id=$1',[first])).rows[0].quantity,11);
  await assert.rejects(call('55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999'),e=>e.code==='22023');
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.item_stock'),e=>e.code==='42501');
  await assert.rejects(call(request),e=>e.code==='42501');
  console.log('PASS: real PostgreSQL function +1, idempotent replay, conflicting label rollback, 10 increments, unknown label and anon denial');
} catch (error) { console.error(error.message, error.code); process.exitCode = 1; } finally { await db.close(); }
