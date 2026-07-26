import { Storage } from './storage.js';
import { DataService } from './data.js';
/**
 * BTS Progress Tracker - Authentication Module
 */
export const Auth = {
  async login(username, password) {
    if (!username || !password) {
      return { success: false, message: 'Vui lòng nhập đầy đủ thông tin' };
    }

    try {
      const result = await DataService.login(username, password);
      if (result.success) {
        Storage.setSession(result.user);
      }
      return result;
    } catch (error) {
      return { success: false, message: 'Lỗi kết nối server: ' + error.message };
    }
  },

  logout() {
    Storage.clearSession();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(key => caches.delete(key));
      });
    }
    setTimeout(() => { window.location.reload(true); }, 500);
  },

  getCurrentUser() {
    const session = Storage.getSession();
    return session || null;
  },

  getUsername() {
    const user = this.getCurrentUser();
    return user ? user.username : '';
  },

  getDisplayName() {
    const user = this.getCurrentUser();
    return user ? (user.displayName || user.username) : '';
  },

  getPro() {
    const user = this.getCurrentUser();
    return user ? (user.pro || '') : '';
  },

  getRole() {
    const user = this.getCurrentUser();
    if (!user) return 'view';
    if (user.role) return user.role.toLowerCase();
    if (user.username && user.username.toLowerCase() === 'admin') return 'admin';
    return 'view'; 
  },

  isLoggedIn() {
    return Storage.isLoggedIn();
  }
};
