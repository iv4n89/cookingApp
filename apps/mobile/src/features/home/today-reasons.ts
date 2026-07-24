import type { RecommendationReasonCode } from '@recetas/shared';

// Human-readable Spanish label per reason code, for the featured recipe's "why".
const LABELS: Record<RecommendationReasonCode, string> = {
  ready_from_pantry: 'Lista con lo que tienes',
  uses_priority_ingredients: 'Aprovecha productos a punto de caducar',
  uses_consume_soon_ingredients: 'Aprovecha productos a consumir pronto',
  seasonal_fit: 'De temporada',
  meal_type_fit: 'Encaja con la franja',
  requires_shopping: 'Necesita comprar algo',
  unknown_ingredient: '',
  unsupported_unit: '',
};

export function reasonLabels(codes: string[]): string[] {
  return codes.map((code) => LABELS[code as RecommendationReasonCode] ?? '').filter(Boolean);
}
