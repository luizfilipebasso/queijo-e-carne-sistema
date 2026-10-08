-- SP: o prêmio do tempo de cozinha vale para todos (Cozinha e Atendimento trabalham praticamente juntos; dono, 08/10/2026).
update public.metas set publico = 'todos' where unidade = 'SP' and indicador = 'cozinha';
