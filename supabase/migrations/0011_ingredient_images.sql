-- Bucket público para las imágenes de ingredientes (generadas con IA).
-- En ingredients.image_url se guarda la clave del objeto (p. ej. "<id>.jpg");
-- la app resuelve la URL pública con storage.getPublicUrl (portable entre entornos).
insert into storage.buckets (id, name, public)
values ('ingredient-images', 'ingredient-images', true)
on conflict (id) do nothing;
