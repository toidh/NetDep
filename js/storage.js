import { AppConfig } from './config.js';
/**
 * BTS Progress Tracker - Local Storage Manager
 */
export const Storage = {
  get(key) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return null;
      return JSON.parse(value);
    } catch (e) {
      return localStorage.getItem(key);
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] Error saving:', e);
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  clear() {
    Object.values(AppConfig.STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  },

  // ============================================================
  // Session Management
  // ============================================================
  getSession() {
    return this.get(AppConfig.STORAGE_KEYS.SESSION);
  },

  setSession(user) {
    this.set(AppConfig.STORAGE_KEYS.SESSION, {
      ...user,
      loginTime: new Date().toISOString()
    });
  },

  clearSession() {
    this.remove(AppConfig.STORAGE_KEYS.SESSION);
  },

  isLoggedIn() {
    return this.getSession() !== null;
  },

  // ============================================================
  // API URL
  // ============================================================
  getApiUrl() {
    // Ưu tiên dùng URL từ config.js (hardcoded)
    return AppConfig.API_URL || this.get(AppConfig.STORAGE_KEYS.API_URL) || '';
  },

  setApiUrl(url) {
    this.set(AppConfig.STORAGE_KEYS.API_URL, url);
  },

  // ============================================================
  // Sites Data Cache
  // ============================================================
  getSitesData() {
    return this.get(AppConfig.STORAGE_KEYS.SITES_DATA);
  },

  setSitesData(data) {
    this.set(AppConfig.STORAGE_KEYS.SITES_DATA, {
      sites: data,
      cachedAt: new Date().toISOString()
    });
  },

  // ============================================================
  // Pending Updates (for offline sync)
  // ============================================================
  getPendingUpdates() {
    return this.get(AppConfig.STORAGE_KEYS.PENDING_UPDATES) || [];
  },

  addPendingUpdate(update) {
    const pending = this.getPendingUpdates();
    // Replace if same site exists
    const existingIndex = pending.findIndex(p => p.site === update.site);
    if (existingIndex >= 0) {
      pending[existingIndex] = update;
    } else {
      pending.push(update);
    }
    this.set(AppConfig.STORAGE_KEYS.PENDING_UPDATES, pending);
  },

  clearPendingUpdates() {
    this.remove(AppConfig.STORAGE_KEYS.PENDING_UPDATES);
  },

  removePendingUpdate(siteName) {
    const pending = this.getPendingUpdates();
    const filtered = pending.filter(p => p.site !== siteName);
    this.set(AppConfig.STORAGE_KEYS.PENDING_UPDATES, filtered);
  },

  // ============================================================
  // Last sync time
  // ============================================================
  getLastSync() {
    return this.get(AppConfig.STORAGE_KEYS.LAST_SYNC);
  },

  setLastSync() {
    this.set(AppConfig.STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  },

  // ============================================================
  // Map State
  // ============================================================
  getMapState() {
    return this.get(AppConfig.STORAGE_KEYS.MAP_STATE);
  },

  setMapState(center, zoom) {
    this.set(AppConfig.STORAGE_KEYS.MAP_STATE, { center, zoom });
  }
};
