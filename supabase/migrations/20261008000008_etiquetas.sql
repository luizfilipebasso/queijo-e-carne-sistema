-- Etiquetas de validade de insumos (impressora Niimbot B1), adaptado do pacote do dono (08/10/2026).
-- Decisões do dono:
--   * a aba Etiquetas aparece só para funcionários (o site controla isso);
--   * insumos e responsáveis NÃO são cadastrados pelo site: só por SQL, a pedido do dono;
--   * o histórico de impressões não pode ser apagado pelo site (registro para a vigilância sanitária).
-- Os nomes dos responsáveis não ficam neste arquivo (repositório público): são inseridos direto no banco.

-- ---------- Insumos ----------
create table public.etiqueta_insumos (
  id uuid primary key default gen_random_uuid(),
  unidade text not null references public.unidades (codigo),
  nome text not null check (length(trim(nome)) > 0),
  categoria text not null check (categoria in
    ('Padaria', 'Proteínas', 'Hortifruti', 'Laticínios', 'Doces', 'Industrializados', 'Produção própria')),
  -- Formas de armazenamento com a validade de cada uma: [{"metodo": "refrigerado", "dias": 3}, ...]
  metodos jsonb not null check (jsonb_typeof(metodos) = 'array' and jsonb_array_length(metodos) between 1 and 3),
  criado_em timestamptz not null default now(),
  unique (unidade, nome)
);

-- ---------- Responsáveis (quem manipulou; não precisa ter login) ----------
create table public.etiqueta_responsaveis (
  id uuid primary key default gen_random_uuid(),
  unidade text not null references public.unidades (codigo),
  nome text not null check (length(trim(nome)) > 0),
  criado_em timestamptz not null default now(),
  unique (unidade, nome)
);

-- ---------- Histórico de impressões ----------
create table public.etiqueta_historico (
  id uuid primary key default gen_random_uuid(),
  unidade text not null references public.unidades (codigo),
  criado_em timestamptz not null default now(),
  insumo text not null,
  metodo text not null check (metodo in ('congelado', 'refrigerado', 'ambiente')),
  manipulado_em timestamptz not null,
  validade date not null,
  responsavel text not null,
  copias smallint not null check (copias between 1 and 50),
  impresso_por uuid default auth.uid() references auth.users (id) on delete set null
);
create index etiqueta_historico_recente on public.etiqueta_historico (unidade, criado_em desc);
create index etiqueta_historico_impresso_por on public.etiqueta_historico (impresso_por);

-- ---------- Regras de acesso (RLS) ----------
-- Quem tem vínculo na unidade vê as listas e o histórico e registra impressões.
-- Não há regra de inserir/alterar/apagar em insumos e responsáveis, nem de alterar/apagar o histórico:
-- pelo site isso é impossível; só por SQL.
alter table public.etiqueta_insumos enable row level security;
alter table public.etiqueta_responsaveis enable row level security;
alter table public.etiqueta_historico enable row level security;

create policy "quem é da unidade vê" on public.etiqueta_insumos for select to authenticated
using (private.pode_ver(unidade));
create policy "quem é da unidade vê" on public.etiqueta_responsaveis for select to authenticated
using (private.pode_ver(unidade));
create policy "quem é da unidade vê" on public.etiqueta_historico for select to authenticated
using (private.pode_ver(unidade));
create policy "quem é da unidade registra" on public.etiqueta_historico for insert to authenticated
with check (private.pode_ver(unidade) and impresso_por = (select auth.uid()));

-- ---------- Insumos iniciais (lista do pacote do dono), iguais nas duas unidades ----------
insert into public.etiqueta_insumos (unidade, nome, categoria, metodos)
select u.codigo, i.nome, i.categoria, i.metodos
from public.unidades u
cross join (values
  ('Alface Americana', 'Hortifruti', '[{"metodo": "refrigerado", "dias": 2}]'::jsonb),
  ('Tomate', 'Hortifruti', '[{"metodo": "refrigerado", "dias": 2}]'::jsonb),
  ('Cebola roxa', 'Hortifruti', '[{"metodo": "refrigerado", "dias": 2}]'::jsonb),
  ('Rúcula', 'Hortifruti', '[{"metodo": "refrigerado", "dias": 2}]'::jsonb),
  ('Cheddar fatiado', 'Laticínios', '[{"metodo": "refrigerado", "dias": 10}]'::jsonb),
  ('Cheddar cremoso', 'Produção própria', '[{"metodo": "refrigerado", "dias": 3}]'::jsonb),
  ('Cheddar bisnaga', 'Laticínios', '[{"metodo": "refrigerado", "dias": 3}]'::jsonb),
  ('Mussarela fatiado', 'Laticínios', '[{"metodo": "refrigerado", "dias": 7}]'::jsonb),
  ('Gorgonzola', 'Laticínios', '[{"metodo": "refrigerado", "dias": 10}, {"metodo": "congelado", "dias": 30}]'::jsonb),
  ('Bacon fatiado', 'Proteínas', '[{"metodo": "refrigerado", "dias": 5}]'::jsonb),
  ('Bacon em cubos', 'Proteínas', '[{"metodo": "refrigerado", "dias": 5}]'::jsonb),
  ('Carne bovina moída', 'Proteínas', '[{"metodo": "refrigerado", "dias": 2}]'::jsonb),
  ('Cebola caramelizada', 'Produção própria', '[{"metodo": "refrigerado", "dias": 5}, {"metodo": "congelado", "dias": 30}]'::jsonb),
  ('Maionese Artesanal', 'Produção própria', '[{"metodo": "refrigerado", "dias": 3}]'::jsonb),
  ('Maionese de Manjericão', 'Produção própria', '[{"metodo": "refrigerado", "dias": 3}]'::jsonb),
  ('Pão mini brioche', 'Padaria', '[{"metodo": "ambiente", "dias": 10}]'::jsonb),
  ('Pão mônaco', 'Padaria', '[{"metodo": "ambiente", "dias": 10}]'::jsonb),
  ('Pistache', 'Doces', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('M&M''s', 'Doces', '[{"metodo": "ambiente", "dias": 15}]'::jsonb),
  ('Chocolate ao leite', 'Doces', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('Chocolate branco', 'Doces', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('Doce de leite', 'Doces', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('Nutella', 'Doces', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('Óleo de soja', 'Industrializados', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('Leite integral', 'Laticínios', '[{"metodo": "refrigerado", "dias": 2}]'::jsonb),
  ('Mostarda', 'Industrializados', '[{"metodo": "refrigerado", "dias": 20}]'::jsonb),
  ('Barbecue', 'Industrializados', '[{"metodo": "refrigerado", "dias": 20}]'::jsonb),
  ('Sal', 'Industrializados', '[{"metodo": "ambiente", "dias": 30}]'::jsonb),
  ('Tempero verde', 'Hortifruti', '[{"metodo": "congelado", "dias": 30}]'::jsonb),
  ('Manjericão', 'Hortifruti', '[{"metodo": "congelado", "dias": 30}]'::jsonb),
  ('Picles', 'Industrializados', '[{"metodo": "refrigerado", "dias": 5}]'::jsonb),
  ('Vegetariano', 'Proteínas', '[{"metodo": "congelado", "dias": 60}]'::jsonb),
  ('Doritos', 'Industrializados', '[{"metodo": "ambiente", "dias": 1}]'::jsonb),
  ('Geleia de Pimenta', 'Industrializados', '[{"metodo": "refrigerado", "dias": 15}]'::jsonb)
) as i(nome, categoria, metodos);
