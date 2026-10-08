-- Etiquetas: o responsável é sempre quem está logado (pedido do dono, 08/10/2026).
-- O banco preenche o nome a partir do cadastro em "pessoas", ignorando o que vier do site.
-- A tabela etiqueta_responsaveis deixa de ser usada (fica guardada; remover só se o dono pedir).

create function private.etiqueta_responsavel_logado() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text;
begin
  select nome into v_nome from public.pessoas where user_id = (select auth.uid()) and ativo;
  if v_nome is null then
    raise exception 'Responsável não encontrado: faça login novamente.';
  end if;
  new.responsavel := v_nome;
  new.impresso_por := (select auth.uid());
  return new;
end
$$;
revoke all on function private.etiqueta_responsavel_logado() from public, anon, authenticated;

create trigger responsavel_logado before insert on public.etiqueta_historico
for each row execute function private.etiqueta_responsavel_logado();
