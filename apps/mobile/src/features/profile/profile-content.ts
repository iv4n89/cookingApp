import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

type IconName = keyof typeof MaterialIcons.glyphMap;

export interface SettingItem {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
}

export const AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCrdXRNolt1wLPn3lGhvPoKWeWXJ4OSiO2GLXdvTW6h1GBkP6svm5WoYlq4myUT2z2rsGNmfr3wTk8DJl3_fQywUnrMf1iOdVKQCp4PEdWGUgqnDpq2p2BMx4G5aE3G_NwBn2mIUKJnDFi7mn0hcuMRgK1mTTN0k9BAJymh3C8cKizYRaemSnC_55g3Ig6ia_E7YqKAHhL0PO45UqciDeOGlHCUfZg0YT91A3C4Ji1YL4ZMxWsWe3X561WZG-GwBTRkuGQEitX0MLS2';

export const SETTINGS: SettingItem[] = [
  { icon: 'person', title: 'Información personal', subtitle: 'Actualiza nombre, email y preferencias' },
  {
    icon: 'favorite',
    title: 'Recetas favoritas',
    subtitle: 'Las que has guardado',
    onPress: () => router.push('/favoritos'),
  },
  {
    icon: 'history',
    title: 'Historial de recetas',
    subtitle: 'Lo que has cocinado',
    onPress: () => router.push('/historial'),
  },
  {
    icon: 'tune',
    title: 'Preferencias',
    subtitle: 'Gustos, alergias y necesidades',
    onPress: () => router.push('/preferencias'),
  },
];
