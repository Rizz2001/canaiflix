/**
 * CanaimaFlix - Controlador de Reproducción de Video
 * Soporta reproductor interno HLS.js con bajo buffer y lanzador nativo de VLC para Android.
 */

class PlayerController {
  constructor() {
    this.hls = null;
    this.videoElement = null;
    this.currentChannel = null;
    this.modal = null;
    this.titleElement = null;
    this.isPlaying = false;
  }

  init() {
    this.modal = document.getElementById('player-modal');
    this.videoElement = document.getElementById('main-video-player');
    this.titleElement = document.getElementById('player-title');

    // Manejo de eventos del reproductor
    if (this.videoElement) {
      this.videoElement.addEventListener('timeupdate', () => {
        if (this.currentChannel && this.videoElement.duration > 0) {
          window.dbManager.saveHistory(
            this.currentChannel,
            this.videoElement.currentTime,
            this.videoElement.duration
          );
        }
      });

      this.videoElement.addEventListener('play', () => {
        this.isPlaying = true;
        this.updateMiniPlayer(true);
      });

      this.videoElement.addEventListener('pause', () => {
        this.isPlaying = false;
        this.updateMiniPlayer(false);
      });
    }

    // Botón de cerrar modal
    const closeBtn = document.getElementById('btn-close-player');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Botón de lanzar en VLC
    const vlcBtn = document.getElementById('btn-launch-vlc');
    if (vlcBtn) {
      vlcBtn.addEventListener('click', () => {
        if (this.currentChannel) {
          this.launchVLC(this.currentChannel.streamUrl, this.currentChannel.name);
        }
      });
    }
  }

  /**
   * Inicia la reproducción de un canal o película
   */
  play(channel) {
    if (!channel || !channel.streamUrl) return;
    this.currentChannel = channel;

    if (this.titleElement) {
      this.titleElement.textContent = channel.name;
    }

    if (this.modal) {
      this.modal.classList.add('active');
    }

    const streamUrl = channel.streamUrl;
    const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('/live/');

    // Limpieza de instancia previa de HLS
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (isHls && window.Hls && window.Hls.isSupported()) {
      // Configuración de buffer ultra ligera para 1 GB de RAM
      this.hls = new window.Hls({
        maxBufferSize: 12 * 1024 * 1024, // 12 MB de buffer máximo
        maxBufferLength: 10,             // 10 segundos
        backBufferLength: 5,             // 5 segundos hacia atrás
        enableWorker: true,
        lowLatencyMode: true
      });

      this.hls.loadSource(streamUrl);
      this.hls.attachMedia(this.videoElement);
      this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        this.videoElement.play().catch(e => console.warn('Autoplay bloqueado:', e));
      });

      this.hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('Error fatal en HLS, ofreciendo opción VLC:', data);
          window.toast.show('Error al cargar stream. Prueba abrirlo con VLC.', 'error');
        }
      });
    } else {
      // Reproducción directa nativa HTML5 (mp4, webm u otro contenedor)
      this.videoElement.src = streamUrl;
      this.videoElement.play().catch(e => console.warn('Autoplay nativo bloqueado:', e));
    }

    this.updateMiniPlayer(true);
  }

  /**
   * Lanza VLC for Android mediante un intent URL nativo
   */
  launchVLC(streamUrl, title = '') {
    try {
      // Intent nativo para Android KitKat / Firefox
      const cleanUrl = streamUrl.replace(/^https?:\/\//, '');
      const scheme = streamUrl.startsWith('https') ? 'https' : 'http';
      const intentUrl = `intent://${cleanUrl}#Intent;scheme=${scheme};package=org.videolan.vlc;type=video/*;S.title=${encodeURIComponent(title)};end`;

      window.location.href = intentUrl;
      window.toast.show(`Abriendo ${title || 'canal'} en VLC...`, 'info');
    } catch (e) {
      // Fallback estándar
      window.location.href = `vlc://${streamUrl}`;
    }
  }

  /**
   * Actualiza el widget del mini reproductor en el sidebar
   */
  updateMiniPlayer(playing) {
    const miniPlayer = document.getElementById('sidebar-mini-player');
    const miniTitle = document.getElementById('mini-player-title');
    const miniThumb = document.getElementById('mini-player-thumb');

    if (!miniPlayer || !this.currentChannel) return;

    if (miniTitle) miniTitle.textContent = this.currentChannel.name;
    if (miniThumb && this.currentChannel.logo) {
      miniThumb.src = this.currentChannel.logo;
    }

    miniPlayer.style.display = 'flex';
  }

  close() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.modal) {
      this.modal.classList.remove('active');
    }
    this.isPlaying = false;
  }
}

window.playerController = new PlayerController();
