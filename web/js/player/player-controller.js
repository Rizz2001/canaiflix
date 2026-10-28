/**
 * CanaimaFlix - Controlador de Reproducción (Compatible ES5)
 */

function PlayerController() {
  this.hls = null;
  this.videoElement = null;
  this.currentChannel = null;
  this.modal = null;
  this.titleElement = null;
  this.isPlaying = false;
}

PlayerController.prototype.init = function() {
  var self = this;
  this.modal = document.getElementById('player-modal');
  this.videoElement = document.getElementById('main-video-player');
  this.titleElement = document.getElementById('player-title');

  if (this.videoElement) {
    this.videoElement.addEventListener('timeupdate', function() {
      if (self.currentChannel && self.videoElement.duration > 0) {
        window.dbManager.saveHistory(
          self.currentChannel,
          self.videoElement.currentTime,
          self.videoElement.duration
        );
      }
    });

    this.videoElement.addEventListener('play', function() {
      self.isPlaying = true;
      self.updateMiniPlayer(true);
    });

    this.videoElement.addEventListener('pause', function() {
      self.isPlaying = false;
      self.updateMiniPlayer(false);
    });
  }

  var closeBtn = document.getElementById('btn-close-player');
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

  var fsBtn = document.getElementById('btn-player-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', function() { self.toggleFullscreen(); });
  }

  if (this.videoElement) {
    this.videoElement.addEventListener('dblclick', function() {
      self.toggleFullscreen();
    });
  }

  var vlcBtn = document.getElementById('btn-launch-vlc');
  if (vlcBtn) {
    vlcBtn.addEventListener('click', function() {
      if (self.currentChannel) {
        self.launchVLC(self.currentChannel.streamUrl, self.currentChannel.name);
      }
    });
  }
};

PlayerController.prototype.play = function(channel) {
  if (!channel || !channel.streamUrl) return;
  this.currentChannel = channel;

  // Registrar historial
  window.dbManager.saveHistory(channel, 0, 0);

  // Si estamos en la app Android nativa con ExoPlayer integrado:
  if (window.CanaimaFlixNative && window.CanaimaFlixNative.isNativePlayerSupported && window.CanaimaFlixNative.isNativePlayerSupported()) {
    this.updateMiniPlayer(true);
    window.CanaimaFlixNative.playNative(channel.streamUrl, channel.name || 'Canal');
    return;
  }

  // Fallback para navegador web / desktop
  if (this.titleElement) {
    this.titleElement.textContent = channel.name;
  }

  if (this.modal) {
    this.modal.className += ' active';
  }

  var streamUrl = channel.streamUrl;
  var isHls = streamUrl.indexOf('.m3u8') !== -1 || streamUrl.indexOf('/live/') !== -1;

  if (this.hls) {
    this.hls.destroy();
    this.hls = null;
  }

  var self = this;
  if (isHls && window.Hls && window.Hls.isSupported()) {
    this.hls = new window.Hls({
      maxBufferSize: 12 * 1024 * 1024,
      maxBufferLength: 10,
      backBufferLength: 5,
      enableWorker: true
    });

    this.hls.loadSource(streamUrl);
    this.hls.attachMedia(this.videoElement);
    this.hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
      self.videoElement.play();
    });
    this.hls.on(window.Hls.Events.ERROR, function(event, data) {
      if (data.fatal) {
        window.toast.show('Error al cargar stream. Prueba abrirlo con VLC.', 'error');
      }
    });
  } else {
    this.videoElement.src = streamUrl;
    this.videoElement.play();
  }

  this.updateMiniPlayer(true);
};

PlayerController.prototype.launchVLC = function(streamUrl, title) {
  title = title || '';
  try {
    if (window.CanaimaFlixNative && window.CanaimaFlixNative.launchVLC) {
      window.CanaimaFlixNative.launchVLC(streamUrl, title);
      window.toast.show('Abriendo ' + (title || 'canal') + ' en VLC...', 'info');
      return;
    }

    var cleanUrl = streamUrl.replace(/^https?:\/\//, '');
    var scheme = streamUrl.indexOf('https') === 0 ? 'https' : 'http';
    var intentUrl = 'intent://' + cleanUrl + '#Intent;scheme=' + scheme + ';package=org.videolan.vlc;type=video/*;S.title=' + encodeURIComponent(title) + ';end';

    window.location.href = intentUrl;
    window.toast.show('Abriendo ' + (title || 'canal') + ' en VLC...', 'info');
  } catch (e) {
    window.location.href = 'vlc://' + streamUrl;
  }
};

PlayerController.prototype.updateMiniPlayer = function() {
  var miniPlayer = document.getElementById('sidebar-mini-player');
  var miniTitle = document.getElementById('mini-player-title');
  var miniThumb = document.getElementById('mini-player-thumb');

  if (!miniPlayer || !this.currentChannel) return;

  if (miniTitle) miniTitle.textContent = this.currentChannel.name;
  if (miniThumb && this.currentChannel.logo) {
    miniThumb.src = this.currentChannel.logo;
  }

  miniPlayer.style.display = 'flex';
};

PlayerController.prototype.toggleFullscreen = function() {
  var content = document.getElementById('player-modal-content');
  if (!content) return;
  if (content.className.indexOf('fullscreen') === -1) {
    content.className += ' fullscreen';
    try {
      if (this.videoElement && this.videoElement.webkitRequestFullscreen) {
        this.videoElement.webkitRequestFullscreen();
      } else if (this.videoElement && this.videoElement.requestFullscreen) {
        this.videoElement.requestFullscreen();
      }
    } catch (e) {}
  } else {
    content.className = content.className.replace(/\bfullscreen\b/g, '').trim();
    try {
      if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) {}
  }
};

PlayerController.prototype.close = function() {
  if (window.CanaimaFlixNative && window.CanaimaFlixNative.stopNative) {
    try {
      window.CanaimaFlixNative.stopNative();
    } catch (e) {}
  }
  var content = document.getElementById('player-modal-content');
  if (content) {
    content.className = content.className.replace(/\bfullscreen\b/g, '').trim();
  }
  if (this.videoElement) {
    this.videoElement.pause();
    this.videoElement.src = '';
  }
  if (this.hls) {
    this.hls.destroy();
    this.hls = null;
  }
  if (this.modal) {
    this.modal.className = this.modal.className.replace(/\bactive\b/g, '').trim();
  }
  this.isPlaying = false;
};

window.playerController = new PlayerController();

// Eventos enviados desde NativePlayer (Java) al WebView
window.onNativePlayerEvent = function(state, message) {
  if (state === 'playing') {
    if (window.playerController) {
      window.playerController.isPlaying = true;
      window.playerController.updateMiniPlayer(true);
    }
  } else if (state === 'closed' || state === 'ended') {
    if (window.playerController) {
      window.playerController.isPlaying = false;
      window.playerController.updateMiniPlayer(false);
    }
  } else if (state === 'error') {
    if (window.toast) {
      window.toast.show(message || 'Error en reproducción.', 'error');
    }
  }
};
