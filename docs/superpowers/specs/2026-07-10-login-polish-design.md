# Login Polish — Design

**Date:** 2026-07-10
**Scope:** `frontend/src/pages/LoginPage.tsx` (+ new eye icon in `frontend/src/components/ui/icons.tsx`)
**Status:** Approved

## Goal

Pulir la pantalla de login en cuatro frentes: copy/mensaje, diseño visual, UX del
formulario y responsive. Dirección de marca elegida: **Atenea, sin claims** —
minimalista, marca-forward, sin listas de features.

## Non-goals

- No cambia la lógica de autenticación (`authStore.login`, API `/auth`).
- No cambia el layout de dos columnas ni la atmósfera visual (mesh/aura/grain) — son la marca.
- No agrega "recordarme", recuperación de contraseña, ni SSO.

## Changes

### 1. Copy / mensaje (panel izquierdo)
- **Eliminar** la constante `FEATURES` (mapas, analítica, gobernanza) y su lista.
- **Eliminar** la constante `CAPABILITIES` y sus pills.
- **Eliminar** el eyebrow "GovTech Command Center" y el párrafo largo de descripción.
- Panel izquierdo pasa a un **bloque de marca vertical-centrado**:
  - Logo (`LogoMark`) + wordmark "Atenea" grande.
  - Tagline corto con `text-gradient`: **"Inteligencia que se convierte en acción."**
  - Una línea de pie discreta (se conserva la existente): "Privacy-by-design ·
    Audit-logged · Multi-tenant ready" con `ShieldIcon`.
- Se conservan `LogoMark` y `ShieldIcon`; se dejan de importar los iconos ahora sin uso
  (`AnalyticsIcon`, `LayersIcon`, `MapIcon`).

### 2. Diseño visual
- Mantener `grid lg:grid-cols-2` + capas de atmósfera.
- Izquierda: `justify-center` con jerarquía limpia (wordmark grande, tagline, pie),
  respiración generosa. Se conservan las animaciones `reveal` escalonadas.
- Tarjeta derecha: micro-ajustes de espaciado; se elimina el pie redundante
  ("Conecta credenciales institucionales para continuar.").

### 3. UX del formulario
- Botón **mostrar/ocultar contraseña**: nuevo `EyeIcon` / `EyeOffIcon` en `icons.tsx`,
  toggle con estado `showPassword`. Tap-target ≥44px, `aria-label` dinámico,
  `type="button"` para no enviar el form.
- `autoFocus` en el input identificador.
- `autoComplete="username"` en identificador; `autoComplete="current-password"` en contraseña.
- El identificador acepta teléfono **o** correo → se queda `type="text"` con
  `inputMode="text"` (no `email`).
- Error refinado: icono (`AlertIcon`) + texto, misma paleta `state-critical`.
- Botón conserva estado `loading` ("Autenticando…").

### 4. Responsive / móvil
- Móvil conserva el mini-brand existente (`lg:hidden`).
- Ajuste de padding de la card y del contenedor; toggle de contraseña con tap-target adecuado.

## Testing / verification
- `npm run build` (type-check + Vite) pasa.
- Verificación manual del flujo: login OK navega a `/`, error muestra mensaje,
  toggle de contraseña alterna visibilidad, autofill del gestor de contraseñas funciona.
- Revisar responsive en ancho móvil.
