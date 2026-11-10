-- Insumos das etiquetas pela tela (dono, 10/11/2026): dono e gerente da unidade passam a cadastrar, alterar e
-- apagar insumos na aba Etiquetas → Insumos (antes era só por SQL). O histórico de impressões continua sem
-- poder ser alterado nem apagado pelo site.
create policy "equipe da unidade cadastra" on public.etiqueta_insumos for insert to authenticated
with check (private.eh_equipe(unidade));
create policy "equipe da unidade altera" on public.etiqueta_insumos for update to authenticated
using (private.eh_equipe(unidade)) with check (private.eh_equipe(unidade));
create policy "equipe da unidade apaga" on public.etiqueta_insumos for delete to authenticated
using (private.eh_equipe(unidade));

-- Como agora o conteúdo vem da tela, o banco confere cada forma de armazenamento:
-- método conhecido e validade entre 1 e 3650 dias.
alter table public.etiqueta_insumos add constraint etiqueta_insumos_metodos_validos check (
  not jsonb_path_exists(metodos,
    '$[*] ? (!(@.metodo == "congelado" || @.metodo == "refrigerado" || @.metodo == "ambiente") || @.dias.type() != "number" || @.dias < 1 || @.dias > 3650)'));
alter table public.etiqueta_insumos add constraint etiqueta_insumos_nome_tamanho check (length(nome) <= 60);

-- Ajuste aplicado em seguida (migração "insumos_metodos_validos_dias_obrigatorio"): método e dias são obrigatórios.
alter table public.etiqueta_insumos drop constraint etiqueta_insumos_metodos_validos;
alter table public.etiqueta_insumos add constraint etiqueta_insumos_metodos_validos check (
  not jsonb_path_exists(metodos,
    '$[*] ? (!exists(@.metodo) || !exists(@.dias) || !(@.metodo == "congelado" || @.metodo == "refrigerado" || @.metodo == "ambiente") || @.dias.type() != "number" || @.dias < 1 || @.dias > 3650)'));
