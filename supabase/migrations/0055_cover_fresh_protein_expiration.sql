-- Cobertura interina de caducidad para proteínas frescas añadidas al catálogo tras el seed
-- original (0007). El dataset de perfiles (packages/shared/src/data/ingredient-expiration-profiles.json)
-- cubre solo esos 331 ingredientes; el catálogo creció a 477 canónicos y estas carnes/pescados
-- quedaron sin perfil, así que nunca se marcaban como próximos a caducar.
--
-- Se mapean a perfiles seguros YA existentes (0049), sin ampliar ningún límite de seguridad.
-- Los productos secos/curados (carne seca, chalona, katsuobushi, camarón seco, cerdo chashu,
-- pescado ahumado) se dejan fuera a propósito: no son perecederos frescos y no deben avisar
-- como críticos. La reconciliación completa del catálogo con el dataset queda pendiente.

insert into public.ingredient_expiration_profiles (ingredient_id, profile_id, match_type)
select i.id, m.profile_id, m.match_type
from (
  values
    -- Carnes frescas
    ('carne de cerdo', 'meat-red-fresh', 'family'),
    ('carne de ternera para estofado', 'meat-red-fresh', 'family'),
    ('pella de cerdo', 'meat-red-fresh', 'fallback'),
    ('carne de pavo', 'meat-poultry-fresh', 'family'),
    ('carne picada de pollo', 'meat-poultry-fresh', 'family'),
    ('hueso de pollo', 'meat-poultry-fresh', 'fallback'),
    ('carne picada de ternera', 'meat-sausage-fresh', 'fallback'),
    -- Pescados y marisco frescos
    ('salmon', 'fish-fatty', 'family'),
    ('trucha', 'fish-fatty', 'family'),
    ('cangrejo', 'shellfish-crustacean', 'family'),
    -- Curados/deli: ventanas largas, seguros de mapear (no generan falsos críticos)
    ('bacon de pavo', 'meat-bacon', 'family'),
    ('jamon cocido', 'meat-cured-short', 'family'),
    ('jamon de pavo', 'meat-cured-short', 'family'),
    ('prosciutto di parma', 'meat-cured-ham', 'family')
) as m(normalized_name, profile_id, match_type)
join public.ingredients i on i.normalized_name = m.normalized_name
on conflict (ingredient_id) do nothing;
