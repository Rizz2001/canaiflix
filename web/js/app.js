/**
 * CanaimaFlix - Orquestador Principal (Compatible ES5 con Chromium 30 / KitKat)
 * Soporta navegación fluida, catálogos completos para 20.000+ canales, filtrado por listas M3U y categorías.
 */

function CanaimaFlixApp() {
  this.heroItems = [];
  this.heroIndex = 0;
  this.currentView = 'home';
  this.searchDebounce = null;
  this.activeSourceId = localStorage.getItem('canaimaflix_active_source') || 'all';
  this.sourcesList = [];
  this.catalogState = {
    title: '',
    type: null,
    sourceId: 'all',
    groupTitle: 'all',
    favorite: false,
    offset: 0,
    limit: 40,
    total: 0,
    loaded: 0,
    isLoading: false
  };
}

CanaimaFlixApp.prototype.init = function() {
  var self = this;
  console.log('🎬 Iniciando CanaimaFlix...');

  window.dbManager.init().then(function() {
    window.toast.init();
    window.playerController.init();
    window.sourceModalManager.init();

    self.setupNavigation();
    self.setupSearch();
    self.setupResponsive();
    self.setupManageSourcesModal();
    self.setupInfiniteScroll();

    return window.dbManager.getSources();
  }).then(function(sources) {
    if (sources.length === 0) {
      console.log('Cargando demo inicial...');
      return window.sourceModalManager.loadDemoChannels();
    } else {
      return self.refreshDashboard();
    }
  }).catch(function(err) {
    console.error('Error inicializando app: ' + (err && err.stack ? err.stack : (err && err.message ? err.message : err)));
  });
};

CanaimaFlixApp.prototype.refreshDashboard = function() {
  var self = this;
  return this.loadSourcesBar().then(function() {
    return self.loadSidebarSources();
  }).then(function() {
    return self.updateSourcesBadge();
  }).then(function() {
    if (self.activeSourceId !== 'all') {
      var sourceName = 'Mi Lista';
      for (var i = 0; i < self.sourcesList.length; i++) {
        if (self.sourcesList[i].id === self.activeSourceId) {
          sourceName = self.sourcesList[i].name;
          break;
        }
      }
      self.renderCatalogView({
        title: sourceName,
        sourceId: self.activeSourceId
      });
      return Promise.resolve();
    } else {
      return self.loadHeroCarousel().then(function() {
        return self.loadContentRows();
      }).then(function() {
        return self.loadFastLaunch();
      });
    }
  });
};

CanaimaFlixApp.prototype.updateSourcesBadge = function() {
  var badge = document.getElementById('sources-count-badge');
  if (badge) {
    badge.textContent = this.sourcesList.length;
  }
  return Promise.resolve();
};

CanaimaFlixApp.prototype.selectSource = function(sourceId) {
  this.activeSourceId = sourceId;
  try {
    localStorage.setItem('canaimaflix_active_source', sourceId);
  } catch (e) {}

  this.updateActiveSourceChips();

  var sourceName = 'Todas las listas';
  for (var i = 0; i < this.sourcesList.length; i++) {
    if (this.sourcesList[i].id === sourceId) {
      sourceName = this.sourcesList[i].name;
      break;
    }
  }

  if (window.toast) {
    window.toast.show(sourceId === 'all' ? 'Mostrando todas las listas' : 'Filtrando por: ' + sourceName, 'info');
  }

  if (sourceId !== 'all') {
    // Al seleccionar una lista individual, abrir catálogo completo con todas sus categorías
    this.renderCatalogView({
      title: sourceName,
      sourceId: sourceId
    });
  } else {
    this.currentView = 'home';
    var navItems = document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]');
    for (var k = 0; k < navItems.length; k++) {
      if (navItems[k].getAttribute('data-view') === 'home') {
        navItems[k].className += ' active';
      } else {
        navItems[k].className = navItems[k].className.replace(/\bactive\b/g, '').trim();
      }
    }
    this.loadHeroCarousel();
    this.loadContentRows();
    this.loadFastLaunch();
  }
};

