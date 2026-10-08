-- Composição dos combos (pedido do dono para SP, 08/10/2026; a regra vale para as duas unidades):
--   * Bebidas com nomes parecidos viram uma só ("Coca-Cola Zero 350ml", "Coca cola Zero 350ml lata",
--     "Coca Cola Zero 350 Ml", "Refrigerante Coca-Cola Zero Açucar Garrafa 600ml" ...).
--   * "Refrigerante ..." passa a ser reconhecido como bebida.
--   * Adicional mais pedido: só os que têm preço (copo, canudo, gelo etc. são grátis e saem da lista).

-- Chave de agrupamento: minúsculas, sem acento, sem "refrigerante/lata/lt/garrafa/original/açúcar", "350 ml" = "350ml".
create function private.chave_bebida(p text) returns text
language sql immutable set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(lower(p), 'áàãâéêíóôõúç-', 'aaaaeeiooouc '),
          '^refrigerante\s+', ''),
        '\m(lata|lt|garrafa|original|acucar)\M', '', 'g'),
      '(\d+)\s*ml', '\1ml', 'g'),
    '\s+', ' ', 'g'))
$$;

-- Nome bonito a partir da chave: "coca cola zero 350ml" -> "Coca-Cola Zero 350ml".
create function private.nome_bebida(p_chave text) returns text
language sql immutable set search_path = ''
as $$
  select replace(replace(replace(replace(replace(replace(initcap(p_chave),
    'Coca Cola', 'Coca-Cola'), 'Agua', 'Água'), ' Com ', ' com '), ' Sem ', ' sem '), 'Gas', 'Gás'),
    'Guarana', 'Guaraná')
$$;

update public.catalogo
set padrao = '^(refrigerante )?(coca|fanta|sprite|[aá]gua|suco|monster|monter|guaran|h2oh|schweppes|2 latas)'
where grupo = 'bebida' and padrao = '^(coca|fanta|sprite|[aá]gua|suco|monster|monter|guaran|h2oh|schweppes|2 latas)';

do $$
declare
  v_def text := pg_get_functiondef('public.painel_mes(text,date)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    $a$select i.descricao as item, i.quantidade, e->>'descricao' as escolha, c.grupo, c.nome, c.unidades$a$,
    $b$select i.descricao as item, i.quantidade, e->>'descricao' as escolha, coalesce((e->>'preco')::numeric, 0) as preco, c.grupo, c.nome, c.unidades$b$);
  v_novo := replace(v_novo,
    $a$select escolha as nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo = 'bebida'
          group by escolha order by 2 desc limit 5$a$,
    $b$select private.nome_bebida(private.chave_bebida(escolha)) as nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo = 'bebida'
          group by private.chave_bebida(escolha) order by 2 desc limit 5$b$);
  v_novo := replace(v_novo,
    $a$select escolha as nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo is null
          group by escolha order by 2 desc limit 5$a$,
    $b$select (array_agg(escolha order by quantidade desc))[1] as nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo is null and preco > 0
          group by lower(escolha) order by 2 desc limit 5$b$);
  v_novo := replace(v_novo,
    $a$'adicionais_total', (select sum(quantidade) from escolhas where item in (select item from combos) and grupo is null),$a$,
    $b$'adicionais_total', (select sum(quantidade) from escolhas where item in (select item from combos) and grupo is null and preco > 0),$b$);
  if (length(v_novo) - length(replace(v_novo, 'preco > 0', ''))) / length('preco > 0') <> 2
     or position('chave_bebida' in v_novo) = 0 or position('as preco' in v_novo) = 0 then
    raise exception 'painel_mes: trechos dos combos não encontrados';
  end if;
  execute v_novo;
end
$$;
