-- Bucket público para las imágenes de receta (generadas con IA en segundo plano).
-- En recipes.image_url se guarda la URL pública ya resuelta (la usa la app directamente).
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;