CanaimaFlixApp.prototype.updateActiveSourceChips = function() {
  var self = this;
  var chips = document.querySelectorAll('.source-chip[data-source-id]');
  for (var i = 0; i < chips.length; i++) {
    var sid = chips[i].getAttribute('data-source-id');
    if (sid === self.activeSourceId) {
      chips[i].className = 'source-chip active';
    } else {
      chips[i].className = 'source-chip';
    }
  }

  var sideItems = document.querySelectorAll('.sidebar-source-item[data-source-id]');
  for (var j = 0; j < sideItems.length; j++) {
    var sId = sideItems[j].getAttribute('data-source-id');
    if (sId === self.activeSourceId) {
      sideItems[j].className = 'sidebar-source-item active';
    } else {
      sideItems[j].className = 'sidebar-source-item';
    }
  }
};

CanaimaFlixApp.prototype.loadSourcesBar = function() {
  var self = this;
  var container = document.getElementById('sources-chips-container');
  if (!container) return Promise.resolve();

  return window.dbManager.getSourcesWithStats().then(function(sources) {
    self.sourcesList = sources;
    container.innerHTML = '';

    var totalChannels = 0;
    for (var k = 0; k < sources.length; k++) {
      totalChannels += (sources[k].channelCount || 0);
    }

    // Chip "Todas las Listas"
    var allChip = document.createElement('button');
    allChip.className = 'source-chip ' + (self.activeSourceId === 'all' ? 'active' : '');
    allChip.setAttribute('data-source-id', 'all');
    allChip.innerHTML = '<span class="chip-dot"></span>Todas las Listas <span class="chip-count">' + totalChannels + '</span>';
    allChip.addEventListener('click', function() {
      self.selectSource('all');
    });
    container.appendChild(allChip);

    // Chips individuales
    for (var i = 0; i < sources.length; i++) {
      (function(s) {
        var chip = document.createElement('button');
        chip.className = 'source-chip ' + (self.activeSourceId === s.id ? 'active' : '');
        chip.setAttribute('data-source-id', s.id);
        chip.innerHTML = '<span class="chip-dot"></span>' + s.name + ' <span class="chip-count">' + (s.channelCount || 0) + '</span>';
        chip.addEventListener('click', function() {
          self.selectSource(s.id);
        });
        container.appendChild(chip);
      })(sources[i]);
    }
  });
};

CanaimaFlixApp.prototype.loadSidebarSources = function() {
  var self = this;
  var list = document.getElementById('sidebar-sources-list');
  if (!list) return Promise.resolve();

  list.innerHTML = '';

  var allItem = document.createElement('div');
  allItem.className = 'sidebar-source-item ' + (self.activeSourceId === 'all' ? 'active' : '');
  allItem.setAttribute('data-source-id', 'all');
  allItem.innerHTML = '<span class="sidebar-source-name">Todas las Listas</span>';
  allItem.addEventListener('click', function() {
    self.selectSource('all');
  });
  list.appendChild(allItem);

  for (var i = 0; i < this.sourcesList.length; i++) {
    (function(s) {
      var item = document.createElement('div');
      item.className = 'sidebar-source-item ' + (self.activeSourceId === s.id ? 'active' : '');
      item.setAttribute('data-source-id', s.id);
      item.innerHTML = 
        '<span class="sidebar-source-name" title="' + s.name + '">' + s.name + '</span>' +
        '<span class="sidebar-source-count">' + (s.channelCount || 0) + '</span>';

      item.addEventListener('click', function() {
        self.selectSource(s.id);
      });
      list.appendChild(item);
    })(this.sourcesList[i]);
  }

  return Promise.resolve();
};

CanaimaFlixApp.prototype.setupManageSourcesModal = function() {
  var self = this;
  var modal = document.getElementById('manage-sources-modal');
  var openBarBtn = document.getElementById('btn-manage-sources-bar');
  var closeBtn = document.getElementById('btn-close-manage-sources');
  var saveBtn = document.getElementById('btn-save-manage-sources');
  var addFromManageBtn = document.getElementById('btn-open-add-from-manage');
  var sideAddBtn = document.getElementById('btn-sidebar-add-source');

  var openModal = function() {
    self.renderManageSourcesList();
    if (modal) modal.className += ' active';
  };

  var closeModal = function() {
    if (modal) modal.className = modal.className.replace(/\bactive\b/g, '').trim();
  };

  if (openBarBtn) openBarBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (saveBtn) saveBtn.addEventListener('click', closeModal);

  if (sideAddBtn) {
    sideAddBtn.addEventListener('click', function() {
      if (window.sourceModalManager) window.sourceModalManager.open();
    });
  }

  if (addFromManageBtn) {
    addFromManageBtn.addEventListener('click', function() {
      closeModal();
      if (window.sourceModalManager) window.sourceModalManager.open();
    });
  }

  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });
  }
};

