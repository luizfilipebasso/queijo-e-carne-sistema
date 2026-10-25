-- Relatórios da Nutricionista (dono, 25/10/2026), nas duas unidades, desde outubro de 2026:
-- o prêmio passa a ser da Cozinha e da Produção (é a única bonificação da Produção); o Atendimento deixa de receber.
-- "publico" passa a aceitar uma lista de setores separados por vírgula (ex.: 'cozinha,producao').
-- "todos" continua = Cozinha e Atendimento (a Produção só recebe o que a cita pelo nome).
-- Setembro (metas desde 2026-01-01) fica como estava.

alter table public.metas drop constraint metas_publico_check;
alter table public.metas add constraint metas_publico_check check (
  publico ~ '^(todos|(cozinha|atendimento|producao)(,(cozinha|atendimento|producao))*)$');

update public.metas set publico = 'cozinha,producao'
where indicador = 'nutri' and vale_a_partir_de = date '2026-10-01';
