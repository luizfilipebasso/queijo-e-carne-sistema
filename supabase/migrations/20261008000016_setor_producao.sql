-- Setor "Produção" para funcionários (decisão do dono, 08/10/2026).
-- Não recebe incentivo nem entra na divisão dos erros; no site vê só Etiquetas e Links importantes.

alter table public.pessoa_unidades drop constraint pessoa_unidades_setor_check;
alter table public.pessoa_unidades add constraint pessoa_unidades_setor_check
  check (setor in ('cozinha', 'atendimento', 'producao'));
alter table public.pessoa_unidades drop constraint pessoa_unidades_setor_indicado_check;
alter table public.pessoa_unidades add constraint pessoa_unidades_setor_indicado_check
  check (setor_indicado in ('cozinha', 'atendimento', 'producao'));

create or replace function public.indicar_meu_setor(p_unidade text, p_setor text)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_setor not in ('cozinha', 'atendimento', 'producao') then
    raise exception 'Setor inválido.';
  end if;
  update public.pessoa_unidades set setor_indicado = p_setor
  where pessoa_id = private.minha_pessoa() and unidade = p_unidade and ativo and papel = 'funcionario';
end
$function$;
