-- Cobertura del catálogo por ingrediente canónico: cuántas recetas usan cada uno. Es a la vez la
-- lista de trabajo de la generación dirigida de la fase B (el 24 de julio había 217 canónicos sin
-- ninguna receta, y el brócoli no aparecía en ninguna de las 504) y la métrica para saber si el
-- hueco se cierra. Se cuenta por canónico, coalesce(canonical_id, id), porque así se cruzan
-- despensa y recetas en el resto del esquema; contar por variante daría una cobertura inventada.

create view public.ingredient_recipe_coverage
with (security_invoker = true) as
with recipe_canonical_ingredients as (
  -- distinct: una receta que menciona dos variantes del mismo canónico cuenta una vez, no dos.
  -- El join descarta las filas sin ingredient_id, que no se pueden atribuir a ningún canónico.
  select distinct
    r.id as recipe_id,
    r.reusable,
    coalesce(i.canonical_id, i.id) as canonical_ingredient_id
  from public.recipes r
  cross join lateral jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) as ing(value)
  join public.ingredients i on i.id = (ing.value->>'ingredient_id')::uuid
)
select
  canonical.id as ingredient_id,
  canonical.name,
  canonical.category,
  count(usage.recipe_id) as recipe_count,
  count(usage.recipe_id) filter (where usage.reusable) as reusable_recipe_count
from public.ingredients canonical
-- left join: los ingredientes sin ninguna receta son justamente la lista de trabajo.
left join recipe_canonical_ingredients usage
  on usage.canonical_ingredient_id = canonical.id
where canonical.canonical_id is null
group by canonical.id, canonical.name, canonical.category;

-- Supabase concede select por defecto a los objetos nuevos de public: hay que revocarlo.
revoke all on public.ingredient_recipe_coverage from anon, authenticated;
grant select on public.ingredient_recipe_coverage to service_role;
