-- PDFs no próprio sistema (decisão do dono, 15/10/2026):
--   * Links importantes: Escala mensal e Guia de montagem passam a ser PDF guardados aqui;
--     a Planilha de consumos continua como link do Google Drive.
--   * Relatório da Nutricionista: o PDF é enviado junto com a nota em Lançamentos e aparece em
--     Links importantes (as 2 visitas do mês mais recente).
-- Os arquivos ficam no bucket privado "documentos", numa pasta por unidade (SM/…, SP/…).
-- Quem é da unidade abre (link assinado de poucos minutos); só dono e gerente da unidade enviam.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520, array['application/pdf']);

create policy "documentos: quem é da unidade abre" on storage.objects for select to authenticated
using (bucket_id = 'documentos' and private.pode_ver((storage.foldername(name))[1]));
create policy "documentos: equipe da unidade envia" on storage.objects for insert to authenticated
with check (bucket_id = 'documentos' and private.eh_equipe((storage.foldername(name))[1]));
create policy "documentos: equipe da unidade substitui" on storage.objects for update to authenticated
using (bucket_id = 'documentos' and private.eh_equipe((storage.foldername(name))[1]))
with check (bucket_id = 'documentos' and private.eh_equipe((storage.foldername(name))[1]));
create policy "documentos: equipe da unidade apaga" on storage.objects for delete to authenticated
using (bucket_id = 'documentos' and private.eh_equipe((storage.foldername(name))[1]));

-- Links importantes: caminho do PDF e quando foi enviado (sem envio, a tela mostra "Em breve").
alter table public.links_importantes
  add column arquivo text,
  add column arquivo_em timestamptz;
update public.links_importantes set arquivo = unidade || '/escala-mensal.pdf' where titulo = 'Escala mensal';
update public.links_importantes set arquivo = unidade || '/guia-de-montagem.pdf' where titulo = 'Guia de montagem';

-- Depois de subir o PDF, a equipe da unidade marca o envio (sem dar permissão de alterar o resto da linha).
create function public.marcar_arquivo_enviado(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.links_importantes set arquivo_em = now()
  where id = p_id and arquivo is not null and private.eh_equipe(unidade);
  if not found then raise exception 'Sem permissão para este link.'; end if;
end
$$;
revoke all on function public.marcar_arquivo_enviado(uuid) from public, anon;
grant execute on function public.marcar_arquivo_enviado(uuid) to authenticated;

-- Relatório da Nutricionista: caminho do PDF de cada visita.
alter table public.nutri_visitas add column arquivo text;