CanaimaFlixApp.prototype.renderManageSourcesList = function() {
  var self = this;
  var container = document.getElementById('manage-sources-list');
  if (!container) return;

  container.innerHTML = '';
  if (this.sourcesList.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#8E9BAE">No tienes listas añadidas. Añade una para empezar.</div>';
    return;
  }

  for (var i = 0; i < this.sourcesList.length; i++) {
    (function(idx) {
      var s = self.sourcesList[idx];
      var row = document.createElement('div');
      row.className = 'manage-source-row ' + (self.activeSourceId === s.id ? 'active-row' : '');

      row.innerHTML = 
        '<div class="manage-source-left">' +
          '<div class="source-order-controls">' +
            '<button class="btn-order-arrow btn-up" title="Subir orden">' + window.getSVG('up') + '</button>' +
            '<button class="btn-order-arrow btn-down" title="Bajar orden">' + window.getSVG('down') + '</button>' +
          '</div>' +
          '<div class="manage-source-info">' +
            '<div class="manage-source-title">' + s.name + '</div>' +
            '<div class="manage-source-sub">' +
              '<span class="manage-source-badge">' + (s.channelCount || 0) + ' canales</span>' +
              '<span>' + (s.url ? 'URL Remota' : 'Archivo Local') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="manage-source-actions">' +
          '<button class="btn-select-source-action ' + (self.activeSourceId === s.id ? 'selected' : '') + '">' +
            (self.activeSourceId === s.id ? 'Activa' : 'Ver solo esta') +
          '</button>' +
          '<button class="btn-del-source" title="Eliminar lista">' +
            window.getSVG('trash') +
          '</button>' +
        '</div>';

      var upBtn = row.querySelector('.btn-up');
      var downBtn = row.querySelector('.btn-down');
      var selectBtn = row.querySelector('.btn-select-source-action');
      var delBtn = row.querySelector('.btn-del-source');

      if (upBtn) {
        upBtn.addEventListener('click', function() {
          if (idx > 0) {
            var temp = self.sourcesList[idx];
            self.sourcesList[idx] = self.sourcesList[idx - 1];
            self.sourcesList[idx - 1] = temp;
            self.renderManageSourcesList();
            self.loadSourcesBar();
            self.loadSidebarSources();
          }
        });
      }

      if (downBtn) {
        downBtn.addEventListener('click', function() {
          if (idx < self.sourcesList.length - 1) {
            var temp2 = self.sourcesList[idx];
            self.sourcesList[idx] = self.sourcesList[idx + 1];
            self.sourcesList[idx + 1] = temp2;
            self.renderManageSourcesList();
            self.loadSourcesBar();
            self.loadSidebarSources();
          }
        });
      }

      if (selectBtn) {
        selectBtn.addEventListener('click', function() {
          self.selectSource(s.id);
          var modal = document.getElementById('manage-sources-modal');
          if (modal) modal.className = modal.className.replace(/\bactive\b/g, '').trim();
        });
      }

      if (delBtn) {
        delBtn.addEventListener('click', function() {
          if (confirm('¿Eliminar la lista "' + s.name + '" y todos sus canales?')) {
            window.dbManager.deleteSource(s.id).then(function() {
              window.toast.show('Lista eliminada.', 'info');
              if (self.activeSourceId === s.id) {
                self.activeSourceId = 'all';
              }
              return self.refreshDashboard();
            }).then(function() {
              self.renderManageSourcesList();
            });
          }
        });
      }

      container.appendChild(row);
    })(i);
  }
};

CanaimaFlixApp.prototype.loadHeroCarousel = function() {
  var self = this;
  var heroSection = document.getElementById('hero-section');
  if (heroSection) heroSection.style.display = 'block';

  var queryOpts = { limit: 5 };
  if (this.activeSourceId !== 'all') {
    queryOpts.sourceId = this.activeSourceId;
  }

  return window.dbManager.getChannels(queryOpts).then(function(items) {
    if (!items || items.length === 0) {
      var track = document.getElementById('hero-track');
      if (track) track.innerHTML = '<div style="color:#56657F;padding:40px;text-align:center">No hay canales destacados en esta lista.</div>';
      return;
    }
    self.heroItems = items;
    self.renderHeroCards();
  });
};

