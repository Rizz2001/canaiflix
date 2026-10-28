/**
 * CanaimaFlix - Sistema de Notificaciones Toast (Compatible ES5)
 */

function ToastManager() {
  this.container = null;
}

ToastManager.prototype.init = function() {
  this.container = document.getElementById('toast-container');
  if (!this.container) {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    document.body.appendChild(this.container);
  }
};

ToastManager.prototype.show = function(message, type, duration) {
  if (!this.container) this.init();
  type = type || 'info';
  duration = duration || 3000;

  var toast = document.createElement('div');
  toast.className = 'toast ' + type;

  var iconName = 'info';
  if (type === 'success') iconName = 'check';
  if (type === 'error') iconName = 'close';

  toast.innerHTML = '<span class="toast-icon">' + window.getSVG(iconName) + '</span><span class="toast-text">' + message + '</span>';
  this.container.appendChild(toast);

  setTimeout(function() {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, duration);
};

window.toast = new ToastManager();
