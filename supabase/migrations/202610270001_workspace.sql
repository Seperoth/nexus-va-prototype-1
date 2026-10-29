-- Nexus VA Prototype 1. Run once in a new Supabase project.
-- All mutations pass through workspace_command; clients cannot write tables directly.
create extension if not exists btree_gist;
create type public.account_role as enum ('client','staff','admin');
create type public.difficulty as enum ('Easy','Medium','Hard');
create type public.ticket_status as enum ('Open','In progress','In review','Completed');
create type public.payment_status as enum ('Pending','Verified','Paid');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (length(name) between 2 and 150), email text not null,
  role public.account_role not null default 'client', company text not null default '', bio text not null default '',
  status text not null default 'Active' check (status in ('Active','Suspended')),
  available boolean not null default true, "autoAssign" boolean not null default false,
  "skillLevel" public.difficulty not null default 'Easy', skills text[] not null default '{}'
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(), number bigint generated always as identity (start with 1001) unique,
  "clientId" uuid not null references public.profiles, "assigneeId" uuid references public.profiles,
  title text not null check (length(title) between 5 and 150), description text not null check (length(description) between 15 and 5000),
  category text not null, budget numeric(12,2) not null check (budget > 0 and budget <= 1000000),
  difficulty public.difficulty not null, status public.ticket_status not null default 'Open', "dueDate" date not null,
  "createdAt" timestamptz not null default now(), "deliveredAt" timestamptz, rating int check (rating between 1 and 5), feedback text not null default ''
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), "ticketId" uuid not null references public.tickets on delete cascade,
  "senderId" uuid not null references public.profiles, text text not null check (length(text) between 1 and 5000),
  "createdAt" timestamptz not null default now(), system boolean not null default false
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), "ticketId" uuid not null references public.tickets on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000), description text not null check (length(description) between 1 and 300),
  status public.payment_status not null default 'Pending', "createdAt" timestamptz not null default now(), "paidAt" timestamptz,
  simulated boolean not null default true check (simulated = true)
);
create unique index one_outstanding_payment on public.payments ("ticketId") where status <> 'Paid';
create table public.appointments (
  id uuid primary key default gen_random_uuid(), "clientId" uuid not null references public.profiles, "staffId" uuid not null references public.profiles,
  title text not null check (length(title) between 1 and 150), start timestamptz not null, "end" timestamptz not null, notes text not null default '',
  check ("end" > start and "end" - start <= interval '4 hours'),
  exclude using gist ("staffId" with =, tstzrange(start,"end",'[)') with &&),
  exclude using gist ("clientId" with =, tstzrange(start,"end",'[)') with &&)
);
create table public.documents (
  id uuid primary key, "ownerId" uuid not null references public.profiles, "ticketId" uuid references public.tickets,
  name text not null check (length(name) between 1 and 255), size bigint not null check (size > 0 and size <= 10485760), type text not null, path text not null unique,
  "createdAt" timestamptz not null default now(), reviewed boolean not null default false, "isOutput" boolean not null default false
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), "userId" uuid not null references public.profiles, text text not null,
  "createdAt" timestamptz not null default now(), read boolean not null default false
);
create table public.audit (
  id uuid primary key default gen_random_uuid(), "actorId" uuid not null references public.profiles,
  "ticketId" uuid references public.tickets, text text not null, "createdAt" timestamptz not null default now()
);
create index tickets_client_idx on public.tickets ("clientId");
create index tickets_assignee_idx on public.tickets ("assigneeId");
create index messages_ticket_idx on public.messages ("ticketId","createdAt");
create index payments_ticket_idx on public.payments ("ticketId");
create index documents_ticket_idx on public.documents ("ticketId");
create index notifications_user_idx on public.notifications ("userId","createdAt");

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A sign-up can never set a privileged role, status, or staff settings through metadata.
  insert into public.profiles(id,name,email) values (new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'New client'),150),coalesce(new.email,''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.current_role() returns public.account_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and status = 'Active';
$$;
create function public.can_access_ticket(ticket_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tickets t where t.id = ticket_id and public.current_role() is not null and
    (public.current_role() = 'admin' or t."clientId" = (select auth.uid()) or t."assigneeId" = (select auth.uid())));
$$;
create function public.can_review_document(document_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.documents d where d.id = document_id and
   (public.current_role() = 'admin' or (public.current_role() = 'staff' and
     (d."ticketId" is null or exists(select 1 from public.tickets t where t.id = d."ticketId" and t."assigneeId" = (select auth.uid()))))));
$$;

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.appointments enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (public.current_role() is not null and (id = (select auth.uid()) or role = 'staff' or public.current_role() = 'admin' or (public.current_role() = 'staff' and exists(select 1 from public.tickets t where t."clientId" = profiles.id and t."assigneeId" = (select auth.uid())))));
create policy tickets_read on public.tickets for select to authenticated using (public.can_access_ticket(id) or (public.current_role() = 'staff' and "assigneeId" is null));
create policy messages_read on public.messages for select to authenticated using (public.can_access_ticket("ticketId"));
create policy payments_read on public.payments for select to authenticated using (public.can_access_ticket("ticketId"));
create policy appointments_read on public.appointments for select to authenticated using (public.current_role() is not null and ("clientId" = (select auth.uid()) or "staffId" = (select auth.uid()) or public.current_role() = 'admin'));
create policy documents_read on public.documents for select to authenticated using (public.current_role() is not null and ("ownerId" = (select auth.uid()) or public.can_access_ticket("ticketId") or public.can_review_document(id)));
create policy notifications_read on public.notifications for select to authenticated using ("userId" = (select auth.uid()) and public.current_role() is not null);
create policy audit_read on public.audit for select to authenticated using (public.current_role() = 'admin');

-- No browser has direct INSERT/UPDATE/DELETE access. Even a changed client cannot bypass transition checks.
revoke all on public.profiles,public.tickets,public.messages,public.payments,public.appointments,public.documents,public.notifications,public.audit from anon,authenticated;
grant select on public.profiles,public.tickets,public.messages,public.payments,public.appointments,public.documents,public.notifications,public.audit to authenticated;

create function public.workspace_command(command jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles; t public.tickets; p public.payments; assistant public.profiles; d public.documents; a public.appointments;
  action text := command->>'type'; tid uuid; log_text text; body text; amount numeric; v_start timestamptz; v_end timestamptz;
  categories text[] := array['Administrative support','Content & marketing','Design & creative','Customer support','Research & data','Web & technology'];
  is_staff boolean; is_participant boolean;
begin
  select * into actor from public.profiles where id = auth.uid() and status = 'Active';
  if actor.id is null then raise exception 'An active account is required.'; end if;
  if command ? 'ticketId' then
    tid := (command->>'ticketId')::uuid;
    select * into t from public.tickets where id = tid for update;
    if t.id is null then raise exception 'Ticket not found.'; end if;
    is_participant := actor.role = 'admin' or t."clientId" = actor.id or t."assigneeId" = actor.id;
    is_staff := actor.role = 'admin' or (actor.role = 'staff' and t."assigneeId" = actor.id);
  end if;
  case action
  when 'createTicket' then
    if actor.role <> 'client' then raise exception 'Only clients can create requests.'; end if;
    if not (command->>'category' = any(categories)) then raise exception 'Select a valid service.'; end if;
    if (command->>'dueDate')::date < current_date then raise exception 'Choose today or a future due date.'; end if;
    insert into public.tickets("clientId",title,description,category,budget,difficulty,"dueDate")
      values(actor.id,trim(command->>'title'),trim(command->>'description'),command->>'category',(command->>'budget')::numeric,(command->>'difficulty')::public.difficulty,(command->>'dueDate')::date) returning * into t;
    tid := t.id;
    insert into public.payments("ticketId",amount,description) values(tid,t.budget,'Initial service budget — ' || t.title);
    insert into public.notifications("userId",text) select id,'New request: ' || t.title from public.profiles where role in ('staff','admin');
    log_text := 'Created a service request';
  when 'acceptTicket' then
    if actor.role <> 'staff' or t."assigneeId" is not null or t.status <> 'Open' then raise exception 'This request is no longer available.'; end if;
    if not actor.available or not(t.category = any(actor.skills)) or actor."skillLevel" < t.difficulty then raise exception 'Your availability, service skills, and difficulty level must match.'; end if;
    update public.tickets set "assigneeId" = actor.id,status = 'In progress' where id = tid;
    insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,actor.name || ' joined the conversation.',true);
    insert into public.notifications("userId",text) values(t."clientId",actor.name || ' is now working on ' || t.title);
    log_text := 'Accepted the service request';
  when 'assignTicket' then
    if actor.role <> 'admin' or t.status = 'Completed' or t."deliveredAt" is not null then raise exception 'Admin access and an unfinished request are required.'; end if;
    select * into assistant from public.profiles where id = (command->>'staffId')::uuid and role = 'staff' and status = 'Active';
    if assistant.id is null then raise exception 'Choose an active assistant.'; end if;
    update public.tickets set "assigneeId" = assistant.id,status = 'In progress' where id = tid;
    insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,assistant.name || ' joined the conversation.',true);
    insert into public.notifications("userId",text) values(assistant.id,'You have been assigned to ' || t.title),(t."clientId",assistant.name || ' is now working on ' || t.title);
    log_text := 'Assigned ' || assistant.name;
  when 'sendMessage' then
    if not coalesce(is_participant,false) or t."assigneeId" is null or t.status = 'Completed' then raise exception 'Messages require an assigned, open request.'; end if;
    insert into public.messages("ticketId","senderId",text) values(tid,actor.id,trim(command->>'text'));
    insert into public.notifications("userId",text) values(case when actor.id = t."clientId" then t."assigneeId" else t."clientId" end,'New message on ' || t.title);
  when 'createPayment' then
    if not coalesce(is_staff,false) or t."assigneeId" is null or t.status = 'Completed' then raise exception 'Only the assigned assistant or admin can request payment.'; end if;
    if exists(select 1 from public.payments where "ticketId" = tid and status <> 'Paid') then raise exception 'This request already has an outstanding payment.'; end if;
    amount := (command->>'amount')::numeric; body := trim(command->>'description');
    insert into public.payments("ticketId",amount,description) values(tid,amount,body);
    insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,'Payment requested: $' || amount || ' — ' || body,true);
    insert into public.notifications("userId",text) values(t."clientId",'A payment is ready for ' || t.title);
    log_text := 'Created payment tracking';
  when 'verifyPayment', 'pay' then
    -- Lock the ticket before payment consistently with every other ticket action.
    select "ticketId" into tid from public.payments where id = (command->>'paymentId')::uuid;
    select * into t from public.tickets where id = tid for update;
    select * into p from public.payments where id = (command->>'paymentId')::uuid for update;
    if p.id is null then raise exception 'Payment not found.'; end if;
    if action = 'verifyPayment' then
      if not(actor.role = 'admin' or (actor.role = 'staff' and t."assigneeId" = actor.id)) or p.status <> 'Pending' then raise exception 'Only staff can verify a pending request.'; end if;
      update public.payments set status = 'Verified' where id = p.id;
      insert into public.notifications("userId",text) values(t."clientId",'Payment verified and ready to pay: ' || t.title);
      log_text := 'Verified payment request';
    else
      if actor.id <> t."clientId" or p.status = 'Paid' or t.status = 'Completed' then raise exception 'Only the client can pay an outstanding request.'; end if;
      update public.payments set status = 'Paid',"paidAt" = now() where id = p.id;
      if t."assigneeId" is null then
        select * into assistant from public.profiles s where s.role = 'staff' and s.status = 'Active' and s.available and s."autoAssign" and s."skillLevel" >= t.difficulty and t.category = any(s.skills)
          order by (select count(*) from public.tickets x where x."assigneeId" = s.id and x.status <> 'Completed'),s.id limit 1 for update skip locked;
        if assistant.id is not null then
          update public.tickets set "assigneeId" = assistant.id,status = 'In progress' where id = tid;
          t."assigneeId" := assistant.id;
          insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,assistant.name || ' joined the conversation.',true);
          insert into public.notifications("userId",text) values(assistant.id,'You have been assigned to ' || t.title),(t."clientId",assistant.name || ' is now working on ' || t.title);
        end if;
      end if;
      insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,'Test payment confirmed. No real money was charged.',true);
      insert into public.notifications("userId",text) values(actor.id,'Test payment confirmed: ' || t.title);
      if t."assigneeId" is not null then insert into public.notifications("userId",text) values(t."assigneeId",'Payment received for ' || t.title); end if;
      log_text := 'Completed a simulated payment';
    end if;
  when 'deliver' then
    if not coalesce(is_staff,false) or t.status = 'Completed' then raise exception 'Only the assigned assistant can deliver this work.'; end if;
    if not exists(select 1 from public.payments where "ticketId" = tid) or exists(select 1 from public.payments where "ticketId" = tid and status <> 'Paid') then raise exception 'All payment requests must be paid before delivery.'; end if;
    if not exists(select 1 from public.documents where "ticketId" = tid and "isOutput") then raise exception 'Upload an output file before delivery.'; end if;
    update public.tickets set status = 'In review',"deliveredAt" = now() where id = tid;
    insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,'Your finished work is ready to review.',true);
    insert into public.notifications("userId",text) values(t."clientId",t.title || ' is ready for your review.');
    log_text := 'Delivered the output';
  when 'closeTicket' then
    if actor.id <> t."clientId" or t.status <> 'In review' or t."deliveredAt" is null then raise exception 'Only the client can close delivered work.'; end if;
    if exists(select 1 from public.payments where "ticketId" = tid and status <> 'Paid') then raise exception 'All payments must be paid before closing.'; end if;
    if (command->>'rating')::int not between 1 and 5 or command->>'rating' is null then raise exception 'Choose 1 to 5 stars.'; end if;
    update public.tickets set status = 'Completed',rating = (command->>'rating')::int,feedback = left(trim(coalesce(command->>'feedback','')),2000) where id = tid;
    insert into public.messages("ticketId","senderId",text,system) values(tid,actor.id,'Request completed with a ' || (command->>'rating') || '-star rating.',true);
    insert into public.notifications("userId",text) values(t."assigneeId",actor.name || ' rated your work ' || (command->>'rating') || '/5.');
    log_text := 'Closed the ticket and left feedback';
  when 'saveProfile' then
    if exists(select 1 from jsonb_array_elements_text(command->'skills') s where not(s = any(categories))) then raise exception 'Choose valid service skills.'; end if;
    update public.profiles set name = trim(command->>'name'),company = left(trim(coalesce(command->>'company','')),200),bio = left(trim(coalesce(command->>'bio','')),1000),
      available = case when actor.role = 'staff' then (command->>'available')::boolean else available end,
      "autoAssign" = case when actor.role = 'staff' then (command->>'autoAssign')::boolean else "autoAssign" end,
      "skillLevel" = case when actor.role = 'staff' then (command->>'skillLevel')::public.difficulty else "skillLevel" end,
      skills = case when actor.role = 'staff' then array(select jsonb_array_elements_text(command->'skills')) else skills end where id = actor.id;
    log_text := 'Updated profile information';
  when 'createAppointment' then
    if actor.role <> 'client' then raise exception 'Only clients can book appointments.'; end if;
    select * into assistant from public.profiles where id = (command->>'staffId')::uuid and role = 'staff' and status = 'Active' and available for update;
    if assistant.id is null then raise exception 'Choose an available assistant.'; end if;
    v_start := (command->>'start')::timestamptz; v_end := (command->>'end')::timestamptz;
    if v_start < now() then raise exception 'Choose a future appointment.'; end if;
    insert into public.appointments("clientId","staffId",title,start,"end",notes) values(actor.id,assistant.id,trim(command->>'title'),v_start,v_end,left(coalesce(command->>'notes',''),2000));
    insert into public.notifications("userId",text) values(assistant.id,'New appointment: ' || (command->>'title'));
    log_text := 'Scheduled an appointment';
  when 'cancelAppointment' then
    select * into a from public.appointments where id = (command->>'appointmentId')::uuid for update;
    if a.id is null or not(actor.role = 'admin' or actor.id = a."clientId" or actor.id = a."staffId") then raise exception 'Appointment not found.'; end if;
    delete from public.appointments where id = a.id;
    insert into public.notifications("userId",text) values(case when actor.id = a."clientId" then a."staffId" else a."clientId" end,'Appointment cancelled: ' || a.title);
    log_text := 'Cancelled an appointment';
  when 'addDocument' then
    if (command->'document'->>'ownerId')::uuid <> actor.id then raise exception 'Upload owner must match your account.'; end if;
    tid := (command->'document'->>'ticketId')::uuid;
    if tid is not null then
      select * into t from public.tickets where id = tid for update;
      if t.id is null or not public.can_access_ticket(tid) or t.status = 'Completed' then raise exception 'You cannot upload to this ticket.'; end if;
      if (command->'document'->>'isOutput')::boolean and not(actor.role = 'admin' or (actor.role = 'staff' and t."assigneeId" = actor.id)) then raise exception 'Only the assigned assistant can upload output files.'; end if;
    elsif (command->'document'->>'isOutput')::boolean then raise exception 'Output files require a ticket.';
    end if;
    if split_part(command->'document'->>'path','/',1) <> actor.id::text then raise exception 'Invalid storage path.'; end if;
    if not exists(select 1 from storage.objects where bucket_id = 'documents' and name = command->'document'->>'path' and owner_id = actor.id::text) then raise exception 'Upload the file to storage first.'; end if;
    insert into public.documents(id,"ownerId","ticketId",name,size,type,path,"isOutput") values((command->'document'->>'id')::uuid,actor.id,tid,command->'document'->>'name',(command->'document'->>'size')::bigint,command->'document'->>'type',command->'document'->>'path',(command->'document'->>'isOutput')::boolean);
    log_text := 'Uploaded ' || (command->'document'->>'name');
  when 'reviewDocument' then
    select * into d from public.documents where id = (command->>'documentId')::uuid for update;
    if d.id is null or not public.can_review_document(d.id) then raise exception 'You cannot review this document.'; end if;
    update public.documents set reviewed = true where id = d.id;
    insert into public.notifications("userId",text) values(d."ownerId",d.name || ' has been reviewed.');
    tid := d."ticketId"; log_text := 'Reviewed ' || d.name;
  when 'readNotifications' then
    update public.notifications set read = true where "userId" = actor.id;
  else raise exception 'Unsupported action.';
  end case;
  if log_text is not null then insert into public.audit("actorId","ticketId",text) values(actor.id,tid,log_text); end if;
exception when exclusion_violation then raise exception 'This time overlaps an existing appointment. Please choose another time.';
end;
$$;

revoke execute on all functions in schema public from public,anon;
grant execute on function public.current_role(),public.can_access_ticket(uuid),public.can_review_document(uuid),public.workspace_command(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('documents','documents',false,10485760) on conflict(id) do nothing;
create policy document_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text and public.current_role() is not null and name !~* '\.(html?|svg|js|exe|bat|cmd|ps1)$');
create policy document_storage_select on storage.objects for select to authenticated using (bucket_id = 'documents' and public.current_role() is not null and ((storage.foldername(name))[1] = (select auth.uid())::text or exists(select 1 from public.documents d where d.path = name and (d."ownerId" = (select auth.uid()) or public.can_access_ticket(d."ticketId") or public.can_review_document(d.id)))));
-- A failed metadata insert can clean up only its own unregistered storage object.
create policy document_storage_cleanup on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text and not exists(select 1 from public.documents d where d.path = name));
