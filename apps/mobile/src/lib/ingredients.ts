import { supabase } from './supabase';

export interface CatalogIngredient {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
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

export async function listIngredients(): Promise<CatalogIngredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, category, image_url')
    .order('category')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as CatalogIngredient),
    image_url: resolveImageUrl((row as CatalogIngredient).image_url),
  }));
}
