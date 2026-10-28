/**
 * CanaimaFlix - Orquestador Principal de la Aplicación
 * Coordina navegación, renderizado de carruseles 3D, búsqueda y estado.
 */

class CanaimaFlixApp {
  constructor() {
    this.heroItems = [];
    this.heroIndex = 0;
    this.currentFilter = 'all'; // 'all' | 'live' | 'movie' | 'series' | 'favorites'
    this.searchQuery = '';
    this.searchDebounce = null;
  }

  async init() {
    console.log('🎬 Iniciando CanaimaFlix...');

    // 1. Inicializar base de datos y subsistemas
    await window.dbManager.init();
    window.toast.init();
    window.playerController.init();
    window.sourceModalManager.init();

    // 2. Configurar eventos de navegación y responsive
    this.setupNavigation();
    this.setupSearch();
    this.setupResponsive();

    // 3. Renderizar vista inicial
    await this.refreshDashboard();

    // 4. Si la base de datos está vacía, cargar automáticamente la lista demo
    const sources = await window.dbManager.getSources();
    if (sources.length === 0) {
      console.log('Primera ejecución: Cargando canales de demostración iniciales...');
      await window.sourceModalManager.loadDemoChannels();
    }
  }

  /**
   * Refresca todos los componentes del Dashboard
   */
  async refreshDashboard() {
    await this.updateSourcesBadge();
    await this.loadHeroCarousel();
    await this.loadContentRows();
    await this.loadFastLaunch();
  }

  /**
   * Actualiza el badge con el número de fuentes activas
   */
  async updateSourcesBadge() {
    const sources = await window.dbManager.getSources();
    const badge = document.getElementById('sources-count-badge');
    if (badge) {
      badge.textContent = sources.length;
    }
  }

  /**
   * Configura y renderiza el Carrusel Hero 3D en capas
   */
  async loadHeroCarousel() {
    // Obtener canales destacados (primeros 5 canales o películas)
    let items = await window.dbManager.getChannels({ limit: 5 });
    if (!items || items.length === 0) return;

    this.heroItems = items;
    this.renderHeroCards();
  }

