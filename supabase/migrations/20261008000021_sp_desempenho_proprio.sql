-- Desempenho próprio de São Paulo (decisões do dono, 08/10/2026). Santa Maria não muda.
--   1. Sem o indicador "aguardando entregador" (meta passa a valer só em 2099 = desligada).
--   2. Tempo de cozinha com entregas, balcão e salão (parâmetro cozinha_todos_os_tipos = 1); acima de 40 min fora.
--   3. Erros num indicador só ("erros", para todos): erros_gerais/custo_geral no lançamento diário;
--      as metas por setor de SP ficam desligadas. Desconto = custo ÷ (pessoas da Cozinha + do Atendimento).
--   4. Notas: iFood, Keeta e 99food (nova coluna nota_keeta; metas keeta e f99 valendo em SP).
-- Não havia lançamentos quando a mudança foi feita.

-- ---------- Metas e parâmetros ----------
alter table public.metas drop constraint metas_indicador_check;
alter table public.metas add constraint metas_indicador_check check (indicador in
  ('cmv', 'ifood', 'f99', 'keeta', 'nutri', 'erros', 'erros_cozinha', 'erros_atendimento',
   'aguardando', 'cozinha', 'ticket_balcao', 'ticket_delivery'));

update public.metas set vale_a_partir_de = date '2099-01-01'
where unidade = 'SP' and indicador in ('aguardando', 'erros_cozinha', 'erros_atendimento');
update public.metas set vale_a_partir_de = date '2026-01-01' where unidade = 'SP' and indicador = 'f99';

insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico) values
  ('SP', 'erros', date '2026-01-01', 1.5, 0.8, false, 50, 100, 'todos'),
  ('SP', 'keeta', date '2026-01-01', 4.9, 5.0, true, 25, 50, 'todos');

insert into public.parametros (unidade, chave, vale_a_partir_de, valor) values
  ('SP', 'cozinha_todos_os_tipos', date '2026-10-01', 1);

-- ---------- Lançamentos ----------
alter table public.erros_diarios
  add column erros_gerais integer not null default 0 check (erros_gerais >= 0),
  add column custo_geral numeric(10, 2) not null default 0 check (custo_geral >= 0);
alter table public.notas_quinzena
  add column nota_keeta numeric(3, 2) check (nota_keeta between 0 and 5);

-- ---------- Cálculos ----------
do $$
declare
  v_def text;
  v_novo text;
begin
  -- indicadores_mes
  v_def := pg_get_functiondef('public.indicadores_mes(text,date)'::regprocedure);
  v_novo := replace(v_def,
    $a$      from entregas where seg_cozinha is not null),$a$,
    $b$      from public.saipos_vendas
      where unidade = p_unidade and data between v_inicio and v_fim and not cancelada and not fiado
        and (tipo = 'delivery' or coalesce(private.parametro(p_unidade, 'cozinha_todos_os_tipos', v_fim), 0) = 1)
        and seg_cozinha is not null),
    'cozinha_todos_os_tipos', coalesce(private.parametro(p_unidade, 'cozinha_todos_os_tipos', v_fim), 0) = 1,$b$);
  v_novo := replace(v_novo,
    $a$'custo_atendimento', coalesce(sum(custo_atendimento), 0))
      from erros),$a$,
    $b$'custo_atendimento', coalesce(sum(custo_atendimento), 0),
        'qtd_geral', coalesce(sum(erros_gerais), 0),
        'custo_geral', coalesce(sum(custo_geral), 0))
      from erros),$b$);
  v_novo := replace(v_novo,
    $a$'nota_99food', nota_99food)$a$,
    $b$'nota_99food', nota_99food, 'nota_keeta', nota_keeta)$b$);
  if (length(v_novo) - length(replace(v_novo, 'cozinha_todos_os_tipos', ''))) / length('cozinha_todos_os_tipos') <> 3
     or position('qtd_geral' in v_novo) = 0 or position('nota_keeta' in v_novo) = 0 then
    raise exception 'indicadores_mes: trechos não encontrados';
  end if;
  execute v_novo;

  -- comparativo_mes
  v_def := pg_get_functiondef('public.comparativo_mes(date)'::regprocedure);
  v_novo := replace(v_def,
    $a$ as limite_ag$a$,
    $b$ as limite_ag,
      coalesce(private.parametro(codigo, 'cozinha_todos_os_tipos', v_fim), 0) = 1 as cozinha_todos$b$);
  v_novo := replace(v_novo, $a$select v.*, u.limite, u.limite_ag from$a$, $b$select v.*, u.limite, u.limite_ag, u.cozinha_todos from$b$);
  v_novo := replace(v_novo,
    $a$filter (where v.tipo = 'delivery' and not v.fiado and v.seg_cozinha <= v.limite)$a$,
    $b$filter (where (v.tipo = 'delivery' or v.cozinha_todos) and not v.fiado and v.seg_cozinha <= v.limite)$b$);
  v_novo := replace(v_novo,
    $a$filter (where tipo = 'delivery' and not fiado and seg_cozinha <= limite)$a$,
    $b$filter (where (tipo = 'delivery' or cozinha_todos) and not fiado and seg_cozinha <= limite)$b$);
  v_novo := replace(v_novo,
    $a$sum(e.erros_atendimento) as qtd_atendimento,$a$,
    $b$sum(e.erros_atendimento) as qtd_atendimento, sum(e.erros_gerais) as qtd_geral,$b$);
  v_novo := replace(v_novo,
    $a$        'metas', private.metas_vigentes(l.unidade, v_fim)$a$,
    $b$        'erros_pct', (select case when e.dias > 0 and l.pedidos > 0 then round((e.qtd_cozinha + e.qtd_atendimento + e.qtd_geral) * 100.0 / l.pedidos, 2) end from erros e where e.unidade = l.unidade),
        'metas', private.metas_vigentes(l.unidade, v_fim)$b$);
  v_novo := replace(v_novo,
    $a$then round((select sum(qtd_atendimento) from erros) * 100.0 / count(*), 2) end$a$,
    $b$then round((select sum(qtd_atendimento) from erros) * 100.0 / count(*), 2) end,
        'erros_pct', case when (select sum(dias) from erros) > 0 and count(*) > 0
                       then round((select sum(qtd_cozinha + qtd_atendimento + qtd_geral) from erros) * 100.0 / count(*), 2) end$b$);
  if (length(v_novo) - length(replace(v_novo, 'cozinha_todos', ''))) / length('cozinha_todos') <> 5
     or (length(v_novo) - length(replace(v_novo, 'qtd_geral', ''))) / length('qtd_geral') <> 3 then
    raise exception 'comparativo_mes: trechos não encontrados';
  end if;
  execute v_novo;
end
$$;
