---
tipo: decision
tags: [decision, deuda-tecnica, auditoria]
fecha: 2026-10-15
---

# Pendientes conocidos tras la auditoría de octubre 2026

Volver a [[mapa-del-proyecto]]. Detectados y **no hechos**; ver [[testing]] y
[[sync-y-autenticacion]] para el contexto.

- Partir `src/lib/sync.ts` (1668 líneas) en módulos.
- Partir `src/pages/DebtsPage.tsx` (909 líneas).
- Unificar el aviso de error de `syncToCloud` (hoy repetido en 33 sitios).
- Fallback de `uuidv5` (`src/lib/ids.ts`) cuando no hay `crypto.subtle`: genera
  ids **distintos** a los de la ruta normal, así que un dispositivo sin
  `subtle` produciría ocurrencias/imports con ids no deterministas entre sí.
- Faltan pruebas E2E, auditoría de accesibilidad automática (axe) y un hook de
  pre-commit.
