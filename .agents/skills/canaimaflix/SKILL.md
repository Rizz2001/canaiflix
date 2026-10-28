---
name: canaimaflix
description: >-
  Memoria maestra, arquitectura, especificaciones de hardware y runbook de desarrollo del proyecto CanaimaFlix.
  Usa esta skill para recordar siempre el contexto de la tableta Canaima TR10RS1 (Android 4.4.4 KitKat x86),
  la estrategia de bajo consumo de memoria RAM para 20.000+ canales M3U, el diseno responsive y la estructura limpia del proyecto.
---

# CanaimaFlix - Memoria Maestra del Proyecto 🎬

Este documento es la **fuente de verdad permanente** para el desarrollo de **CanaimaFlix**, una aplicación de IPTV / VOD diseñada a medida para la tableta educativa **Canaima TR10RS1**.

---

## 📱 1. Diagnóstico y Especificaciones Reales del Dispositivo (Vía ADB)

Analizado en tiempo real mediante ADB (`EB581005877`):
* **Modelo:** Canaima TR10RS1 (`TR10RS1_i_Buddie` / `TR10RS1_1`).
* **SoC / Procesador:** Intel Atom Bay Trail-T Z3735G (Quad-Core 32-bit x86 @ 1.33 GHz).
* **Arquitectura CPU (ABI):** `x86`.
* **Memoria RAM:** Total `902.312 kB` (~1 GB DDR3L). Usables por apps: ~300-400 MB.
* **Sistema Operativo:** Android 4.4.4 KitKat (API Level 19).
* **Pantalla:** 10.1" IPS, Resolución nativa **1280 × 800 px** (Landscape 16:10), Densidad **160 dpi** (mdpi).
* **Almacenamiento Libre:** ~7.4 GB disponibles en `/data`.
* **Navegadores y Reproductores instalados:**
  - **Firefox ESR:** Versión `68.0.2` (Gecko engine compatible con KitKat x86).
  - **VLC for Android:** Versión `3.0.13` (`org.videolan.vlc`).
  - **AOSP Browser:** WebView stock Chromium 30/33.
* **Acceso Root:** SuperSU (`eu.chainfire.supersu`) activo.

---

## 🎨 2. Sistema de Diseño Dark Dashboard (Referencia Visual Exacta)

Basado en la referencia visual compartida por el usuario ([ui_dark_dashboard.png](./references/ui_dark_dashboard.png)):
* **Tema Principal:** Dark Obsidian Gaming/Streaming Dashboard.
* **Paleta de Colores:**
  - Fondo Principal (`--bg-main`): `#0B0E14` (Negro obsidiana profundo).
  - Sidebar y Barras (`--bg-surface`): `#111620` (Pizarra marino oscuro).
  - Tarjetas y Contenedores (`--bg-card`): `#161D2A`.
  - Tarjetas Activas / Hover (`--bg-card-hover`): `#1D2638`.
  - Bordes Suaves (`--border-subtle`): `1px solid rgba(255, 255, 255, 0.07)`.
  - Acento Primario (`--accent-primary`): `#3B82F6` (Azul eléctrico) y `#E50914` (Rojo cinematográfico).
  - Botón Primario: Fondo blanco `#FFFFFF`, texto oscuro `#0B0E14` con `border-radius: 9999px` (Pill button).
  - Textos: Primario `#FFFFFF`, Secundario `#8E9BAE`, Atenuado `#526075`.
* **Componentes Clave de la UI:**
  1. **Sidebar Izquierdo (240px en horizontal):**
     - Cabecera con Logotipo SVG + `CANAIMAFLIX`.
     - Menú de navegación principal: `Inicio` (Home), `Categorías` (En Vivo / Cine / Series), `Mi Biblioteca` (Favoritos / Guardados).
     - Sección *Acceso Rápido* (*Fast Launch*): Canales o películas frecuentes con mini-carátulas.
     - Tarjeta Widget Inferior: Mini-reproductor / estado del canal actual con barra de progreso.
  2. **Barra Superior (Top Bar):**
     - Buscador central estilizado con icono de lupa + botón de filtros.
     - Botón de favoritos (Corazón), Gestor de fuentes M3U (Badge de conteo de listas) y Perfil del dispositivo (`Canaima TR10RS1`).
  3. **Carrusel Hero en Capas 3D:**
     - Tarjeta destacada central elevada con esquinas redondeadas (`16px`), degradado oscuro cinematográfico, título, descripción, botón *Reproducir* blanco + botón circular VLC.
     - Tarjetas laterales asomadas a los lados con escala reducida creando profundidad visual.
  4. **Filas de Contenido y Tarjetas:**
     - Encabezado con título de sección, enlace *Ver todos* y flechas de navegación `←` `→`.
     - Tarjetas de 16:9 con badge de tipo (`EN VIVO`, `PELÍCULA`, `SERIE`), título en negrita y categoría.
  5. **Modo Vertical (Portrait 800×1280):**
     - Sidebar colapsable en menú off-canvas accesible por botón hamburguesa.
     - Bottom Navigation Bar fija (60px) con accesos rápidos.


---

## ⚡ 3. Estrategia Crítica para 20.000+ Canales sin Saturar la RAM