CanaimaFlixApp.prototype.renderHeroCards = function() {
  var track = document.getElementById('hero-track');
  if (!track || this.heroItems.length === 0) return;

  track.innerHTML = '';
  var total = this.heroItems.length;
  var self = this;

  for (var index = 0; index < total; index++) {
    (function(i) {
      var item = self.heroItems[i];
      var card = document.createElement('div');
      card.className = 'hero-card';

      if (i === self.heroIndex) {
        card.className += ' active';
      } else if (i === (self.heroIndex - 1 + total) % total) {
        card.className += ' prev';
      } else if (i === (self.heroIndex + 1) % total) {
        card.className += ' next';
      } else {
        card.className += ' hidden';
      }

      var placeholder = window.getChannelPlaceholder(item.name, item.type);
      var isImgur = item.logo && item.logo.indexOf('imgur.com') !== -1;
      var posterUrl = (item.logo && !isImgur) ? item.logo : placeholder;
      var typeLabel = item.type === 'live' ? 'En Vivo' : (item.type === 'movie' ? 'Película' : 'Serie');

      card.innerHTML = 
        '<img class="hero-card-bg" src="' + posterUrl + '" alt="' + item.name + '" />' +
        '<div class="hero-overlay">' +
          '<div class="hero-top-row">' +
            '<span class="hero-type-badge">' + typeLabel + '</span>' +
            '<button class="hero-fav-btn ' + (item.favorite ? 'active' : '') + '" data-id="' + item.id + '" title="Favorito">' +
              window.getSVG('heart') +
            '</button>' +
          '</div>' +
          '<div class="hero-bottom-content">' +
            '<h2 class="hero-title">' + item.name + '</h2>' +
            '<p class="hero-desc">' + (item.groupTitle || 'Canal Destacado') + ' • Transmisión fluida optimizada para Canaima TR10RS1</p>' +
            '<div class="hero-actions">' +
              '<button class="btn-hero-play" data-action="play">' +
                '<span class="btn-icon">' + window.getSVG('play') + '</span>' +
                'REPRODUCIR' +
              '</button>' +
              '<button class="btn-hero-vlc" data-action="vlc" title="Abrir en VLC">' +
                '<span class="vlc-icon">' + window.getSVG('vlc') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      var img = card.querySelector('.hero-card-bg');
      if (img) {
        img.onerror = function() {
          this.src = placeholder;
        };
      }

      var playBtn = card.querySelector('[data-action="play"]');
      if (playBtn) {
        playBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.playerController.play(item);
        });
      }

      var vlcBtn = card.querySelector('[data-action="vlc"]');
      if (vlcBtn) {
        vlcBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.playerController.launchVLC(item.streamUrl, item.name);
        });
      }

      var favBtn = card.querySelector('.hero-fav-btn');
      if (favBtn) {
        favBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.dbManager.toggleFavorite(item.id).then(function(isFav) {
            favBtn.className = isFav ? 'hero-fav-btn active' : 'hero-fav-btn';
            window.toast.show(isFav ? 'Añadido a favoritos' : 'Eliminado de favoritos', 'info');
          });
        });
      }

      card.addEventListener('click', function() {
        if (i !== self.heroIndex) {
          self.heroIndex = i;
          self.renderHeroCards();
        }
      });

      track.appendChild(card);
    })(index);
  }
};

CanaimaFlixApp.prototype.loadContentRows = function() {
  var rowsContainer = document.getElementById('content-rows-container');
  if (!rowsContainer) return Promise.resolve();

  rowsContainer.innerHTML = '';
  var self = this;
  var qLive = { type: 'live', limit: 24 };
  var qMovie = { type: 'movie', limit: 24 };
  var qSeries = { type: 'series', limit: 24 };

  if (this.activeSourceId !== 'all') {
    qLive.sourceId = this.activeSourceId;
    qMovie.sourceId = this.activeSourceId;
    qSeries.sourceId = this.activeSourceId;
  }

  return window.dbManager.getChannels(qLive).then(function(liveChannels) {
    if (liveChannels.length > 0) {
      self.createSectionRow(rowsContainer, 'Canales En Vivo', liveChannels, 'live');
    }
    return window.dbManager.getChannels(qMovie);
  }).then(function(movies) {
    if (movies.length > 0) {
      self.createSectionRow(rowsContainer, 'Películas Destacadas', movies, 'movie');
    }
    return window.dbManager.getChannels(qSeries);
  }).then(function(series) {
    if (series.length > 0) {
      self.createSectionRow(rowsContainer, 'Series & Documentales', series, 'series');
    }
    return window.dbManager.getHistory(10);
  }).then(function(history) {
    if (history.length > 0) {
      self.createSectionRow(rowsContainer, 'Continuar Viendo', history, 'history');
    }
  });
};

