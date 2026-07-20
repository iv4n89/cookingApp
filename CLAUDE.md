# RecetasApp

App móvil de recetas con IA. Ver `ARCHITECTURE.md` para el stack.

## Flujo de trabajo (obligatorio)

Una rama por feature y PR con revisión antes de mergear. **Nunca commitear directo a `main`.**

1. Partir de `main` actualizada: `git switch main && git pull`.
2. Crear rama: `feat/<slug>`, `fix/<slug>`, `chore/<slug>` o `docs/<slug>`.
3. Implementar y commitear en la rama.
4. Al terminar, abrir PR a `main` con `gh pr create`.
5. **Lanzar un agente revisor sobre el diff de la PR** (Task → code-reviewer, o el skill `/code-review`).
6. **Mergear solo si la revisión pasa sin hallazgos relevantes.** Si los hay, corregir en la
   misma rama y volver a revisar. No mergear con dudas del revisor sin resolver.
7. Tras el merge: borrar la rama y volver a `main`.

Pedir confirmación antes de `merge` y `push` a `main`.
