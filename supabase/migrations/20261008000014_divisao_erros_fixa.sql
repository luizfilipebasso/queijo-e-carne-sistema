-- Divisão do custo dos erros por número fixo de pessoas (decisão do dono, 08/10/2026):
-- em Santa Maria, Atendimento divide por 3 e Cozinha por 7 (nem todos têm login no sistema).
-- Fica em "parametros" (pessoas_erros_cozinha / pessoas_erros_atendimento, com "vale a partir de").
-- Sem o parâmetro (ex.: SP por enquanto), continua contando os funcionários cadastrados no setor.

insert into public.parametros (unidade, chave, vale_a_partir_de, valor) values
  ('SM', 'pessoas_erros_cozinha', date '2026-10-01', 7),
  ('SM', 'pessoas_erros_atendimento', date '2026-10-01', 3);

create or replace function private.pessoas_do_setor(p_unidade text, p_setor text, p_inicio date, p_fim date) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    private.parametro(p_unidade, 'pessoas_erros_' || p_setor, p_fim)::integer,
    (select count(*)::integer from public.pessoa_unidades v
     join public.pessoas p on p.id = v.pessoa_id
     where v.unidade = p_unidade and v.papel = 'funcionario' and v.setor = p_setor
       and v.data_inicio <= p_fim
       and (v.data_fim >= p_inicio or (v.data_fim is null and v.ativo and p.ativo))))
$$;