CanaimaFlixApp.prototype.createSectionRow = function(container, title, items, rowType) {
  var self = this;
  var row = document.createElement('div');
  row.className = 'section-row';
  var trackId = 'track_' + rowType + '_' + Math.floor(Math.random() * 100000);

  row.innerHTML = 
    '<div class="section-header">' +
      '<div class="section-title-wrap">' +
        '<h3 class="section-title">' + title + '</h3>' +
      '</div>' +
      '<div class="section-actions">' +
        '<span class="view-all-link" data-type="' + rowType + '">Ver todos</span>' +
        '<div class="nav-arrows">' +
          '<button class="arrow-btn btn-prev" title="Anterior">' +
            '<span class="arrow-icon">' + window.getSVG('arrowLeft') + '</span>' +
          '</button>' +
          '<button class="arrow-btn btn-next" title="Siguiente">' +
            '<span class="arrow-icon">' + window.getSVG('arrowRight') + '</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cards-track" id="' + trackId + '"></div>';

  var track = row.querySelector('#' + trackId);

  for (var i = 0; i < items.length; i++) {
    (function(item) {
      var card = self.buildMediaCard(item);
      track.appendChild(card);
    })(items[i]);
  }

  // Hook funcional para "Ver todos": abre el catálogo completo para este tipo o sección
  var viewAllLink = row.querySelector('.view-all-link');
  if (viewAllLink) {
    viewAllLink.addEventListener('click', function() {
      self.renderCatalogView({
        title: title,
        type: (rowType === 'live' || rowType === 'movie' || rowType === 'series') ? rowType : null,
        sourceId: self.activeSourceId,
        favorite: rowType === 'favorites'
      });
    });
  }

  var prevBtn = row.querySelector('.btn-prev');
  var nextBtn = row.querySelector('.btn-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      track.scrollLeft -= 350;
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      track.scrollLeft += 350;
    });
  }

  container.appendChild(row);
};

CanaimaFlixApp.prototype.buildMediaCard = function(item) {
  var card = document.createElement('div');
  card.className = 'media-card';
  var placeholder = window.getChannelPlaceholder(item.name, item.type);
  var isImgur = item.logo && item.logo.indexOf('imgur.com') !== -1;
  var thumb = (item.logo && !isImgur) ? item.logo : placeholder;
  var typeTag = item.type === 'live' ? 'EN VIVO' : (item.type === 'movie' ? 'PELÍCULA' : 'SERIE');
  var tagClass = item.type || 'live';

  card.innerHTML = 
    '<div class="card-poster">' +
      '<img src="' + thumb + '" alt="' + item.name + '" />' +
      '<span class="card-tag ' + tagClass + '">' + typeTag + '</span>' +
    '</div>' +
    '<div class="card-details">' +
      '<div class="card-type-label">' + (item.groupTitle || 'Canal') + '</div>' +
      '<div class="card-title" title="' + item.name + '">' + item.name + '</div>' +
      '<div class="card-meta-row">' +
        '<span class="card-badge">HD</span>' +
        '<span class="card-subtext">' + (item.type === 'live' ? 'Señal en directo' : 'Bajo Demanda') + '</span>' +
      '</div>' +
    '</div>';

  var img = card.querySelector('img');
  if (img) {
    img.onerror = function() {
      this.src = placeholder;
    };
  }

  card.addEventListener('click', function() {
    window.playerController.play(item);
  });

  return card;
};

/* ==========================================================================
   CATÁLOGO COMPLETO, FILTRADO Y PAGINACIÓN PARA 2000+ CANALES
   ========================================================================== */

