/**
 * CanaimaFlix - Gestor de Fuentes M3U y Modal de Carga
 */

class SourceModalManager {
  constructor() {
    this.modal = null;
    this.activeTab = 'url';
  }

  init() {
    this.modal = document.getElementById('source-modal');

    // Botón abrir modal desde Top Bar
    const openBtn = document.getElementById('btn-add-source');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.open());
    }

    // Botón cerrar modal
    const closeBtn = document.getElementById('btn-close-source-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Pestañas (URL, Archivo Local, Demo)
    const tabs = document.querySelectorAll('.tab-btn[data-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.switchTab(e.currentTarget.dataset.tab);
      });
    });

    // Envío del formulario
    const submitBtn = document.getElementById('btn-submit-source');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleImport());
    }

    // Botón de Cargar Canales Demo Libres
    const loadDemoBtn = document.getElementById('btn-load-demo');
    if (loadDemoBtn) {
      loadDemoBtn.addEventListener('click', () => this.loadDemoChannels());
    }
  }

  open() {
    if (this.modal) this.modal.classList.add('active');
  }

  close() {
    if (this.modal) this.modal.classList.remove('active');
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    const tabUrl = document.getElementById('tab-content-url');
    const tabFile = document.getElementById('tab-content-file');
    const tabDemo = document.getElementById('tab-content-demo');

    if (tabUrl) tabUrl.style.display = tabName === 'url' ? 'block' : 'none';
    if (tabFile) tabFile.style.display = tabName === 'file' ? 'block' : 'none';
    if (tabDemo) tabDemo.style.display = tabName === 'demo' ? 'block' : 'none';
  }

  async handleImport() {
    const nameInput = document.getElementById('source-name-input');
    const sourceName = (nameInput && nameInput.value.trim()) || 'Mi Lista IPTV';
    const sourceId = `src_${Date.now()}`;

    const progressContainer = document.getElementById('import-progress-container');
    const progressText = document.getElementById('import-progress-text');
    const progressBar = document.getElementById('import-progress-bar');

    if (progressContainer) progressContainer.style.display = 'block';

    try {
      let m3uText = '';

      if (this.activeTab === 'url') {
        const urlInput = document.getElementById('source-url-input');
        const url = urlInput ? urlInput.value.trim() : '';
        if (!url) {
          window.toast.show('Por favor ingresa una URL válida.', 'error');
          return;
        }

        if (progressText) progressText.textContent = 'Descargando lista...';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        m3uText = await response.text();
      } else if (this.activeTab === 'file') {
        const fileInput = document.getElementById('source-file-input');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          window.toast.show('Por favor selecciona un archivo .m3u o .m3u8.', 'error');
          return;
        }

        const file = fileInput.files[0];
        if (progressText) progressText.textContent = `Leyendo ${file.name}...`;
        m3uText = await file.text();
      }

      if (!m3uText) {
        throw new Error('El contenido M3U está vacío.');
      }

      // Procesar y guardar en streaming
      if (progressText) progressText.textContent = 'Procesando canales e indexando...';

      const totalChannels = await window.M3UStreamParser.parseAndSave(
        m3uText,
        sourceId,
        (count) => {
          if (progressText) progressText.textContent = `Guardados ${count} canales...`;
          if (progressBar) progressBar.style.width = '75%';
        }
      );

      // Guardar fuente
      await window.dbManager.saveSource({
        id: sourceId,
        name: sourceName,
        count: totalChannels,
        dateAdded: Date.now()
      });

      if (progressBar) progressBar.style.width = '100%';
      window.toast.show(`¡${totalChannels} canales importados con éxito!`, 'success');

      // Cerrar modal y refrescar la app
      setTimeout(() => {
        this.close();
        if (progressContainer) progressContainer.style.display = 'none';
        if (window.app) window.app.refreshDashboard();
      }, 800);

    } catch (err) {
      console.error('Error al importar lista:', err);
      window.toast.show(`Error: ${err.message}`, 'error');
      if (progressContainer) progressContainer.style.display = 'none';
    }
  }

  /**
   * Carga una lista de canales de demostración libres (IPTV-org libres legales)
   */
  async loadDemoChannels() {
    const demoM3U = `#EXTM3U
#EXTINF:-1 tvg-id="DW.de" tvg-name="DW Español" tvg-logo="https://i.imgur.com/kY1yTZZ.png" group-title="Noticias",DW Español (En Vivo)
https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8
#EXTINF:-1 tvg-id="RTVE.es" tvg-name="RTVE 24h" tvg-logo="https://i.imgur.com/zVv6Nkn.png" group-title="Noticias",RTVE 24H
https://rtvelivestream.akamaized.net/rtvesec/24h/24h_main.m3u8
#EXTINF:-1 tvg-id="Telesur.ve" tvg-name="Telesur" tvg-logo="https://i.imgur.com/8QO9M4D.png" group-title="Latinoamérica",TeleSUR HD
https://telesur.bozztv.com/telesur/live/playlist.m3u8
#EXTINF:-1 tvg-id="Euronews.es" tvg-name="Euronews" tvg-logo="https://i.imgur.com/7bQoE9o.png" group-title="Noticias",Euronews Español
https://euronews-euronews-spanish-1-es.samsung.wurl.com/manifest/playlist.m3u8
#EXTINF:-1 tvg-name="Sintel (Cine Libre)" tvg-logo="https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400" group-title="Películas",Sintel (Cine Libre 4K)
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4
#EXTINF:-1 tvg-name="Big Buck Bunny" tvg-logo="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400" group-title="Películas",Big Buck Bunny (Animación)
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
#EXTINF:-1 tvg-name="Tears of Steel" tvg-logo="https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400" group-title="Ciencia Ficción",Tears of Steel (Sci-Fi)
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 tvg-name="Cyberpunk Documental S01E01" tvg-logo="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400" group-title="Series",Cyberpunk Future S01E01
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4
`;

    const sourceId = 'src_demo';
    window.toast.show('Cargando canales de demostración libres...', 'info');

    const total = await window.M3UStreamParser.parseAndSave(demoM3U, sourceId);
    await window.dbManager.saveSource({
      id: sourceId,
      name: 'Canales Demo Oficiales',
      count: total,
      dateAdded: Date.now()
    });

    window.toast.show(`¡${total} canales de demostración listos!`, 'success');
    this.close();
    if (window.app) window.app.refreshDashboard();
  }
}

window.sourceModalManager = new SourceModalManager();
