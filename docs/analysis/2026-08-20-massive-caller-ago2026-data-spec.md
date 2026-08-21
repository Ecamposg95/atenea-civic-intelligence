# Especificación de datos — Massive Caller "EDOMEX Alcaldías" (13-ago-2026)

> Síntesis del PDF `EDOMEX_ALCALDIAS_AGOSTO_13_2026.pdf` (119 pág.) como insumo para el
> modelo de polling de ATENEA (programa Territorial Intelligence, SP-1+).
> Analizado 2026-08-20.

## Naturaleza del archivo

**100 % imágenes rasterizadas, sin capa de texto** — la ingesta requiere OCR/visión.
Las láminas de tracking **solo rotulan numéricamente la última ola**; los valores
históricos son puntos sin cifra (no extraíbles como números sin los PDFs de meses
anteriores o digitalización de píxeles).

## Estructura por municipio

Cada ficha = secuencia de bloques de pregunta; cada bloque = 2 láminas (foto actual +
"TRACKING" mensual). Bloques: (1) intención de voto por partido (siempre); (2) reelección
Sí/No (solo 8 municipios, nombre del alcalde embebido, gráfica de pastel); (3) candidato
interno por partido (0–5 bloques: PAN/PRI/MORENA/MC/PVEM según municipio, 1–7 aspirantes
+ OTRO + AÚN NO DECIDE, base condicionada al voto por ese partido).

| Municipio | Páginas | Bloques |
|---|---|---|
| Atizapán de Zaragoza | 2–13 | Partido + internas PAN, PRI, MORENA, MC, PVEM |
| Chalco | 14–17 | Partido + reelección (Abigail Sánchez Martínez) |
| Chimalhuacán | 18–27 | Partido + PAN, PRI, MORENA, MC |
| Cuautitlán | 28–31 | Partido + reelección (Juana Carrillo Luna) |
| Cuautitlán Izcalli | 32–35 | Partido + reelección (Daniel Serrano Palacios) |
| Ecatepec de Morelos | 36–39 | Partido + reelección (Azucena Cisneros Coss) |
| Huixquilucan | 40–49 | Partido + PAN, PRI, MORENA, MC |
| Ixtapaluca | 50–58 | Partido + PAN, PRI, MORENA + MC (sin lámina tracking) |
| Metepec | 59–68 | Partido + PAN, PRI, MORENA, MC |
| Naucalpan de Juárez | 69–80 | Partido + reelección (Isaac Montoya Márquez) + PAN, PRI, MC, PVEM (sin MORENA) |
| Nezahualcóyotl | 81–82 | Solo partido |
| Tecámac | 83–92 | Partido + reelección (Rosa Yolanda Wong Romero) + PAN, PRI, MORENA |
| Tlalnepantla de Baz | 93–106 | Partido + reelección (Raciel Pérez Cruz) + PAN, PRI, MORENA, MC, PVEM |
| Toluca | 107–118 | Partido + reelección (Ricardo Moreno Bastida) + PAN, PRI, MORENA, MC |

**Texcoco** aparece en portada pero NO tiene ficha (el modelo debe tolerar municipios
anunciados sin datos).

## Metadata

- Encuestadora: Massive Caller S.A. de C.V.; autopatrocinada. Última ola 13-ago-2026.
- n=600 por municipio; M.E. ±4.3 % (uniformes, repetidos incluso en preguntas
  condicionadas cuya base real es menor y no se reporta).
- Metodología (p.119): "robot" — grabaciones a hogares, llamadas aleatorias; "no
  incluye métodos de estimación"; sin fechas de campo por ola, sin ponderación.

## Preguntas exactas

1. **Partido:** "EN EL AÑO 2027 HABRÁ ELECCIONES PARA ELEGIR AL PRÓXIMO ALCALDE DE
   {MUNICIPIO}. SI EL DÍA DE HOY FUERAN LAS ELECCIONES, ¿POR CUÁL PARTIDO POLÍTICO
   VOTARÍA USTED?" — Opciones: MORENA, PAN, PRI, PVEM, MC, PT + AÚN NO DECIDE
   (sin "otro", sin coaliciones, orden por magnitud — nunca usar posición como identidad).
2. **Reelección:** "…¿VOTARÍA USTED POR {NOMBRE} EN CASO DE QUE DECIDIERA REELEGIRSE…?"
   — SÍ / NO, sin indecisos.
