# ARCHITECTURE_VISION.md

# Arquitectura objetivo

La aplicación se construye alrededor de un **motor de decisiones**, no
alrededor de la IA.

    Fuentes de datos
     ├─ Despensa
     ├─ Lista de la compra
     ├─ Grupo familiar
     ├─ Preferencias
     ├─ Recetas
     └─ Caducidades

            ↓

    Motor de recomendación
            ↓
    Motor conversacional (LLM)
            ↓
    Interfaz móvil

## Principios

1.  El backend decide; el LLM explica.
2.  La IA nunca busca recetas entre toda la base de datos.
3.  Siempre se priorizan recetas existentes frente a generación.
4.  Cada módulo tiene una única responsabilidad.
5.  La automatización reduce la fricción del usuario.

# Módulos

## Inventario

Responsable de: - despensa - entradas/salidas - tickets -
sincronización - niveles de confianza

## Recomendación

Responsable de: - búsqueda - filtros - scoring - ranking - búsqueda
semántica

Nunca conversa.

## Conversacional

Responsable de: - interpretar intención - responder preguntas - explicar
recomendaciones - adaptar recetas - generar recetas solo si no existen
candidatas

## Planificación

-   caducidades
-   menús
-   desperdicio
-   lista de la compra

# Flujo

Usuario → intención → backend → búsqueda → scoring → top N → LLM →
respuesta.

# Dominio

-   User
-   Family
-   Pantry
-   PantryItem
-   ShoppingList
-   ShoppingItem
-   Recipe
-   RecipeIngredient
-   Ingredient
-   Preference
-   Allergy
-   Diet
-   ExpirationProfile
-   Recommendation
-   Conversation

# Modelo de receta

Además de ingredientes:

-   embeddings
-   cocina
-   etiquetas
-   nutrición
-   tiempo
-   dificultad
-   coste
-   temporada
-   meal prep
-   congelable
-   utensilios

# Roadmap técnico

## Fase 1

-   Auditar arquitectura.
-   Detectar deuda técnica.
-   Revisar modelos.

## Fase 2

-   Separar motores.
-   Reducir lógica dentro del chat.

## Fase 3

-   Mejorar scoring.
-   Añadir embeddings.
-   Caducidades.
-   Predicción.

## Fase 4

-   Planificación semanal.
-   Estadísticas.
-   Comparador de supermercados.

# Reglas para Codex

-   No introducir lógica de negocio en prompts.
-   Mantener servicios pequeños.
-   Favorecer arquitectura hexagonal y casos de uso.
-   Toda recomendación debe ser reproducible sin IA.
-   La IA nunca es la fuente de verdad.
-   Diseñar para sustituir fácilmente el proveedor LLM.

# Objetivo final

Crear un copiloto de cocina que reduzca el esfuerzo diario del usuario y
tome decisiones inteligentes utilizando datos estructurados e IA
únicamente donde aporta valor.
