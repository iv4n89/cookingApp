-- Descripción en inglés del plato emplatado, para generar su foto. El generador de imágenes
-- interpreta mal los nombres en español ("palitos de cangrejo" acababa dibujando aros de calamar),
-- así que la escribe el mismo LLM que crea la receta y se guarda para poder regenerar la imagen
-- después sin volver a pedirla.
alter table public.recipes add column if not exists image_prompt text;
