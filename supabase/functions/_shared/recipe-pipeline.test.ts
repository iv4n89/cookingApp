import { hasRequestedIngredients } from './recipe-pipeline.ts';

function recipe(...names: string[]): Record<string, unknown> {
  return { ingredients: names.map((name) => ({ name })) };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test('el ingrediente pedido casa aunque el catálogo lo nombre con más palabras', () => {
  assert(
    hasRequestedIngredients(recipe('Palitos de cangrejo', 'Mayonesa'), ['cangrejo']),
    'cangrejo debería casar con palitos de cangrejo',
  );
  assert(
    hasRequestedIngredients(recipe('Ajo morado'), ['ajo']),
    'ajo debería casar con ajo morado',
  );
});

// Al revés no: pedir algo concreto y aceptar el genérico llenaba de disparates el catálogo real.
Deno.test('la receta puede concretar más lo pedido, pero no menos', () => {
  assert(
    !hasRequestedIngredients(recipe('Cebolla', 'Arroz'), ['morcilla de cebolla']),
    'morcilla de cebolla no se cumple solo con cebolla',
  );
  assert(
    !hasRequestedIngredients(recipe('Codorniz'), ['huevo de codorniz']),
    'huevo de codorniz no se cumple con codorniz',
  );
  assert(
    !hasRequestedIngredients(recipe('Mantequilla con sal'), ['mantequilla sin sal']),
    'mantequilla sin sal no se cumple con mantequilla con sal',
  );
});

Deno.test('una receta que no lleva lo pedido queda descartada', () => {
  assert(
    !hasRequestedIngredients(recipe('Salchichas', 'Patata', 'Cebolla'), ['palitos de cangrejo']),
    'las salchichas no deberían valer para una petición de palitos de cangrejo',
  );
});

Deno.test('se comparan palabras completas, no trozos', () => {
  assert(
    !hasRequestedIngredients(recipe('Panceta'), ['pan']),
    'pan no debería casar con panceta',
  );
  assert(
    !hasRequestedIngredients(recipe('Salchichas'), ['sal']),
    'sal no debería casar con salchichas',
  );
});

Deno.test('el plural del usuario casa con el singular del catálogo', () => {
  assert(
    hasRequestedIngredients(recipe('Garbanzo castellano', 'Espinacas'), ['garbanzos']),
    'garbanzos debería casar con Garbanzo castellano',
  );
  assert(
    hasRequestedIngredients(recipe('Lenteja roja'), ['lentejas']),
    'lentejas debería casar con Lenteja roja',
  );
});

Deno.test('los plurales de palabras acabadas en e o en z también casan', () => {
  assert(
    hasRequestedIngredients(recipe('Tomate pera'), ['tomates']),
    'tomates debería casar con Tomate pera',
  );
  assert(
    hasRequestedIngredients(recipe('Aceite de oliva virgen extra'), ['aceites']),
    'aceites debería casar con Aceite de oliva',
  );
  assert(
    hasRequestedIngredients(recipe('Arroz bomba'), ['arroces']),
    'arroces debería casar con Arroz bomba',
  );
  assert(
    hasRequestedIngredients(recipe('Nuez'), ['nueces']),
    'nueces debería casar con Nuez',
  );
});

Deno.test('concretar no es transformar el ingrediente', () => {
  assert(!hasRequestedIngredients(recipe('Nuez moscada'), ['nueces']), 'nuez moscada no es nuez');
  assert(
    !hasRequestedIngredients(recipe('Semilla de calabaza'), ['calabaza']),
    'semilla de calabaza no es calabaza',
  );
  assert(
    !hasRequestedIngredients(recipe('Vinagre de vino tinto'), ['vino tinto']),
    'vinagre de vino tinto no es vino tinto',
  );
  assert(
    hasRequestedIngredients(recipe('Nuez moscada'), ['nuez moscada']),
    'quien pide nuez moscada sí la quiere',
  );
  assert(
    hasRequestedIngredients(recipe('Harina de trigo'), ['harina']),
    'quien pide harina acepta harina de trigo',
  );
});

Deno.test('acortar el plural no confunde ingredientes distintos', () => {
  assert(!hasRequestedIngredients(recipe('Panceta'), ['panes']), 'panes no es panceta');
  assert(!hasRequestedIngredients(recipe('Tomatillo'), ['tomates']), 'tomates no es tomatillo');
  assert(!hasRequestedIngredients(recipe('Paté de cerdo'), ['patatas']), 'patatas no es paté');
});

Deno.test('con varios ingredientes pedidos hacen falta todos', () => {
  assert(
    hasRequestedIngredients(recipe('Bacalao', 'Garbanzos', 'Espinacas'), ['bacalao', 'garbanzos']),
    'la receta lleva los dos ingredientes pedidos',
  );
  assert(
    !hasRequestedIngredients(recipe('Bacalao', 'Patata'), ['bacalao', 'garbanzos']),
    'falta uno de los dos, no debería valer',
  );
});

Deno.test('sin ingredientes pedidos vale cualquier receta', () => {
  assert(hasRequestedIngredients(recipe('Salchichas'), []), 'sin petición no se filtra nada');
});

Deno.test('una receta sin ingredientes no cuela cuando se pide algo', () => {
  assert(
    !hasRequestedIngredients({}, ['cangrejo']),
    'sin lista de ingredientes no se puede afirmar que lleve lo pedido',
  );
});
