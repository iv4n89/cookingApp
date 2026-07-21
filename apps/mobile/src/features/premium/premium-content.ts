import { MaterialIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialIcons.glyphMap;

export type Plan = 'monthly' | 'yearly';

export interface Benefit {
  icon: IconName;
  title: string;
  text: string;
  tag: string;
}

export const HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA13SnPpTTbu4kEZLOofHxwBlENMcq3ccAuaj8rmgt6HV0pIbNn20YsczVaysCBWbLW6sLFYhxr0zrBVYbhEcjirTOc3fUOQ6WNSQZVVf31S9z-GJaEP1x4-DUbTfSVWRe_a2skJnPBiCilNLIWe7ORlpSEFKtkHe8xqxR1nHZwMHbRJvDq3tgsTeN-_UGx0TWPY1u6KJoUVeZprFMzRyWup63XKIOL5uMbqisttNA_geUqyAZxVmz_-GsMMkOK5P1vVDz44uCj8AFF';

export const BENEFITS: Benefit[] = [
  {
    icon: 'auto-awesome',
    title: 'Generación de recetas con IA',
    text: 'Convierte cualquier conjunto de ingredientes en platos de nivel chef con nuestra inteligencia sous-chef.',
    tag: 'ENCAJA CON TUS MACROS',
  },
  {
    icon: 'kitchen',
    title: 'Despensa ilimitada',
    text: 'No pierdas la pista de ningún ingrediente. Alertas de caducidad y sugerencias de reposición en tiempo real.',
    tag: 'MARIDAJE SENSORIAL',
  },
  {
    icon: 'verified-user',
    title: 'Experiencia solo premium',
    text: 'Un entorno sin anuncios centrado en tu cocina. Sin distracciones, solo inspiración culinaria.',
    tag: 'PILAR CENTRAL',
  },
];
