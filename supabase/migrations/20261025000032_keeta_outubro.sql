-- Nota da Keeta (só SP) igual às outras plataformas a partir de outubro de 2026 (dono, 25/10/2026):
-- 4,90 → R$ 30; 4,95 → R$ 60. Setembro segue com 4,90/5,00 e R$ 25/50.
insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico)
values ('SP', 'keeta', date '2026-10-01', 4.90, 4.95, true, 30, 60, 'todos');