CanaimaFlixApp.prototype.renderCatalogView = function(opts) {
  opts = opts || {};
  var rowsContainer = document.getElementById('content-rows-container');
  var heroSection = document.getElementById('hero-section');
  if (!rowsContainer) return;

  // Al abrir el catálogo completo, ocultamos el hero para maximizar visibilidad
  if (heroSection) heroSection.style.display = 'none';

  var self = this;
  var title = opts.title || 'Catálogo de Canales';
  var type = opts.type || null;
  var sourceId = opts.sourceId || this.activeSourceId;
  var favorite = !!opts.favorite;
  var groupTitle = opts.groupTitle || 'all';

  self.catalogState = {
    title: title,
    type: type,
    sourceId: sourceId,
    favorite: favorite,
    groupTitle: groupTitle,
    search: opts.search || '',
    offset: 0,
    limit: 40,
    total: 0,
    loaded: 0,
    isLoading: false
  };

  rowsContainer.innerHTML = 
    '<div class="catalog-container">' +
      '<div class="catalog-header">' +
        '<div class="catalog-title-wrap">' +
          '<h2 class="catalog-title">' + title + '</h2>' +
          '<span class="catalog-count-badge" id="catalog-count-badge">Cargando...</span>' +
        '</div>' +
        '<div class="catalog-view-toggle">' +
          '<button class="btn-catalog-back" id="btn-catalog-back-home">' +
            '<span style="margin-right:6px">‹</span> Volver al Inicio' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="group-filter-scroll" id="catalog-groups-bar"></div>' +
      '<div class="channels-grid" id="catalog-channels-grid"></div>' +
      '<div class="catalog-load-section" id="catalog-load-section" style="display:none">' +
        '<div class="catalog-progress-text" id="catalog-progress-text"></div>' +
        '<button class="btn-load-more" id="btn-load-more">Cargar más canales</button>' +
      '</div>' +
    '</div>';

  var backHomeBtn = document.getElementById('btn-catalog-back-home');
  if (backHomeBtn) {
    backHomeBtn.addEventListener('click', function() {
      self.selectSource('all');
    });
  }

  // Carga de categorías / grupos del listado para los chips de filtro
  window.dbManager.getGroups(sourceId).then(function(groups) {
    var groupsBar = document.getElementById('catalog-groups-bar');
    if (!groupsBar) return;
    groupsBar.innerHTML = '';

    if (groups && groups.length > 1) {
      // Chip "Todos los grupos"
      var allChip = document.createElement('button');
      allChip.className = 'group-chip ' + (self.catalogState.groupTitle === 'all' ? 'active' : '');
      allChip.innerHTML = 'Todos';
      allChip.addEventListener('click', function() {
        self.catalogState.groupTitle = 'all';
        self.reloadCatalogChannels();
      });
      groupsBar.appendChild(allChip);

      // Mostrar grupos existentes ordenados por volumen de canales
      var maxG = Math.min(groups.length, 35);
      for (var i = 0; i < maxG; i++) {
        (function(g) {
          var chip = document.createElement('button');
          chip.className = 'group-chip ' + (self.catalogState.groupTitle === g.name ? 'active' : '');
          chip.innerHTML = g.name + '<span class="group-chip-count">' + g.count + '</span>';
          chip.addEventListener('click', function() {
            self.catalogState.groupTitle = g.name;
            self.reloadCatalogChannels();
          });
          groupsBar.appendChild(chip);
        })(groups[i]);
      }
    } else {
      groupsBar.style.display = 'none';
    }
  });

  self.reloadCatalogChannels();
};

CanaimaFlixApp.prototype.reloadCatalogChannels = function() {
  var self = this;
  var grid = document.getElementById('catalog-channels-grid');
  var badge = document.getElementById('catalog-count-badge');
  var loadSec = document.getElementById('catalog-load-section');
  if (!grid) return;

  grid.innerHTML = '<div style="padding:40px;color:#8E9BAE;text-align:center;width:100%">Cargando canales...</div>';
  if (loadSec) loadSec.style.display = 'none';

  self.catalogState.offset = 0;
  self.catalogState.loaded = 0;

  var countOpts = {
    sourceId: self.catalogState.sourceId,
    type: self.catalogState.type,
    groupTitle: self.catalogState.groupTitle,
    favorite: self.catalogState.favorite,
    search: self.catalogState.search
  };

  window.dbManager.getChannelCount(countOpts).then(function(total) {
    self.catalogState.total = total;
    if (badge) {
      badge.textContent = total + ' ' + (total === 1 ? 'canal' : 'canales');
    }

    // Actualizar estilo visual activo en chips de grupos
    var chips = document.querySelectorAll('.group-chip');
    for (var c = 0; c < chips.length; c++) {
      var isAct = (self.catalogState.groupTitle === 'all' && c === 0) || 
                  (chips[c].textContent.indexOf(self.catalogState.groupTitle) === 0 && self.catalogState.groupTitle !== 'all');
      chips[c].className = isAct ? 'group-chip active' : 'group-chip';
    }

    grid.innerHTML = '';
    if (total === 0) {
      grid.innerHTML = '<div style="padding:60px 20px;color:#56657F;text-align:center;width:100%">No se encontraron canales en esta categoría o lista.</div>';
      return;
    }

    self.loadNextCatalogBatch();
  });
};

