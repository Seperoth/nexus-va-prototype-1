import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile } from "node:fs/promises";
const ids = {
  client: "11111111-1111-4111-8111-111111111111",
  staff: "22222222-2222-4222-8222-222222222222",
  admin: "33333333-3333-4333-8333-333333333333",
  other: "44444444-4444-4444-8444-444444444444",
};
let db: PGlite;
let ticketId: string;
let paymentId: string;
async function as(who: keyof typeof ids) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    ids[who],
  ]);
  await db.exec("set role authenticated");
}
async function command(who: keyof typeof ids, command: object) {
  await as(who);
  return db.query("select public.workspace_command($1::jsonb)", [
    JSON.stringify(command),
  ]);
}
async function rows<T = Record<string, unknown>>(sql: string) {
  await db.exec("reset role");
  return (await db.query<T>(sql)).rows;
}
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  // Minimal Supabase-owned schemas only; the application migration runs unmodified.
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    grant usage on schema auth,storage,public to authenticated,anon;
    grant execute on function auth.uid(),storage.foldername(text) to authenticated,anon;
    grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610270001_workspace.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [name, id] of Object.entries(ids))
    await db.query("insert into auth.users values($1,$2,$3)", [
      id,
      `${name}@test.example`,
      JSON.stringify({ name: `Test ${name}`, role: "admin" }),
    ]);
  await db.query(
    `update public.profiles set role='staff',"skillLevel"='Hard',"autoAssign"=true,skills=array['Content & marketing'] where id=$1`,
    [ids.staff],
  );
  await db.query(`update public.profiles set role='admin' where id=$1`, [
    ids.admin,
  ]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("Supabase migration and real PostgreSQL workflow", () => {
  it("does not grant privileged roles from signup metadata", async () => {
    const p = await rows<{ role: string }>(
      `select role from public.profiles where id='${ids.other}'`,
    );
    expect(p[0].role).toBe("client");
  });
  it("creates a request and initial pending payment atomically", async () => {
    await command("client", {
      type: "createTicket",
      title: "Create our content calendar",
      description: "Prepare a content calendar for our next product launch.",
      category: "Content & marketing",
      budget: 220,
      difficulty: "Medium",
      dueDate: "2099-01-01",
    });
    const t = await rows<{ id: string }>("select id from public.tickets");
    ticketId = t[0].id;
    const p = await rows<{ id: string; status: string }>(
      "select id,status from public.payments",
    );
    paymentId = p[0].id;
    expect(p[0].status).toBe("Pending");
  });
  it("enforces RLS for unrelated clients and prevents direct role or payment updates", async () => {
    await as("other");
    expect((await db.query("select * from public.tickets")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select * from public.payments")).rows).toHaveLength(
      0,
    );
    await expect(
      db.exec(`update public.profiles set role='admin'`),
    ).rejects.toThrow("permission denied");
    await expect(command("other", { type: "pay", paymentId })).rejects.toThrow(
      "Only the client",
    );
    await as("client");
    await expect(
      db.exec(`update public.payments set status='Paid'`),
    ).rejects.toThrow("permission denied");
  });
  it("automatically matches paid work to an available and skilled assistant", async () => {
    await command("client", { type: "pay", paymentId });
    const t = await rows<{ assigneeId: string; status: string }>(
      'select "assigneeId",status from public.tickets',
    );
    expect(t[0].assigneeId).toBe(ids.staff);
    expect(t[0].status).toBe("In progress");
    await expect(command("client", { type: "pay", paymentId })).rejects.toThrow(
      "outstanding",
    );
  });
  it("allows participants to message and creates staff payment tracking", async () => {
    await command("staff", {
      type: "sendMessage",
      ticketId,
      text: "I’m starting your calendar now.",
    });
    await expect(
      command("other", {
        type: "sendMessage",
        ticketId,
        text: "Unrelated account",
      }),
    ).rejects.toThrow("Messages require");
    await command("staff", {
      type: "createPayment",
      ticketId,
      amount: 30,
      description: "Additional agreed launch captions",
    });
    const p = await rows<{ id: string }>(
      `select id from public.payments where status='Pending'`,
    );
    await command("staff", { type: "verifyPayment", paymentId: p[0].id });
    await expect(
      command("staff", { type: "deliver", ticketId }),
    ).rejects.toThrow("paid");
    await command("client", { type: "pay", paymentId: p[0].id });
    await expect(
      command("staff", { type: "deliver", ticketId }),
    ).rejects.toThrow("Upload");
  });
  it("checks private upload ownership, delivers output, and records client satisfaction", async () => {
    const fileId = crypto.randomUUID();
    const path = `${ids.staff}/${fileId}/calendar.txt`;
    await db.exec("reset role");
    await db.query(
      `insert into storage.objects(bucket_id,name,owner_id) values('documents',$1,$2)`,
      [path, ids.staff],
    );
    await command("staff", {
      type: "addDocument",
      document: {
        id: fileId,
        ownerId: ids.staff,
        ticketId,
        name: "calendar.txt",
        size: 100,
        type: "text/plain",
        path,
        isOutput: true,
      },
    });
    await as("other");
    expect(
      (await db.query("select * from public.documents")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await command("staff", { type: "deliver", ticketId });
    await expect(
      command("staff", {
        type: "closeTicket",
        ticketId,
        rating: 5,
        feedback: "",
      }),
    ).rejects.toThrow("Only the client");
    await command("client", {
      type: "closeTicket",
      ticketId,
      rating: 5,
      feedback: "Exactly what we needed.",
    });
    const t = await rows<{ status: string; rating: number }>(
      "select status,rating from public.tickets",
    );
    expect(t[0]).toEqual({ status: "Completed", rating: 5 });
  });
  it("prevents calendar conflicts at the database level", async () => {
    const a = {
      type: "createAppointment",
      title: "Project catch-up",
      staffId: ids.staff,
      start: "2099-01-01T10:00:00Z",
      end: "2099-01-01T10:30:00Z",
      notes: "",
    };
    await command("client", a);
    await expect(command("other", a)).rejects.toThrow("overlaps");
  });
  it("exposes the audit trail to admins only", async () => {
    await as("client");
    expect((await db.query("select * from public.audit")).rows).toHaveLength(0);
    await as("admin");
    expect(
      (await db.query("select * from public.audit")).rows.length,
    ).toBeGreaterThan(7);
  });
});
