import { supabase } from './supabase';

export interface CatalogIngredient {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  default_min_stock: number | null;
  default_unit: string | null;
}

// minúsculas y sin acentos, para búsqueda insensible a tildes.
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const IMAGE_BUCKET = 'ingredient-images';

// image_url guarda la clave del objeto en el bucket; la resolvemos a URL pública.
function resolveImageUrl(key: string | null): string | null {
  if (!key) return null;
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl;
}

export interface CatalogDefault {
  unit: string | null;
  min: number | null;
}

// Unidad y cantidad de compra por defecto de cada ingrediente del catálogo (por id).
export async function getCatalogDefaults(ids: string[]): Promise<Map<string, CatalogDefault>> {
  const map = new Map<string, CatalogDefault>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, default_unit, default_min_stock')
    .in('id', unique);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id as string, {
      unit: (row.default_unit as string | null) ?? null,
      min: row.default_min_stock == null ? null : Number(row.default_min_stock),
    });
  }
  return map;
}

export async function listIngredients(): Promise<CatalogIngredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, category, image_url, default_min_stock, default_unit')
    .order('category')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row as CatalogIngredient;
    return {
      ...item,
      image_url: resolveImageUrl(item.image_url),
      default_min_stock: item.default_min_stock == null ? null : Number(item.default_min_stock),
    };
  });
}

export type CanonicalMap = Map<string, string>; // varianteId -> canónicoId

// TTL del caché: un cambio de agrupación (canonical_id) en el servidor se refleja en, como mucho,
// este tiempo sin reiniciar la app. Antes se cacheaba para siempre por sesión y un reagrupamiento
// exigía cerrar y reabrir la app.
const CANONICAL_TTL_MS = 5 * 60 * 1000;
let canonicalCache: { map: CanonicalMap; at: number } | null = null;

// Mapa id->canónico de las variantes (canonical_id not null), cacheado con TTL. Si el fetch falla,
// conserva el mapa anterior (si lo hay) en vez de vaciarlo.
export async function getCanonicalMap(): Promise<CanonicalMap> {
  if (canonicalCache && Date.now() - canonicalCache.at < CANONICAL_TTL_MS) return canonicalCache.map;
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, canonical_id')
    .not('canonical_id', 'is', null);
  if (error) return canonicalCache?.map ?? new Map();
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id as string, row.canonical_id as string);
  canonicalCache = { map, at: Date.now() };
  return map;
}

// canon(id) = su canónico si es variante; el propio id si es canónico o desconocido.
export function canon(id: string, map: CanonicalMap): string {
  return map.get(id) ?? id;
}
