-- Santa Maria também tira da média do "aguardando entregador" as entregas com mais de 30 min esperando (dono, 08/10/2026).
insert into public.parametros (unidade, chave, vale_a_partir_de, valor) values
  ('SM', 'aguardando_limite_seg', date '2026-10-01', 1800);
