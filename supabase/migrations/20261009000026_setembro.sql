-- Setembro de 2026 carregado da Saipos para comparação (dono, 09/10/2026).
-- As regras de outubro passam a valer também em setembro, para a comparação ser justa:
-- limite de 30 min do aguardando, tempo de preparo de SP com todos os tipos e divisão dos erros por 7 e 3.
update public.parametros set vale_a_partir_de = date '2026-09-01'
where vale_a_partir_de = date '2026-10-01'
  and chave in ('aguardando_limite_seg', 'cozinha_todos_os_tipos', 'pessoas_erros_cozinha', 'pessoas_erros_atendimento');
-- Carga feita uma vez, fora da migração:
--   select private.agendar_dias(array(select d::date from generate_series(date '2026-09-01', date '2026-09-30', interval '1 day') d));
-- Durante a carga, saipos-processar-fila rodou a cada 15 segundos (cron.alter_job) e depois voltou para 1 minuto.