CanaimaFlixApp.prototype.loadNextCatalogBatch = function() {
  var self = this;
  if (self.catalogState.isLoading) return;
  if (self.catalogState.loaded >= self.catalogState.total && self.catalogState.total > 0) return;

  self.catalogState.isLoading = true;
  var loadSec = document.getElementById('catalog-load-section');
  var loadBtn = document.getElementById('btn-load-more');
  var progText = document.getElementById('catalog-progress-text');
  var grid = document.getElementById('catalog-channels-grid');
  if (!grid) return;

  if (loadBtn) {
    loadBtn.disabled = true;
    loadBtn.textContent = 'Cargando canales...';
  }

  var queryOpts = {
    sourceId: self.catalogState.sourceId,
    type: self.catalogState.type,
    groupTitle: self.catalogState.groupTitle,
    favorite: self.catalogState.favorite,
    search: self.catalogState.search,
    offset: self.catalogState.offset,
    limit: self.catalogState.limit
  };

  window.dbManager.getChannels(queryOpts).then(function(items) {
    self.catalogState.isLoading = false;
    if (!items || items.length === 0) {
      if (loadSec) loadSec.style.display = 'none';
      return;
    }

    for (var i = 0; i < items.length; i++) {
      var card = self.buildMediaCard(items[i]);
      grid.appendChild(card);
    }

    self.catalogState.loaded += items.length;
    self.catalogState.offset += items.length;

    if (loadSec) {
      if (self.catalogState.loaded < self.catalogState.total) {
        loadSec.style.display = 'block';
        if (progText) {
          progText.textContent = 'Mostrando ' + self.catalogState.loaded + ' de ' + self.catalogState.total + ' canales';
        }
        if (loadBtn) {
          loadBtn.disabled = false;
          loadBtn.style.display = 'inline-block';
          var remaining = self.catalogState.total - self.catalogState.loaded;
          var nextBatchSize = Math.min(self.catalogState.limit, remaining);
          loadBtn.textContent = 'Cargar más canales (+' + nextBatchSize + ')';
          loadBtn.onclick = function() {
            self.loadNextCatalogBatch();
          };
        }
      } else {
        loadSec.style.display = 'block';
        if (progText) {
          progText.textContent = 'Se han mostrado todos los ' + self.catalogState.total + ' canales de la lista.';
        }
        if (loadBtn) loadBtn.style.display = 'none';
      }
    }
  }).catch(function() {
    self.catalogState.isLoading = false;
    if (loadBtn) {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Reintentar cargar';
    }
  });
};

CanaimaFlixApp.prototype.setupInfiniteScroll = function() {
  var self = this;
  var content = document.getElementById('main-content');
  var target = content || window;

  var scrollTimer = null;
  target.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      var scrollPos = content ? (content.scrollTop + content.clientHeight) : (window.innerHeight + window.scrollY);
      var maxScroll = content ? content.scrollHeight : document.body.offsetHeight;

      // Si el usuario llega al 85% del scroll y estamos en catálogo, auto-cargar lote siguiente
      if (scrollPos >= maxScroll - 300) {
        if (self.catalogState.loaded > 0 && self.catalogState.loaded < self.catalogState.total) {
          self.loadNextCatalogBatch();
        }
      }
    }, 150);
  });
};

