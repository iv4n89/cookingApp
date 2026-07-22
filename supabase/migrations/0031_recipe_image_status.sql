-- Estado de la imagen de la receta para la UI: 'pending' (generándose, el cliente sondea),
-- 'ready' (hay image_url), 'none' (no habrá: variante de chat o generación fallida -> placeholder).
alter table recipes add column image_status text not null default 'pending';
-- Backfill de las existentes: listo si ya hay imagen, si no 'none' (no reintentan).
update recipes set image_status = case when image_url is not null then 'ready' else 'none' end;
