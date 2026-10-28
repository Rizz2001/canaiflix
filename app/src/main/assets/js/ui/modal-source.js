/**
 * CanaimaFlix - Gestor de Fuentes M3U (Compatible ES5)
 */

function SourceModalManager() {
  this.modal = null;
  this.activeTab = 'url';
}

SourceModalManager.prototype.init = function() {
  var self = this;
  this.modal = document.getElementById('source-modal');

  var openBtn = document.getElementById('btn-add-source');
  if (openBtn) {
    openBtn.addEventListener('click', function() { self.open(); });
  }

  var closeBtn = document.getElementById('btn-close-source-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() { self.close(); });
  }

  if (this.modal) {
    this.modal.addEventListener('click', function(e) {
      if (e.target === self.modal) {
        self.close();
      }
    });
  }

  var tabs = document.querySelectorAll('.tab-btn[data-tab]');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function(e) {
      for (var j = 0; j < tabs.length; j++) tabs[j].className = tabs[j].className.replace(/\bactive\b/g, '').trim();
      e.currentTarget.className += ' active';
      self.switchTab(e.currentTarget.getAttribute('data-tab'));
    });
  }

  var submitBtn = document.getElementById('btn-submit-source');
  if (submitBtn) {
    submitBtn.addEventListener('click', function() { self.handleImport(); });
  }

  var loadDemoBtn = document.getElementById('btn-load-demo');
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', function() { self.loadDemoChannels(); });
  }

  var scanBtn = document.getElementById('btn-scan-storage');
  if (scanBtn) {
    scanBtn.addEventListener('click', function() { self.scanStorage(); });
  }
};

SourceModalManager.prototype.scanStorage = function() {
  var self = this;
  var container = document.getElementById('scanned-files-container');
  var list = document.getElementById('scanned-files-list');
  if (!container || !list) return;

  list.innerHTML = '<div style="padding:10px;text-align:center;color:#38BDF8;font-size:12px">Buscando archivos .m3u y .m3u8 en la memoria...</div>';
  container.style.display = 'block';

  setTimeout(function() {
    var jsonStr = '';
    if (window.CanaimaFlixNative && window.CanaimaFlixNative.scanStorageForPlaylists) {
      jsonStr = window.CanaimaFlixNative.scanStorageForPlaylists();
    }

    var files = [];
    try {
      if (jsonStr) files = JSON.parse(jsonStr);
    } catch (e) {}

    list.innerHTML = '';
    if (!files || files.length === 0) {
      list.innerHTML = '<div style="padding:10px;text-align:center;color:#8E9BAE;font-size:11px">No se encontraron archivos .m3u en las carpetas comunes (Download, Movies, etc). Puedes copiar tus listas a la carpeta Download de la tablet o seleccionarlo arriba.</div>';
      return;
    }

    for (var i = 0; i < files.length; i++) {
      (function(f) {
        var item = document.createElement('div');
        item.className = 'scanned-file-item';
        item.innerHTML = 
          '<div style="overflow:hidden;flex:1">' +
            '<div class="scanned-file-name" title="' + f.path + '">' + f.name + '</div>' +
            '<div style="font-size:10px;color:#56657F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + f.path + '</div>' +
          '</div>' +
          '<span class="scanned-file-size">' + (f.sizeFormatted || '') + '</span>';

        item.addEventListener('click', function() {
          var items = list.querySelectorAll('.scanned-file-item');
          for (var k = 0; k < items.length; k++) items[k].className = 'scanned-file-item';
          item.className += ' selected';
          self.selectedLocalFilePath = f.path;

          var nameInput = document.getElementById('source-name-input');
          if (nameInput && !nameInput.value.trim()) {
            nameInput.value = f.name.replace(/\.[^/.]+$/, '');
          }
          window.toast.show('Lista seleccionada: ' + f.name, 'info');
        });

        list.appendChild(item);
      })(files[i]);
    }
  }, 100);
};

SourceModalManager.prototype.open = function() {
  if (this.modal) this.modal.className += ' active';
};

SourceModalManager.prototype.close = function() {
  if (this.modal) this.modal.className = this.modal.className.replace(/\bactive\b/g, '').trim();
};

SourceModalManager.prototype.switchTab = function(tabName) {
  this.activeTab = tabName;
  var tabUrl = document.getElementById('tab-content-url');
  var tabFile = document.getElementById('tab-content-file');
  var tabDemo = document.getElementById('tab-content-demo');

  if (tabUrl) tabUrl.style.display = tabName === 'url' ? 'block' : 'none';
  if (tabFile) tabFile.style.display = tabName === 'file' ? 'block' : 'none';
  if (tabDemo) tabDemo.style.display = tabName === 'demo' ? 'block' : 'none';
};