En una tableta con solo 1 GB de RAM, cargar una lista M3U con 20.000 elementos como un array JSON en memoria o crear 20.000 nodos DOM provocaría un cierre forzoso inmediato por *Out Of Memory (OOM)*.

### Reglas de Rendimiento Extremo:
1. **Parser de M3U en Streaming / Chunks:**
   - No cargar el archivo `.m3u` completo en un único string de 30-50 MB.
   - Procesar línea por línea o en bloques de 500 canales.
   - Insertar por lotes (*batch insert*) directamente en **IndexedDB**.
2. **IndexedDB como Base de Datos Indexada:**
   - Almacena canales normalizados con índices en `type` (`live`, `movie`, `series`), `groupTitle`, `name`, y `favorite`.
   - Consultas paginadas (`offset`, `limit: 50`) mediante cursores, manteniendo en memoria JavaScript únicamente la página actual.
3. **Lista Virtualizada (Virtual Scroller / Windowing):**
   - El DOM solo renderiza los elementos visibles en pantalla (~10 a 14 tarjetas/filas según resolución 1280x800).
   - Al hacer scroll, se reciclan los mismos contenedores DOM cambiando sus datos, manteniendo el consumo de memoria plano (< 15 MB).
4. **Reproducción Híbrida Inteligente:**
   - **Reproductor Interno:** HLS.js con configuración de búfer ultraligera (`maxBufferSize: 12MB`, `maxBufferLength: 10s`).
   - **Reproductor Externo (Intent Nativo):** Botón directo para lanzar **VLC for Android** (`org.videolan.vlc`), el cual usa aceleración por hardware nativa x86 sin consumir RAM en el frontend.

---

## 🎨 4. Reglas de Compatibilidad KitKat (Firefox ESR 68 & WebView)

Para evitar bugs visuales y caídas en KitKat:
1. ❌ **PROHIBIDO `clamp()`**: Invalida la regla CSS en Firefox 68. Usar media queries con anchos fijos/porcentuales.
2. ❌ **PROHIBIDO `gap` en Flexbox**: `gap` solo funciona en Grid en Firefox 68. En Flexbox usar márgenes tradicionales (`margin-right`, `margin-bottom`).
3. ❌ **PROHIBIDO `aspect-ratio`**: No existe en Firefox 68. Definir siempre `height` explícito en las imágenes/tarjetas.
4. ❌ **PROHIBIDO Emojis Modernos Unicode 7+**: La fuente de KitKat muestra rectángulos vacíos (`▯`). Usar exclusivamente **Iconos SVG Inline**.

---

## 📂 5. Arquitectura y Estructura Limpia de Archivos

```text
d:\proyectos\canaiflix-1\
├── .agents/
│   └── skills/
│       └── canaimaflix/
│           └── SKILL.md              # Esta memoria maestra
├── web/                              # Aplicación Frontend Modular
│   ├── index.html                    # Estructura semántica accesible
│   ├── css/
│   │   ├── reset.css                 # Normalización CSS compatible KitKat
│   │   ├── variables.css             # Paleta de color, tipografía y tokens
│   │   ├── layout.css                # Sidebar, Grid principal, Header, Bottom Nav
│   │   ├── components.css            # Tarjetas, Hero Banner, Modales, Botones
│   │   └── responsive.css            # Media queries 1280x800 y 800x1280
│   ├── js/
│   │   ├── app.js                    # Coordinador central de la app
│   │   ├── storage/
│   │   │   └── db.js                 # IndexedDB con transacciones por lotes e índices
│   │   ├── parsers/
│   │   │   └── m3u-parser.js         # Parser M3U chunked y clasificador (Live/Movie/Series)
│   │   ├── ui/
│   │   │   ├── virtual-scroller.js   # Renderizador virtual de 20K canales
│   │   │   ├── sidebar.js            # Navegación y selector de categorías
│   │   │   ├── modal-source.js       # Gestor para agregar listas M3U (URL o Archivo)
│   │   │   └── toast.js              # Notificaciones visuales ligeras
│   │   ├── player/
│   │   │   └── player-controller.js  # HLS.js con bajo buffer y lanzador de VLC
│   │   └── icons/
│   │       └── svg-icons.js          # Catálogo de SVGs vectoriales inline
│   └── vendor/
│       └── hls.min.js                # Versión ligera de HLS.js
├── app/                              # Wrapper APK Android Nativo (minSdkVersion 19)
│   └── src/                          # Código Java + AndroidManifest.xml
└── scripts/
    ├── dev-server.js                 # Servidor local Node.js para depuración
    └── deploy-tablet.ps1             # Script ADB para instalación y despliegue rápido
```

---

## 🛠️ 6. Herramientas de Inspección y Flujo Visual
* **Playwright & agent-browser:** Utilizados para previsualizar visualmente la aplicación a resolución exacta de la tablet (1280x800 Landscape y 800x1280 Portrait), verificar que no haya scroll horizontal involuntario ni desbordamiento de tarjetas.
* **ADB Command Pipeline:** Conexión continua con la tableta por cable USB para empujar archivos y ejecutar la aplicación al instante.