  renderHeroCards() {
    const track = document.getElementById('hero-track');
    if (!track || this.heroItems.length === 0) return;

    track.innerHTML = '';
    const total = this.heroItems.length;

    this.heroItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'hero-card';

      // Posicionamiento de clases para efecto 3D
      if (index === this.heroIndex) {
        card.classList.add('active');
      } else if (index === (this.heroIndex - 1 + total) % total) {
        card.classList.add('prev');
      } else if (index === (this.heroIndex + 1) % total) {
        card.classList.add('next');
      } else {
        card.classList.add('hidden');
      }

      // Carátula de fondo
      const defaultPoster = 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800';
      const posterUrl = item.logo || defaultPoster;

      const typeLabel = item.type === 'live' ? 'En Vivo' : (item.type === 'movie' ? 'Película' : 'Serie');

      card.innerHTML = `
        <img class="hero-card-bg" src="${posterUrl}" alt="${item.name}" onerror="this.src='${defaultPoster}'" />
        <div class="hero-overlay">
          <div class="hero-top-row">
            <span class="hero-type-badge">${typeLabel}</span>
            <button class="hero-fav-btn ${item.favorite ? 'active' : ''}" data-id="${item.id}" title="Favorito">
              ${window.getSVG('heart')}
            </button>
          </div>
          <div class="hero-bottom-content">
            <h2 class="hero-title">${item.name}</h2>
            <p class="hero-desc">${item.groupTitle || 'Canal Destacado'} • Transmisión fluida optimizada para Canaima TR10RS1</p>
            <div class="hero-actions">
              <button class="btn-hero-play" data-action="play">
                <span class="btn-icon">${window.getSVG('play')}</span>
                REPRODUCIR
              </button>
              <button class="btn-hero-vlc" data-action="vlc" title="Abrir en VLC">
                <span class="vlc-icon">${window.getSVG('vlc')}</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Eventos de la tarjeta
      const playBtn = card.querySelector('[data-action="play"]');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.playerController.play(item);
        });
      }

      const vlcBtn = card.querySelector('[data-action="vlc"]');
      if (vlcBtn) {
        vlcBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.playerController.launchVLC(item.streamUrl, item.name);
        });
      }

      const favBtn = card.querySelector('.hero-fav-btn');
      if (favBtn) {
        favBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const isFav = await window.dbManager.toggleFavorite(item.id);
          favBtn.classList.toggle('active', isFav === 1);
          window.toast.show(isFav ? 'Añadido a favoritos' : 'Eliminado de favoritos', 'info');
        });
      }

      // Clic en tarjetas laterales para rotar el carrusel
      card.addEventListener('click', () => {
        if (index !== this.heroIndex) {
          this.heroIndex = index;
          this.renderHeroCards();
        }
      });

      track.appendChild(card);
    });
  }

  /**
   * Carga las filas horizontales de contenido (En Vivo, Películas, Series)
   */
  async loadContentRows() {
    const rowsContainer = document.getElementById('content-rows-container');
    if (!rowsContainer) return;

    rowsContainer.innerHTML = '';

    // 1. Canales En Vivo
    const liveChannels = await window.dbManager.getChannels({ type: 'live', limit: 20 });
    if (liveChannels.length > 0) {
      this.createSectionRow(rowsContainer, 'Canales En Vivo', liveChannels, 'live');
    }

    // 2. Películas
    const movies = await window.dbManager.getChannels({ type: 'movie', limit: 20 });
    if (movies.length > 0) {
      this.createSectionRow(rowsContainer, 'Películas Destacadas', movies, 'movie');
    }

    // 3. Series
    const series = await window.dbManager.getChannels({ type: 'series', limit: 20 });
    if (series.length > 0) {
      this.createSectionRow(rowsContainer, 'Series & Documentales', series, 'series');
    }

    // 4. Continuar Viendo (Historial)
    const history = await window.dbManager.getHistory(10);
    if (history.length > 0) {
      this.createSectionRow(rowsContainer, 'Continuar Viendo', history, 'history');
    }
  }

  /**
   * Crea una fila horizontal de tarjetas
   */
  createSectionRow(container, title, items, rowType) {
    const row = document.createElement('div');
    row.className = 'section-row';

    const trackId = `track_${rowType}_${Date.now()}`;

    row.innerHTML = `
      <div class="section-header">
        <div class="section-title-wrap">
          <h3 class="section-title">${title}</h3>
        </div>
        <div class="section-actions">
          <span class="view-all-link" data-type="${rowType}">Ver todos</span>
          <div class="nav-arrows">
            <button class="arrow-btn btn-prev" title="Anterior">
              <span class="arrow-icon">${window.getSVG('arrowLeft')}</span>
            </button>
            <button class="arrow-btn btn-next" title="Siguiente">
              <span class="arrow-icon">${window.getSVG('arrowRight')}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="cards-track" id="${trackId}"></div>
    `;

    const track = row.querySelector(`#${trackId}`);

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'media-card';

      const defaultThumb = 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=300';
      const thumb = item.logo || defaultThumb;
      const typeTag = item.type === 'live' ? 'EN VIVO' : (item.type === 'movie' ? 'PELÍCULA' : 'SERIE');
      const tagClass = item.type || 'live';

      card.innerHTML = `
        <div class="card-poster">
          <img src="${thumb}" alt="${item.name}" loading="lazy" onerror="this.src='${defaultThumb}'" />
          <span class="card-tag ${tagClass}">${typeTag}</span>
        </div>
        <div class="card-details">
          <div class="card-type-label">${item.groupTitle || 'Canal'}</div>
          <div class="card-title" title="${item.name}">${item.name}</div>
          <div class="card-meta-row">
            <span class="card-badge">HD</span>
            <span class="card-subtext">${item.type === 'live' ? 'Señal en directo' : 'Bajo Demanda'}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        window.playerController.play(item);
      });

      track.appendChild(card);
    });

    // Flechas de navegación del carrusel
    const prevBtn = row.querySelector('.btn-prev');
    const nextBtn = row.querySelector('.btn-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        track.scrollBy({ left: -400, behavior: 'smooth' });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        track.scrollBy({ left: 400, behavior: 'smooth' });
      });
    }

    container.appendChild(row);
  }

  /**
   * Carga la lista "Acceso Rápido" en el sidebar
   */
  async loadFastLaunch() {
    const list = document.getElementById('fast-launch-list');
    if (!list) return;

    const channels = await window.dbManager.getChannels({ limit: 4 });
    list.innerHTML = '';

    channels.forEach(ch => {
      const item = document.createElement('div');
      item.className = 'fast-launch-item';

      const thumb = ch.logo || '';

      item.innerHTML = `
        <div class="fast-launch-thumb">
          ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;border-radius:4px" />` : window.getSVG('logo')}
        </div>
        <span class="fast-launch-name">${ch.name}</span>
      `;

      item.addEventListener('click', () => {
        window.playerController.play(ch);
      });

      list.appendChild(item);
    });
  }

  /**
   * Configura la navegación de pestañas del sidebar y bottom nav
   */
  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        navItems.forEach(i => i.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.filterByView(view);
      });
    });
  }

  async filterByView(view) {
    const rowsContainer = document.getElementById('content-rows-container');
    if (!rowsContainer) return;

    rowsContainer.innerHTML = '';

    if (view === 'home') {
      await this.loadContentRows();
    } else if (view === 'live') {
      const items = await window.dbManager.getChannels({ type: 'live', limit: 50 });
      this.createSectionRow(rowsContainer, 'Todos los Canales En Vivo', items, 'live');
    } else if (view === 'movies') {
      const items = await window.dbManager.getChannels({ type: 'movie', limit: 50 });
      this.createSectionRow(rowsContainer, 'Todas las Películas', items, 'movie');
    } else if (view === 'favorites') {
      const items = await window.dbManager.getChannels({ favorite: true, limit: 50 });
      if (items.length === 0) {
        rowsContainer.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Aún no tienes canales favoritos marcados. Haz clic en el corazón de cualquier canal para guardarlo aquí.</div>`;
      } else {
        this.createSectionRow(rowsContainer, 'Mis Canales Favoritos', items, 'favorites');
      }
    }
  }

  /**
   * Configura el buscador con debounce
   */
  setupSearch() {
    const searchInput = document.getElementById('global-search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchDebounce);
      const query = e.target.value.trim();

      this.searchDebounce = setTimeout(async () => {
        if (!query) {
          await this.loadContentRows();
          return;
        }

        const results = await window.dbManager.getChannels({ search: query, limit: 40 });
        const rowsContainer = document.getElementById('content-rows-container');
        if (rowsContainer) {
          rowsContainer.innerHTML = '';
          if (results.length === 0) {
            rowsContainer.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No se encontraron canales para "${query}".</div>`;
          } else {
            this.createSectionRow(rowsContainer, `Resultados para "${query}" (${results.length})`, results, 'search');
          }
        }
      }, 250);
    });
  }

  /**
   * Configura el menú hamburguesa y el modo vertical
   */
  setupResponsive() {
    const hamburgerBtn = document.getElementById('btn-hamburger');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (hamburgerBtn && sidebar) {
      hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('active', sidebar.classList.contains('open'));
      });
    }

    if (backdrop && sidebar) {
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
      });
    }
  }
}

// Iniciar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CanaimaFlixApp();
  window.app.init();
});
