# Demo — Captura ciudadana → Lucy visualiza la decisión

**App:** https://agora-gobtech.up.railway.app
**Historia:** un activista registra a una persona en campo (con foto de credencial + firma), y Lucy —la coordinadora— lo ve al instante en su tablero para tomar decisiones sobre San Mateo Atenco.

> Tip: abre **dos ventanas** (o una en el teléfono y otra en la laptop): una con el activista, otra con Lucy. Así muestras la captura y la visualización en paralelo.

---

## Parte 1 — El activista captura (idealmente en el teléfono)

**Login:** `activista@atlastech.mx` · contraseña `78451289`

1. En el menú, sección **Ciudadanía → "Afiliar militante"** (`/militantes/captura`).
2. Wizard de 3 pasos:
   - **Identidad:** nombre, sexo, clave de elector (18), sección (usa una de SMA, ej. `4121`).
   - **Contacto y domicilio:** teléfono, colonia, etc.
   - **Documentos:** toma **foto de la credencial (frente y reverso)** + **firma** en pantalla + marca el consentimiento.
3. **Guardar** → aparece el **folio generado** (ej. `SMA-2026-000XX`). Registro creado.

> Momento de impacto: al guardar aquí, el conteo de Lucy sube en vivo (refresca su panorama).

---

## Parte 2 — Lucy visualiza para decidir

**Login:** `lucy@atlastech.mx` · contraseña `78451289`

1. Sección **Ciudadanía → "Panorama afiliación"** (`/militantes`). Lucy ve:
   - **KPIs:** total de afiliados, **% validados**, ritmo de captura (7/30 días).
   - **Por sección de San Mateo Atenco:** militantes **vs los 3,502 promovidos**, con **lista nominal** real por sección (contexto electoral).
   - **Por activista:** quién está registrando cuánto.
2. **"Padrón de militantes"** (`/militantes/lista`): tabla con filtros (sección, estado, banderas de calidad).
   - Abre un registro → **"Ver documentos / datos"**: revelado **auditado** → muestra la **CURP** y la **foto de la credencial INE** (URL firmada de vida corta).
   - Botones **Validar / Observar**: Lucy marca el registro como validado (cuenta como afiliado formal) u observado (con motivo). — Ya hay 2 validados y 1 observado sembrados para que se vea el flujo.

---

## Qué contar mientras demuestras (el "por qué")

- **Un solo flujo, dos roles:** el activista captura en campo (offline-aware, con foto+firma como manifestación de voluntad); Lucy solo consume inteligencia estructurada para decidir.
- **Datos sensibles protegidos:** clave de elector y CURP **cifradas**; las fotos viven en almacenamiento **privado** y solo se ven por revelado **auditado**. Cada acción deja rastro (auditoría) — cumplimiento por diseño.
- **Territorio real:** todo está acotado a **San Mateo Atenco**; Lucy ve sus 22 secciones con padrón/lista nominal reales, no datos inventados.
- **Comparativa accionable:** "tengo 166 promovidos en la 4121 pero solo 3 afiliados formales" → dónde empujar la estructura.

---

## Datos ya sembrados para el demo (por si no capturas en vivo)

7 militantes en secciones 4121/4130/4129/4138 (2 con foto de credencial, 2 validados por Lucy, 1 observado). El panorama ya se ve poblado sin necesidad de capturar nada en el momento — pero capturar 1 en vivo es el mejor golpe de efecto.

*(Credenciales y datos son del entorno demo; el superadmin es `ecg@atlastech.mx`.)*
