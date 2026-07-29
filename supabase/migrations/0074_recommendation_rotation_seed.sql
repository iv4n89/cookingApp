-- Variedad en la recomendación: una semilla por hogar y día sustituye al random() de 0062,
-- que barajaba solo dentro de las 31 candidatas ya elegidas y rebarajaba en cada refresco.
-- El corte de candidatas pasa a ser rotatorio, y la franja horaria se filtra al construir
-- el snapshot en vez de después del corte.

-- Convierte (semilla, clave) en una fracción estable de [0,1]. 7 dígitos hex = 28 bits,
-- que caben en un integer con signo sin desbordar.
create or replace function public.rotation_fraction(p_seed text, p_key text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (('x' || substr(md5(coalesce(p_seed, '') || coalesce(p_key, '')), 1, 7))::bit(28)::int)::numeric
    / 268435455;
$$;
