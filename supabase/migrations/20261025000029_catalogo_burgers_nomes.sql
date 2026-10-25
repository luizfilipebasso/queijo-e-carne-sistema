-- Reconhecimento de hambúrgueres (conferência do dono, 25/10/2026). Antes, ficavam fora da contagem:
--   * nomes do totem com número na frente ("9. Double Flip", "1. Queijo e Carne (...)") → o número é ignorado;
--   * "Queijo e Carne (Cheddar ou Mussarela)" / "Queijo e Carne (Cheddar)" → o parêntese não era aceito;
--   * "2x burgers Double Cbb" (2 burgers) e "Chicken'n Cheese" (com apóstrofo);
--   * "Catupibacon" passa a contar como hambúrguer (dono). "Burger doce" (sobremesa) continua fora (dono).

create or replace function private.classificar(p_unidade text, p_descricao text)
returns table(grupo text, nome text, unidades integer)
language sql stable set search_path = ''
as $function$
  select c.grupo, coalesce(c.nome, p_descricao), c.unidades
  from public.catalogo c
  where c.unidade = p_unidade
    and regexp_replace(p_descricao, '^\s*\d+\s*[.)-]\s*', '') ~* c.padrao
  order by c.ordem
  limit 1
$function$;

update public.catalogo set padrao = '^2x (burgers )?double cbb' where grupo = 'burger' and padrao = '^2x double cbb';
update public.catalogo set padrao = '^chicken' where grupo = 'burger' and padrao = '^chicken (n|ch)';
update public.catalogo set padrao = '^queijo e carne( \(.*\)| cheddar| mussarela)?$'
where grupo = 'burger' and padrao = '^queijo e carne( cheddar| mussarela)?$';

insert into public.catalogo (unidade, ordem, padrao, grupo, nome, unidades)
select codigo, 32, '^catupi ?bacon', 'burger', 'Catupibacon', 1 from public.unidades;
