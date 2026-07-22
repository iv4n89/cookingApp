import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useSession } from '@/lib/auth';
import { getCanonicalMap, type CanonicalMap } from '@/lib/ingredients';
import type { RecipeIngredient } from '@/lib/recipes';
import type { ShoppingItem } from '@/lib/shopping';
import { applyPlan, buildPlan, loadTargets, planPending, type ShoppingTarget } from '@/lib/shopping-plan';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Botón de "añadir lo que falta" con estado según la lista de la compra actual: queda como
// "Añadido" si todo lo que falta ya está en la lista (con cantidad suficiente); si no, al
// pulsar añade solo lo que no esté y sube las cantidades que no lleguen a lo que pide la receta.
export function AddMissingButton({ missing }: { missing: RecipeIngredient[] }) {
  const { session } = useSession();
  const [targets, setTargets] = useState<ShoppingTarget[] | null>(null);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canonMap, setCanonMap] = useState<CanonicalMap>(new Map());

  useEffect(() => {
    let active = true;
    getCanonicalMap()
      .then((data) => {
        if (active) setCanonMap(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Clave estable del contenido de `missing` (que se recalcula en cada render).
  const missingKey = missing
    .map((m) => `${m.name}|${m.quantity}|${m.unit}|${m.ingredient_id ?? ''}`)
    .join('~');

  const load = useCallback(() => {
    let active = true;
    if (missing.length === 0) {
      setTargets([]);
      return () => {
        active = false;
      };
    }
    loadTargets(missing)
      .then((data) => {
        if (active) {
          setTargets(data.targets);
          setShopping(data.shopping);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  useFocusEffect(load);

  if (missing.length === 0) {
    return (
      <View className="items-center border border-outline-variant bg-surface py-gutter">
        <Text className="font-mono-medium text-label-md text-on-surface-variant">
          YA TIENES TODO LO NECESARIO
        </Text>
      </View>
    );
  }

  const plan = targets ? buildPlan(targets, shopping, canonMap) : null;
  const pending = plan ? planPending(plan) : missing.length;
  const done = plan !== null && pending === 0;

  async function addMissing() {
    if (!session || !plan || adding || pending === 0) return;
    setAdding(true);
    setFailed(false);
    try {
      await applyPlan(session.user.id, plan);
      const data = await loadTargets(missing);
      setTargets(data.targets);
      setShopping(data.shopping);
    } catch {
      setFailed(true);
    } finally {
      setAdding(false);
    }
  }

  return (
    <View className="gap-stack-sm">
      {failed ? (
        <Text className="font-sans text-body-md text-error">No se pudo añadir. Inténtalo de nuevo.</Text>
      ) : null}
      <Pressable
        onPress={addMissing}
        disabled={done || adding || plan === null}
        className={`flex-row items-center justify-center gap-stack-md bg-primary py-gutter ${
          done || adding || plan === null ? 'opacity-60' : ''
        }`}>
        {adding ? (
          <ActivityIndicator color={colors['on-primary']} />
        ) : (
          <MaterialIcons
            name={done ? 'check' : 'add-shopping-cart'}
            size={18}
            color={colors['on-primary']}
          />
        )}
        <Text className="font-mono-medium text-label-md text-on-primary">
          {done ? 'AÑADIDO A LA COMPRA' : adding ? 'AÑADIENDO…' : `AÑADIR LO QUE FALTA (${pending})`}
        </Text>
      </Pressable>
    </View>
  );
}
