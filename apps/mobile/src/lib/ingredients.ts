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

export async function listIngredients(): Promise<CatalogIngredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, category, image_url')
    .order('category')
    .order('name');
  if (error) throw error;
  return (data as CatalogIngredient[]) ?? [];
}
