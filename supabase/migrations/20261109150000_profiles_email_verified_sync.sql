-- "Mail validado" en el panel (Clientes y Usuarios de sistema).
--
-- profiles.email_verified_at casi nunca se llenaba: el trigger
-- prevent_client_privileged_updates revierte ese campo en cualquier UPDATE que
-- no haga un admin (incluido app/callback.tsx). Al 09/11/2026 había 349 cuentas
-- confirmadas en auth.users que figuraban sin validar en profiles.
-- La fuente de verdad es auth.users.email_confirmed_at: se copia una vez y un
-- trigger la mantiene sincronizada. Ambos usan app.privileged_bypass, la
-- excepción que ya contempla prevent_client_privileged_updates.

-- 1) Backfill (sin tocar updated_at: es una corrección, no un cambio del cliente).
alter table public.profiles disable trigger trg_profiles_updated_at;
select set_config('app.privileged_bypass', 'true', true);

update public.profiles p
set email_verified_at = u.email_confirmed_at
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is not null
  and p.email_verified_at is distinct from u.email_confirmed_at;

select set_config('app.privileged_bypass', 'false', true);
alter table public.profiles enable trigger trg_profiles_updated_at;

-- 2) Sincronización al confirmar (o cambiar) el mail.
create or replace function public.sync_profile_email_verified()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform set_config('app.privileged_bypass', 'true', true);
    update public.profiles
    set email_verified_at = new.email_confirmed_at
    where id = new.id
      and email_verified_at is distinct from new.email_confirmed_at;
    perform set_config('app.privileged_bypass', 'false', true);
  exception when others then
    -- Nunca debe romper la confirmación del mail.
    perform set_config('app.privileged_bypass', 'false', true);
    raise warning 'sync_profile_email_verified: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.sync_profile_email_verified();
