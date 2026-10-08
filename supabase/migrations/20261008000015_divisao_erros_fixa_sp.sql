-- São Paulo usa a mesma divisão fixa de Santa Maria (decisão do dono, 08/10/2026): Cozinha 7, Atendimento 3.
insert into public.parametros (unidade, chave, vale_a_partir_de, valor) values
  ('SP', 'pessoas_erros_cozinha', date '2026-10-01', 7),
  ('SP', 'pessoas_erros_atendimento', date '2026-10-01', 3);
