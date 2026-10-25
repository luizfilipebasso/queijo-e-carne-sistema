-- "Burgers vendidos" também em São Paulo (dono, 25/10/2026), desde outubro de 2026, para todos:
-- meta 3.500 → R$ 60; super meta 4.000 → R$ 120 (mesmo prêmio de SM).
insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico)
values ('SP', 'burgers', date '2026-10-01', 3500, 4000, true, 60, 120, 'todos');
