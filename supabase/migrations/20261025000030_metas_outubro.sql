-- Novas metas e prêmios (dono, 25/10/2026), valendo a partir de outubro de 2026, nas duas unidades.
-- Cada unidade recebe a meta nova só dos indicadores que ela usa (SP continua sem aguardando e sem erros
-- por setor; Keeta de SP não muda). As metas antigas (desde 2026-01-01) ficam valendo para setembro.
--   Aguardando entregador  3:00 → R$ 60 | 2:45 → R$ 120
--   Cozinha / Tempo prep.  7:30 → R$ 60 | 6:30 → R$ 120
--   Erros (todas as formas) 0,80% → R$ 60 | 0,50% → R$ 120
--   CMV                    36% → R$ 60 | 35% → R$ 120
--   iFood e 99food         4,90 → R$ 30 | 4,95 → R$ 60 (cada)
--   Nutricionista (cada visita) ≥ 85% → R$ 30 | ≥ 95% → R$ 60
-- Também liga o 99food em Santa Maria (estava com início em 2099 = desligado).

insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico)
select atual.unidade, n.indicador, date '2026-10-01', n.meta, n.super_meta, atual.maior_melhor, n.premio_meta, n.premio_super, atual.publico
from (values
  ('aguardando',        180,   165,   60, 120),
  ('cozinha',           450,   390,   60, 120),
  ('erros',             0.8,   0.5,   60, 120),
  ('erros_cozinha',     0.8,   0.5,   60, 120),
  ('erros_atendimento', 0.8,   0.5,   60, 120),
  ('cmv',               36,    35,    60, 120),
  ('ifood',             4.90,  4.95,  30, 60),
  ('f99',               4.90,  4.95,  30, 60),
  ('nutri',             85,    95,    30, 60)
) as n(indicador, meta, super_meta, premio_meta, premio_super)
cross join lateral (
  -- a meta que vale hoje em cada unidade (indicadores desligados, com início em 2099, ficam de fora)
  select distinct on (m.unidade) m.*
  from public.metas m
  where m.indicador = n.indicador and m.vale_a_partir_de <= date '2026-10-01'
  order by m.unidade, m.vale_a_partir_de desc
) as atual;

-- 99food em Santa Maria: deixa de estar desligado e passa a valer em outubro com os valores novos.
update public.metas
set vale_a_partir_de = date '2026-10-01', meta = 4.90, super_meta = 4.95, premio_meta = 30, premio_super = 60
where unidade = 'SM' and indicador = 'f99' and vale_a_partir_de = date '2099-01-01';
