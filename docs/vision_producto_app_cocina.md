# Informe de visión del producto y dirección del proyecto

## Objetivo del producto

El objetivo **no es crear una aplicación de recetas**.

El objetivo es crear un **asistente inteligente de cocina y gestión del hogar** que ayude al usuario a responder, cada día, a tres preguntas:

- ¿Qué puedo cocinar hoy?
- ¿Qué debería consumir antes de que se estropee?
- ¿Qué necesito comprar?

La IA es un medio para conseguir este objetivo, no el producto en sí.

---

## Propuesta de valor

La aplicación debe reducir la carga mental relacionada con la cocina.

> "Abro la aplicación durante 30 segundos y ya sé exactamente qué cocinar y qué comprar."

## Pilares del producto

### 1. Despensa inteligente

La despensa es el núcleo del sistema.

Debe actualizarse automáticamente mediante:

- Escaneo de tickets.
- Lista de la compra.
- Compra marcada como realizada.
- Lista compartida.
- Grupo familiar.
- Inicio/finalización de recetas.
- Ajustes manuales únicamente cuando sea necesario.

Objetivo: minimizar la fricción.

### 2. Lista de la compra

Debe estar completamente integrada con la despensa.

- Añadir automáticamente ingredientes faltantes desde recetas.
- Al marcar un producto como comprado pasa automáticamente a la despensa.
- Compartición en tiempo real.
- Sincronización entre miembros del grupo familiar.

### 3. Recetas

Las recetas son una herramienta para aprovechar la despensa.

Flujo principal:

**Despensa → recomendaciones → cocinar → actualizar despensa**

### 4. IA

La IA no sustituye al motor de búsqueda.

Debe utilizarse para:

- Recomendar.
- Conversar.
- Adaptar recetas.
- Resolver dudas.
- Generar recetas únicamente cuando no exista una adecuada.

## Filosofía del sistema de recetas

Prioridad:

1. Recetas existentes.
2. Adaptación de recetas existentes.
3. Generación completa mediante IA.

## Arquitectura recomendada

### Backend

Responsable de:

- Buscar recetas.
- Aplicar filtros.
- Calcular puntuaciones.
- Gestionar preferencias.
- Gestionar despensa y caducidades.

### IA

Recibe únicamente:

- Mejores recetas candidatas.
- Contexto del usuario.
- Conversación.

Y responde de forma natural sin sustituir la lógica del backend.

## Motor de recomendación

Factores sugeridos:

- Ingredientes disponibles.
- Ingredientes próximos a caducar.
- Tiempo.
- Preferencias.
- Historial.
- Coste.
- Dificultad.
- Valor nutricional.
- Ingredientes faltantes.
- Estación.
- Número de personas.

## Caducidad

Trabajar con estimaciones, no con fechas exactas.

Estados:

- 🟢 Fresco
- 🟡 Consumir pronto
- 🔴 Prioritario

La Home debería priorizar:

1. Productos que conviene consumir.
2. Recetas para aprovecharlos.
3. Lista de la compra.

## Modelo de datos de recetas

Cada receta debería contener:

- Ingredientes.
- Cantidades.
- Cocina.
- Tiempo.
- Dificultad.
- Etiquetas nutricionales.
- Alérgenos.
- Restricciones.
- Método de cocinado.
- Coste.
- Raciones.
- Meal prep.
- Congelable.
- Perfil nutricional.
- Embedding semántico.

## Evolución futura

- Predicción de agotamiento.
- Confirmaciones inteligentes.
- Estadísticas de desperdicio.
- Ahorro económico.
- Planificación semanal.
- Comparación entre supermercados.

## Próximos pasos

### Fase 1

- Dejar que Codex explore completamente el proyecto.
- Revisar la arquitectura actual.
- Revisar el roadmap existente.

### Fase 2

Reorganizar la arquitectura alrededor de:

- Motor de inventario.
- Motor de recomendaciones.
- Motor conversacional.
- Motor de planificación.
- Servicios de sincronización.

### Fase 3

Reorganizar el roadmap alrededor del ciclo principal:

1. Comprar.
2. Actualizar despensa.
3. Detectar productos prioritarios.
4. Recomendar recetas.
5. Cocinar.
6. Actualizar despensa.
7. Actualizar lista de la compra.

## Principio rector

> ¿Esta funcionalidad ayuda al usuario a decidir qué cocinar, qué comprar o qué consumir antes de que se estropee con el menor esfuerzo posible?

Si la respuesta es sí, está alineada con la visión del producto.
