-- Enlaza despensa y lista al catálogo de ingredientes (nullable: los items
-- antiguos de texto libre siguen válidos; los nuevos referencian el catálogo).
alter table pantry_items add column ingredient_id uuid references ingredients (id) on delete set null;
alter table shopping_list_items add column ingredient_id uuid references ingredients (id) on delete set null;
create index pantry_items_ingredient_idx on pantry_items (ingredient_id);
create index shopping_list_items_ingredient_idx on shopping_list_items (ingredient_id);
