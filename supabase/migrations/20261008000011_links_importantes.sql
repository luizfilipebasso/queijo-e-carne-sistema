-- Aba "Links importantes" (só funcionários; pedido do dono, 08/10/2026).
-- Links do Google Drive, diferentes em cada unidade. Ficam no banco, não no código (repositório público).
-- Cadastro só por SQL, a pedido do dono (não há escrita pelo site). Começam sem endereço:
-- o dono avisa quando for liberar para a equipe e então os links reais são preenchidos.

create table public.links_importantes (
  id uuid primary key default gen_random_uuid(),
  unidade text not null references public.unidades (codigo),
  titulo text not null check (length(trim(titulo)) > 0),
  icone text not null default 'link',
  url text check (url ~ '^https://'),
  ordem smallint not null default 0,
  criado_em timestamptz not null default now(),
  unique (unidade, titulo)
);

alter table public.links_importantes enable row level security;
create policy "quem é da unidade vê" on public.links_importantes for select to authenticated
using (private.pode_ver(unidade));

insert into public.links_importantes (unidade, titulo, icone, ordem)
select u.codigo, l.titulo, l.icone, l.ordem
from public.unidades u
cross join (values
  ('Planilha de consumos', 'planilha', 1),
  ('Escala mensal', 'calendario', 2),
  ('Guia de montagem', 'burger', 3)
) l(titulo, icone, ordem);