SourceModalManager.prototype.handleImport = function() {
  var self = this;
  var nameInput = document.getElementById('source-name-input');
  var sourceName = (nameInput && nameInput.value.trim()) || 'Mi Lista IPTV';
  var sourceId = 'src_' + Date.now();

  var progressContainer = document.getElementById('import-progress-container');
  var progressText = document.getElementById('import-progress-text');
  var progressBar = document.getElementById('import-progress-bar');

  if (progressContainer) progressContainer.style.display = 'block';

  if (this.activeTab === 'url') {
    var urlInput = document.getElementById('source-url-input');
    var url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
      window.toast.show('Por favor ingresa una URL válida.', 'error');
      if (progressContainer) progressContainer.style.display = 'none';
      return;
    }

    if (progressText) progressText.textContent = 'Descargando lista...';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        self.processM3UText(xhr.responseText, sourceId, sourceName, progressContainer, progressText, progressBar);
      } else {
        window.toast.show('Error al descargar lista HTTP ' + xhr.status, 'error');
        if (progressContainer) progressContainer.style.display = 'none';
      }
    };
    xhr.onerror = function() {
      window.toast.show('Error de red al descargar lista', 'error');
      if (progressContainer) progressContainer.style.display = 'none';
    };
    xhr.send();
  } else if (this.activeTab === 'file') {
    if (self.selectedLocalFilePath && window.CanaimaFlixNative && window.CanaimaFlixNative.readLocalTextFile) {
      if (progressText) progressText.textContent = 'Leyendo lista desde almacenamiento...';
      var content = window.CanaimaFlixNative.readLocalTextFile(self.selectedLocalFilePath);
      if (!content) {
        window.toast.show('No se pudo leer el archivo seleccionado.', 'error');
        if (progressContainer) progressContainer.style.display = 'none';
        return;
      }
      self.processM3UText(content, sourceId, sourceName, progressContainer, progressText, progressBar);
      return;
    }

    var fileInput = document.getElementById('source-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      window.toast.show('Por favor selecciona un archivo o busca en la tablet.', 'error');
      if (progressContainer) progressContainer.style.display = 'none';
      return;
    }

    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      self.processM3UText(e.target.result, sourceId, sourceName, progressContainer, progressText, progressBar);
    };
    reader.onerror = function() {
      window.toast.show('Error al leer archivo', 'error');
      if (progressContainer) progressContainer.style.display = 'none';
    };
    reader.readAsText(file);
  }
};

SourceModalManager.prototype.processM3UText = function(text, sourceId, sourceName, progressContainer, progressText, progressBar) {
  var self = this;
  if (progressText) progressText.textContent = 'Procesando canales e indexando...';

  window.M3UStreamParser.parseAndSave(text, sourceId, function(count) {
    if (progressText) progressText.textContent = 'Guardados ' + count + ' canales...';
    if (progressBar) progressBar.style.width = '75%';
  }).then(function(totalChannels) {
    return window.dbManager.saveSource({
      id: sourceId,
      name: sourceName,
      count: totalChannels,
      dateAdded: Date.now()
    }).then(function() {
      if (progressBar) progressBar.style.width = '100%';
      window.toast.show('¡' + totalChannels + ' canales importados con éxito!', 'success');
      setTimeout(function() {
        self.close();
        if (progressContainer) progressContainer.style.display = 'none';
        if (window.app) window.app.refreshDashboard();
      }, 600);
    });
  }).catch(function(err) {
    window.toast.show('Error: ' + err.message, 'error');
    if (progressContainer) progressContainer.style.display = 'none';
  });
};

SourceModalManager.prototype.loadDemoChannels = function() {
  var self = this;
  var demoM3U = '#EXTM3U\n' +
    '#EXTINF:-1 tvg-name="DW Español" tvg-logo="https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400" group-title="Noticias",DW Español (En Vivo)\n' +
    'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8\n' +
    '#EXTINF:-1 tvg-name="RTVE 24H" tvg-logo="https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400" group-title="Noticias",RTVE 24H\n' +
    'https://rtvelivestream.akamaized.net/rtvesec/24h/24h_main.m3u8\n' +
    '#EXTINF:-1 tvg-name="TeleSUR HD" tvg-logo="https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?w=400" group-title="Latinoamérica",TeleSUR HD\n' +
    'https://telesur.bozztv.com/telesur/live/playlist.m3u8\n' +
    '#EXTINF:-1 tvg-name="Euronews Español" tvg-logo="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400" group-title="Noticias",Euronews Español\n' +
    'https://euronews-euronews-spanish-1-es.samsung.wurl.com/manifest/playlist.m3u8\n' +
    '#EXTINF:-1 tvg-name="Sintel (Cine Libre)" tvg-logo="https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400" group-title="Películas",Sintel (Cine Libre 4K)\n' +
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4\n' +
    '#EXTINF:-1 tvg-name="Big Buck Bunny" tvg-logo="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400" group-title="Películas",Big Buck Bunny (Animación)\n' +
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4\n' +
    '#EXTINF:-1 tvg-name="Tears of Steel" tvg-logo="https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400" group-title="Ciencia Ficción",Tears of Steel (Sci-Fi)\n' +
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4\n' +
    '#EXTINF:-1 tvg-name="Cyberpunk Future S01E01" tvg-logo="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400" group-title="Series",Cyberpunk Future S01E01\n' +
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4\n';

  var sourceId = 'src_demo';
  window.toast.show('Cargando canales de demostración libres...', 'info');

  window.M3UStreamParser.parseAndSave(demoM3U, sourceId).then(function(total) {
    return window.dbManager.saveSource({
      id: sourceId,
      name: 'Canales Demo Oficiales',
      count: total,
      dateAdded: Date.now()
    }).then(function() {
      window.toast.show('¡' + total + ' canales de demostración listos!', 'success');
      self.close();
      if (window.app) window.app.refreshDashboard();
    });
  });
};

window.sourceModalManager = new SourceModalManager();
