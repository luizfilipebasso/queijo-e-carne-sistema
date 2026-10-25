-- Etiquetas (dono, 25/10/2026), nas duas unidades:
--   * nova categoria "Outros" com itens SEM validade (sem forma de armazenamento): a etiqueta sai com
--     o nome, a data e hora e o responsável. Itens: Consumos funcionários, Troca Fornecedor, Descarte;
--   * Nutella em temperatura ambiente passa a valer 3 meses (90 dias);
--   * saem "Barbecue bisnaga" e "Mostarda bisnaga".
--   ("Pão mini brioche", temperatura ambiente, 10 dias, já existia.)

alter table public.etiqueta_insumos drop constraint etiqueta_insumos_categoria_check;
alter table public.etiqueta_insumos add constraint etiqueta_insumos_categoria_check check (categoria in
  ('Padaria', 'Proteínas', 'Hortifruti', 'Laticínios', 'Doces', 'Industrializados', 'Produção própria', 'Outros'));
alter table public.etiqueta_insumos drop constraint etiqueta_insumos_metodos_check;
alter table public.etiqueta_insumos add constraint etiqueta_insumos_metodos_check
  check (jsonb_typeof(metodos) = 'array' and jsonb_array_length(metodos) between 0 and 3);

-- Impressão sem validade: forma de armazenamento e validade ficam em branco no histórico.
alter table public.etiqueta_historico alter column metodo drop not null;
alter table public.etiqueta_historico alter column validade drop not null;

insert into public.etiqueta_insumos (unidade, nome, categoria, metodos)
select u.codigo, n.nome, 'Outros', '[]'::jsonb
from public.unidades u
cross join (values ('Consumos funcionários'), ('Troca Fornecedor'), ('Descarte')) as n(nome);

update public.etiqueta_insumos set metodos = '[{"metodo": "ambiente", "dias": 90}]'::jsonb where nome = 'Nutella';

delete from public.etiqueta_insumos where nome in ('Barbecue bisnaga', 'Mostarda bisnaga');
