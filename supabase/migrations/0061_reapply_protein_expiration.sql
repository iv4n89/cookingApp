-- Re-aplica los mapeos de caducidad de proteínas frescas de 0055. En un entorno recién
-- migrado (cloud), 0055 corre antes de sembrar las recetas, cuando estos ingredientes aún no
-- existen (se crean al sembrar vía el resolver), así que su join no mapea nada. Reejecutar el
-- INSERT después de la siembra los cubre. Idempotente (on conflict do nothing); inocuo en local.

insert into public.ingredient_expiration_profiles (ingredient_id, profile_id, match_type)
select i.id, m.profile_id, m.match_type
from (
  values
    ('carne de cerdo', 'meat-red-fresh', 'family'),
    ('carne de ternera para estofado', 'meat-red-fresh', 'family'),
    ('pella de cerdo', 'meat-red-fresh', 'fallback'),
    ('carne de pavo', 'meat-poultry-fresh', 'family'),
    ('carne picada de pollo', 'meat-poultry-fresh', 'family'),
    ('hueso de pollo', 'meat-poultry-fresh', 'fallback'),
    ('carne picada de ternera', 'meat-sausage-fresh', 'fallback'),
    ('cerdo chashu', 'meat-red-fresh', 'fallback'),
    ('salmon', 'fish-fatty', 'family'),
    ('trucha', 'fish-fatty', 'family'),
    ('cangrejo', 'shellfish-crustacean', 'family'),
    ('pescado ahumado', 'meat-cured-short', 'fallback'),
    ('bacon de pavo', 'meat-bacon', 'family'),
    ('jamon cocido', 'meat-cured-short', 'family'),
    ('jamon de pavo', 'meat-cured-short', 'family'),
    ('prosciutto di parma', 'meat-cured-ham', 'family')
) as m(normalized_name, profile_id, match_type)
join public.ingredients i on i.normalized_name = m.normalized_name
on conflict (ingredient_id) do nothing;