CanaimaFlixApp.prototype.loadFastLaunch = function() {
  var list = document.getElementById('fast-launch-list');
  if (!list) return Promise.resolve();

  var q = { limit: 4 };
  if (this.activeSourceId !== 'all') {
    q.sourceId = this.activeSourceId;
  }

  return window.dbManager.getChannels(q).then(function(channels) {
    list.innerHTML = '';
    for (var i = 0; i < channels.length; i++) {
      (function(ch) {
        var item = document.createElement('div');
        item.className = 'fast-launch-item';
        var thumb = ch.logo || window.getChannelPlaceholder(ch.name, ch.type);

        item.innerHTML = 
          '<div class="fast-launch-thumb">' +
            '<img src="' + thumb + '" style="width:100%;height:100%;object-fit:cover;border-radius:4px" />' +
          '</div>' +
          '<span class="fast-launch-name">' + ch.name + '</span>';

        var img = item.querySelector('img');
        if (img) {
          img.onerror = function() {
            this.src = window.getChannelPlaceholder(ch.name, ch.type);
          };
        }

        item.addEventListener('click', function() {
          window.playerController.play(ch);
        });

        list.appendChild(item);
      })(channels[i]);
    }
  });
};

CanaimaFlixApp.prototype.setupNavigation = function() {
  var self = this;
  var navItems = document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]');
  for (var i = 0; i < navItems.length; i++) {
    navItems[i].addEventListener('click', function(e) {
      var view = e.currentTarget.getAttribute('data-view');
      self.currentView = view;
      for (var j = 0; j < navItems.length; j++) {
        navItems[j].className = navItems[j].className.replace(/\bactive\b/g, '').trim();
      }
      e.currentTarget.className += ' active';
      self.filterByView(view);
    });
  }

  var favTopBtn = document.getElementById('btn-top-favs');
  if (favTopBtn) {
    favTopBtn.addEventListener('click', function() {
      self.currentView = 'favorites';
      self.filterByView('favorites');
    });
  }
};

CanaimaFlixApp.prototype.filterByView = function(view) {
  var rowsContainer = document.getElementById('content-rows-container');
  var heroSection = document.getElementById('hero-section');
  if (!rowsContainer) return;
  var self = this;

  if (view === 'home') {
    if (heroSection) heroSection.style.display = 'block';
    this.loadHeroCarousel();
    this.loadContentRows();
  } else if (view === 'live') {
    this.renderCatalogView({
      title: 'Todos los Canales En Vivo',
      type: 'live',
      sourceId: self.activeSourceId
    });
  } else if (view === 'movies') {
    this.renderCatalogView({
      title: 'Catálogo de Películas',
      type: 'movie',
      sourceId: self.activeSourceId
    });
  } else if (view === 'series') {
    this.renderCatalogView({
      title: 'Series & Documentales',
      type: 'series',
      sourceId: self.activeSourceId
    });
  } else if (view === 'favorites') {
    this.renderCatalogView({
      title: 'Mis Canales Favoritos',
      favorite: true,
      sourceId: self.activeSourceId
    });
  }
};

CanaimaFlixApp.prototype.setupSearch = function() {
  var self = this;
  var searchInput = document.getElementById('global-search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', function(e) {
    clearTimeout(self.searchDebounce);
    var query = e.target.value.trim();

    self.searchDebounce = setTimeout(function() {
      if (!query) {
        self.filterByView(self.currentView || 'home');
        return;
      }

      // Catálogo con resultados de búsqueda
      self.renderCatalogView({
        title: 'Búsqueda: "' + query + '"',
        search: query,
        sourceId: self.activeSourceId
      });
    }, 250);
  });
};

CanaimaFlixApp.prototype.setupResponsive = function() {
  var hamburgerBtn = document.getElementById('btn-hamburger');
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');

  if (hamburgerBtn && sidebar && backdrop) {
    hamburgerBtn.addEventListener('click', function() {
      if (sidebar.className.indexOf('open') === -1) {
        sidebar.className += ' open';
        backdrop.className += ' open';
      } else {
        sidebar.className = sidebar.className.replace(/\bopen\b/g, '').trim();
        backdrop.className = backdrop.className.replace(/\bopen\b/g, '').trim();
      }
    });

    backdrop.addEventListener('click', function() {
      sidebar.className = sidebar.className.replace(/\bopen\b/g, '').trim();
      backdrop.className = backdrop.className.replace(/\bopen\b/g, '').trim();
    });
  }
};

// Inicialización de la aplicación
window.app = new CanaimaFlixApp();
document.addEventListener('DOMContentLoaded', function() {
  window.app.init();
});
