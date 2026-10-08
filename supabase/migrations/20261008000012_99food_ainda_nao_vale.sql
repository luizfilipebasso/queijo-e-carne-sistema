-- A nota do 99food ainda não está valendo (decisão do dono, 08/10/2026): só o iFood conta.
-- A meta fica guardada com início em 2099; enquanto não vale, o site esconde o 99food
-- (Desempenho e Lançamentos) e ele não entra no prêmio.
-- Quando começar: update public.metas set vale_a_partir_de = 'AAAA-MM-01' where indicador = 'f99';
update public.metas set vale_a_partir_de = date '2099-01-01' where indicador = 'f99';