3. **Interna:** "USTED SEÑALÓ QUE PIENSA VOTAR POR {PARTIDO}… ¿QUIÉN LE GUSTARÍA QUE
   FUERA EL CANDIDATO…?" — nombres + OTRO + AÚN NO DECIDE.

## Series temporales

- Cadencia mensual, cortes el 13 de cada mes.
- Partido e internas: 7 olas (13-feb → 13-ago-2026).
- Reelección: hasta 14 olas (13-jul-25 → 13-ago-26, con fecha anómala 09-sep-25).
- Catálogos de candidatos inestables entre olas (líneas que aparecen/desaparecen).

## Datos de referencia (ola 13-ago-2026)

### Atizapán de Zaragoza
- Partido: MORENA 33.8, PAN 33.4, PRI 11.3, PVEM 3.2, MC 2.6, PT 1.9, ND 13.8.
- PAN: Anuar Azar Figueroa 28.6, Patricia Arévalo Rubio 15.2, Carlos Madrazo Limón 14.3,
  Ana Balderas 12.1, Otro 11.2, ND 18.6.
- PRI: Rodrigo Samperio Chaparro 22.5, Ana Laura Ángeles 16.8, Fernando Zúñiga 16.4,
  Derek Cancino Aguilar 12.3, Otro 8.9, ND 23.1.
- MORENA: Enrique Contreras 17.1, Leylany Richard 12.6, Bárbara González 12.1,
  Norberto Becerra 11.5, Gonzalo Alarcón Bárcena 10.7, Román Cortés 7.1,
  Josefina Anaya Martínez 6.1, ND 22.8.
- MC: Ángel Domínguez 25.4, Diego Talavera 19.6, Eugenio Mayen Rosas 12.5, Otro 13.2, ND 29.3.
- PVEM: Luis Montaño 42.9, Otro 24.5, ND 32.6. Sin pregunta de reelección.

### Tlalnepantla de Baz
- Partido: MORENA 44.6, PAN 18.3, PRI 16.3, MC 6.7, PVEM 3.8, PT 2.2, ND 8.1.
- Reelección Raciel Pérez Cruz: SÍ 52.7 / NO 47.3 (cruce SÍ/NO ~jun-26 en tracking de 14 olas).
- PAN: Krishna Romero Velázquez 25.7, Brenda Escamilla 21.8, Víctor Hugo Sondón 14.9,
  Otro 19.8, ND 17.8.
- PRI: Denisse Ugalde Alegría 21.9, Pablo Basáñez García 21.3, Tony Rodríguez Hurtado 16.1,
  Verónica Rocha Vélez 9.7, Otro 18.4, ND 12.6.
- MORENA: Raciel Pérez Cruz 35.1, Maribel Soto 16.5, Gabriela Valdepeñas González 15.5,
  Arleth Grimaldo 8.2, Paco Mercado 7.2, Max Correa 3.1, Otro 9.3, ND 5.1.
- MC: Ale Manzanilla 20.5, Israel Vergara 15.4, Alfonso Vidales Vargas 10.4, Otro 22.8, ND 30.9.
- PVEM: Jonás Sandoval Orozco 17.5, Tatiana Ortiz 15.8, Luis Manuel Orihuela 5.3,
  Otro 19.3, ND 42.1.

## Peculiaridades de ingesta (checklist)

1. PDF sin texto (OCR/visión). 2. Texcoco fantasma. 3. Tracking sin cifras históricas.
4. Ventanas heterogéneas (7 vs 14 olas, fecha anómala). 5. Esquema variable por municipio
(Naucalpan sin bloque MORENA teniendo alcalde MORENA; 5 municipios sin bloques de
candidatos). 6. MC-Ixtapaluca sin lámina de tracking. 7. Gráficas mixtas
(barras/pastel/líneas). 8. Catálogos de candidatos inestables. 9. Orden de opciones por
magnitud. 10. n/M.E. planos engañosos en preguntas condicionadas. 11. Nombres de
candidatos sin normalizar ("Krishna Romero" vs "Krisha Romero Velázquez") → entity
resolution. 12. Género variable embebido en el enunciado de reelección.

**Implicación clave para seeds:** solo la ola 13-ago-2026 es hidratable con confianza
numérica; las series históricas requieren los PDFs de meses anteriores o quedan como
`ESTIMATE`/no disponibles.
