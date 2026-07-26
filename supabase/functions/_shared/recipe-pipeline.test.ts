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
    hasRequestedIngredients(recipe('Cangrejo'), ['palitos de cangrejo']),
    'palitos de cangrejo debería casar con cangrejo',
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
