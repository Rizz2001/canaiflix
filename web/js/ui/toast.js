/**
 * CanaimaFlix - Sistema de Notificaciones Toast Ligeras
 */

class ToastManager {
  constructor() {
    this.container = null;
  }

  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  /**
   * Muestra un mensaje flotante
   * @param {string} message - Texto del aviso
   * @param {'info'|'success'|'error'} type - Tipo de notificación
   * @param {number} duration - Duración en milisegundos
   */
  show(message, type = 'info', duration = 3000) {
    if (!this.container) this.init();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check';
    if (type === 'error') iconName = 'close';

    toast.innerHTML = `
      <span class="toast-icon">${window.getSVG(iconName)}</span>
      <span class="toast-text">${message}</span>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
}

window.toast = new ToastManager();
