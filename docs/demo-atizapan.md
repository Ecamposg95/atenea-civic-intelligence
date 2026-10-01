# Demo Atizapán de Zaragoza 2027 · Luis Montaño (Arturo)

**Entorno:** https://agora-gobtech.up.railway.app · org `Atizapán 2027` (slug `atizapan`).
**Cuentas:** Arturo (ADMIN de la org, su correo habitual) · `coordinador@demo.atizapan.mx` (COORDINADOR)
· `lider01..08@`, `activista01..40@`, `capturista01..02@` (dominio `demo.atizapan.mx`) — contraseña común: la de
`SEED_DEMO_ATIZAPAN_PASSWORD` (ver Railway → Agora → Variables; no se escribe aquí).

## Guion (30 min)
1. **Centro de Mando** como coordinador: cabecera "Atizapán de Zaragoza 2027 · Luis Montaño (Morena-PVEM-PT)", countdown al 6-jun-2027, ritmo semanal con caída reciente (zonas 3 y 7).
2. **Panorama municipal**: Atizapán por defecto; margen 2024 −33,809 (brecha por cerrar); selector de región → comparar con Tlalnepantla, Naucalpan, Cuautitlán Izcalli, Nicolás Romero, Isidro Fabela y Jilotzingo.
3. **Plan territorial / War Room**: 174 secciones, 51 persuadibles, semáforo con rojos en persuadibles rezagadas.
4. **Alertas** (`/riesgo`, chip en Inicio): T1/O1 secciones rezagadas, O2 caída de ritmo, O3 casos con SLA vencido, O4 activistas inactivos, O5 acuerdos vencidos, T2 participación atípica.
5. **Promovidos / Militantes**: 6,000 / 1,200 registros ficticios (marcados `demo-seed`), clave enmascarada; revelar clave auditado.
6. **Atención, Minutas y Acuerdos, Agenda 30/60/90**: 60 casos (24 con SLA vencido), 12 minutas, 40 acuerdos (10 vencidos), 30 eventos de agenda.
7. Como Arturo (ADMIN): usuarios de la org y estructura; no ve nada de otras organizaciones.

## Datos
- Reales: IEEM 2018/2021/2024 por sección, INEGI ITER 2020 (`backend/app/seeds/municipios/<code>/manifest.json` trae URLs y hashes). Región "atizapan": 15013, 15104, 15057, 15060, 15121, 15038, 15046.
- Sintéticos: todo lo operativo; personas y claves ficticias; `scripts/seed_atizapan_operacion.py --reset --yes` los borra (solo local, requiere la variable de activación).
- Semántica electoral: `coalicion` = bloque propio, `morena` = rival, `margen = coalicion − morena`; las etiquetas salen del registro de municipios.

## Variables de entorno (Railway)
`SEED_DEMO_ATIZAPAN=true`, `SEED_DEMO_ATIZAPAN_PASSWORD`, opcional `SEED_DEMO_ATIZAPAN_ORG_SLUG` (default `atizapan`) y
`SEED_DEMO_ATIZAPAN_ADMIN_EMAIL` (re-domicilia a ese usuario como ADMIN de la org; irreversible por seed).
`SEED_DEMO_TERRITORY=true` carga todos los municipios del registro.
