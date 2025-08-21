/**
 * Абсурдная Игра - Service Worker v2.0
 * Современный SW с кэшированием, offline поддержкой и background sync
 */

'use strict';

// ================================================
// 📋 КОНФИГУРАЦИЯ
// ================================================

const SW_VERSION = '2.0.0';
const CACHE_NAME = `absudia-v${SW_VERSION}`;
const DATA_CACHE_NAME = `absudia-data-v${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Ресурсы для кэширования при установке
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/phrases.json',
  '/manifest.json',
  '/offline.html',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/favicon-16x16.png'
];

// Стратегии кэширования для разных типов ресурсов
const CACHE_STRATEGIES = {
  // Стратегия "Сначала кэш, потом сеть"
  CACHE_FIRST: 'cache-first',
  // Стратегия "Сначала сеть, потом кэш" 
  NETWORK_FIRST: 'network-first',
  // Стратегия "Только кэш"
  CACHE_ONLY: 'cache-only',
  // Стратегия "Только сеть"
  NETWORK_ONLY: 'network-only',
  // Стратегия "Устаревший контент во время повторной валидации"
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Паттерны URL и их стратегии кэширования
const ROUTE_STRATEGIES = [
  {
    pattern: /^https:\/\/fonts\.googleapis\.com/,
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    cacheName: 'google-fonts-stylesheets'
  },
  {
    pattern: /^https:\/\/fonts\.gstatic\.com/,
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    cacheName: 'google-fonts-webfonts',
    cacheExpiration: {
      maxEntries: 30,
      maxAgeSeconds: 60 * 60 * 24 * 365 // 1 год
    }
  },
  {
    pattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    cacheName: 'images',
    cacheExpiration: {
      maxEntries: 60,
      maxAgeSeconds: 60 * 60 * 24 * 30 // 30 дней
    }
  },
  {
    pattern: /\.(?:js|css)$/,
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    cacheName: 'static-resources'
  },
  {
    pattern: /\/phrases\.json$/,
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    cacheName: 'api-cache',
    cacheExpiration: {
      maxEntries: 5,
      maxAgeSeconds: 60 * 60 * 24 // 24 часа
    }
  }
];

// ================================================
// 🔧 УТИЛИТЫ
// ================================================

class CacheManager {
  /**
   * Проверяет, находится ли запрос в кэше
   */
  static async isInCache(request, cacheName = CACHE_NAME) {
    const cache = await caches.open(cacheName);
    const response = await cache.match(request);
    return !!response;
  }

  /**
   * Добавляет ответ в кэш
   */
  static async addToCache(request, response, cacheName = CACHE_NAME) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }

  /**
   * Получает ответ из кэша
   */
  static async getFromCache(request, cacheName = CACHE_NAME) {
    const cache = await caches.open(cacheName);
    return await cache.match(request);
  }

  /**
   * Удаляет устаревшие кэши
   */
  static async cleanupOldCaches(currentCacheName) {
    const cacheNames = await caches.keys();
    const deletePromises = cacheNames
      .filter(name => name !== currentCacheName && name.startsWith('absudia-'))
      .map(name => caches.delete(name));
    
    return Promise.all(deletePromises);
  }

  /**
   * Управляет размером кэша
   */
  static async limitCacheSize(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    if (keys.length > maxEntries) {
      const keysToDelete = keys.slice(0, keys.length - maxEntries);
      await Promise.all(keysToDelete.map(key => cache.delete(key)));
    }
  }

  /**
   * Очищает устаревшие записи кэша
   */
  static async cleanupExpiredEntries(cacheName, maxAge) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const now = Date.now();
    
    for (const key of keys) {
      const response = await cache.match(key);
      if (response) {
        const cachedTime = new Date(response.headers.get('date')).getTime();
        if (now - cachedTime > maxAge * 1000) {
          await cache.delete(key);
        }
      }
    }
  }
}

class NetworkManager {
  /**
   * Выполняет сетевой запрос с таймаутом
   */
  static async fetchWithTimeout(request, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(request, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Проверяет статус соединения
   */
  static isOnline() {
    return navigator.onLine;
  }

  /**
   * Проверяет, является ли ответ валидным
   */
  static isValidResponse(response) {
    return response && 
           response.status === 200 && 
           response.type === 'basic';
  }
}

class StrategyHandler {
  /**
   * Cache First - сначала проверяет кэш, потом сеть
   */
  static async cacheFirst(request, cacheName = CACHE_NAME) {
    const cachedResponse = await CacheManager.getFromCache(request, cacheName);
    
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const networkResponse = await NetworkManager.fetchWithTimeout(request);
      if (NetworkManager.isValidResponse(networkResponse)) {
        await CacheManager.addToCache(request, networkResponse, cacheName);
      }
      return networkResponse;
    } catch (error) {
      console.warn('Network request failed:', error);
      throw error;
    }
  }

  /**
   * Network First - сначала пытается получить из сети, потом из кэша
   */
  static async networkFirst(request, cacheName = CACHE_NAME) {
    try {
      const networkResponse = await NetworkManager.fetchWithTimeout(request);
      if (NetworkManager.isValidResponse(networkResponse)) {
        await CacheManager.addToCache(request, networkResponse, cacheName);
        return networkResponse;
      }
    } catch (error) {
      console.warn('Network request failed, trying cache:', error);
    }

    const cachedResponse = await CacheManager.getFromCache(request, cacheName);
    if (cachedResponse) {
      return cachedResponse;
    }

    throw new Error('No network or cache response available');
  }

  /**
   * Stale While Revalidate - возвращает кэш быстро, обновляет в фоне
   */
  static async staleWhileRevalidate(request, cacheName = CACHE_NAME) {
    const cachedResponse = await CacheManager.getFromCache(request, cacheName);
    
    // Запускаем обновление в фоне
    const networkPromise = NetworkManager.fetchWithTimeout(request)
      .then(async (networkResponse) => {
        if (NetworkManager.isValidResponse(networkResponse)) {
          await CacheManager.addToCache(request, networkResponse, cacheName);
        }
        return networkResponse;
      })
      .catch(error => {
        console.warn('Background update failed:', error);
      });

    // Возвращаем кэш сразу, если есть
    if (cachedResponse) {
      return cachedResponse;
    }

    // Если кэша нет, ждём сеть
    return networkPromise;
  }
}

// ================================================
// 📡 BACKGROUND SYNC
// ================================================

class BackgroundSyncManager {
  static SYNC_TAGS = {
    PHRASE_SHARE: 'phrase-share',
    ANALYTICS: 'analytics',
    FEEDBACK: 'feedback'
  };

  /**
   * Регистрирует background sync
   */
  static async register(tag, data) {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        // Сохраняем данные для синхронизации
        await this.storeDataForSync(tag, data);
        
        // Регистрируем sync
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(tag);
        
        console.log(`Background sync registered: ${tag}`);
      } catch (error) {
        console.error('Background sync registration failed:', error);
        // Fallback - попытка немедленной отправки
        await this.executeSync(tag);
      }
    } else {
      // Fallback для браузеров без поддержки background sync
      await this.executeSync(tag);
    }
  }

  /**
   * Сохраняет данные для синхронизации
   */
  static async storeDataForSync(tag, data) {
    const db = await this.openDB();
    const transaction = db.transaction(['sync'], 'readwrite');
    const store = transaction.objectStore('sync');
    
    await store.put({
      tag,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Выполняет синхронизацию
   */
  static async executeSync(tag) {
    const db = await this.openDB();
    const transaction = db.transaction(['sync'], 'readonly');
    const store = transaction.objectStore('sync');
    const request = store.get(tag);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const record = request.result;
        if (record) {
          try {
            await this.processSyncData(tag, record.data);
            await this.removeSyncData(tag);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Обрабатывает данные синхронизации
   */
  static async processSyncData(tag, data) {
    switch (tag) {
      case this.SYNC_TAGS.PHRASE_SHARE:
        await this.syncPhraseShare(data);
        break;
      case this.SYNC_TAGS.ANALYTICS:
        await this.syncAnalytics(data);
        break;
      case this.SYNC_TAGS.FEEDBACK:
        await this.syncFeedback(data);
        break;
      default:
        console.warn(`Unknown sync tag: ${tag}`);
    }
  }

  /**
   * Синхронизирует поделенные фразы
   */
  static async syncPhraseShare(data) {
    const response = await fetch('/api/share-phrase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to sync phrase share');
    }
  }

  /**
   * Синхронизирует аналитику
   */
  static async syncAnalytics(data) {
    const response = await fetch('/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to sync analytics');
    }
  }

  /**
   * Синхронизирует обратную связь
   */
  static async syncFeedback(data) {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to sync feedback');
    }
  }

  /**
   * Открывает IndexedDB
   */
  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AbsudiaDB', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('sync')) {
          db.createObjectStore('sync', { keyPath: 'tag' });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Удаляет данные синхронизации
   */
  static async removeSyncData(tag) {
    const db = await this.openDB();
    const transaction = db.transaction(['sync'], 'readwrite');
    const store = transaction.objectStore('sync');
    await store.delete(tag);
  }
}

// ================================================
// 🔄 СОБЫТИЯ SERVICE WORKER
// ================================================

/**
 * Установка Service Worker
 */
self.addEventListener('install', (event) => {
  console.log(`SW ${SW_VERSION}: Installing...`);
  
  event.waitUntil(
    (async () => {
      try {
        // Предварительное кэширование статических ресурсов
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(STATIC_CACHE_URLS);
        
        console.log(`SW ${SW_VERSION}: Static resources cached`);
        
        // Принудительная активация нового SW
        self.skipWaiting();
      } catch (error) {
        console.error(`SW ${SW_VERSION}: Installation failed:`, error);
      }
    })()
  );
});

/**
 * Активация Service Worker
 */
self.addEventListener('activate', (event) => {
  console.log(`SW ${SW_VERSION}: Activating...`);
  
  event.waitUntil(
    (async () => {
      try {
        // Очистка старых кэшей
        await CacheManager.cleanupOldCaches(CACHE_NAME);
        
        // Управление клиентами
        await self.clients.claim();
        
        console.log(`SW ${SW_VERSION}: Activated successfully`);
        
        // Уведомляем клиентов об обновлении
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: SW_VERSION
          });
        });
      } catch (error) {
        console.error(`SW ${SW_VERSION}: Activation failed:`, error);
      }
    })()
  );
});

/**
 * Перехват fetch запросов
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { method, url } = request;
  
  // Обрабатываем только GET запросы
  if (method !== 'GET') {
    return;
  }

  // Пропускаем non-http(s) запросы
  if (!url.startsWith('http')) {
    return;
  }

  event.respondWith(handleRequest(request));
});

/**
 * Основной обработчик запросов
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Определяем стратегию кэширования
    const strategy = getStrategyForRequest(request);
    
    switch (strategy.type) {
      case CACHE_STRATEGIES.CACHE_FIRST:
        return await StrategyHandler.cacheFirst(request, strategy.cacheName);
      
      case CACHE_STRATEGIES.NETWORK_FIRST:
        return await StrategyHandler.networkFirst(request, strategy.cacheName);
      
      case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
        return await StrategyHandler.staleWhileRevalidate(request, strategy.cacheName);
      
      case CACHE_STRATEGIES.CACHE_ONLY:
        return await CacheManager.getFromCache(request, strategy.cacheName);
      
      case CACHE_STRATEGIES.NETWORK_ONLY:
        return await NetworkManager.fetchWithTimeout(request);
      
      default:
        // Fallback стратегия
        return await StrategyHandler.networkFirst(request);
    }
  } catch (error) {
    console.warn('Request failed:', request.url, error);
    return await handleOfflineRequest(request);
  }
}

/**
 * Определяет стратегию кэширования для запроса
 */
function getStrategyForRequest(request) {
  const url = new URL(request.url);
  
  // Проверяем совпадения с настроенными маршрутами
  for (const route of ROUTE_STRATEGIES) {
    if (route.pattern.test(url.href)) {
      return {
        type: route.strategy,
        cacheName: route.cacheName || CACHE_NAME,
        cacheExpiration: route.cacheExpiration
      };
    }
  }
  
  // Дефолтная стратегия для HTML страниц
  if (request.destination === 'document') {
    return {
      type: CACHE_STRATEGIES.NETWORK_FIRST,
      cacheName: CACHE_NAME
    };
  }
  
  // Дефолтная стратегия для остальных ресурсов
  return {
    type: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    cacheName: CACHE_NAME
  };
}

/**
 * Обработка offline запросов
 */
async function handleOfflineRequest(request) {
  // Для HTML страниц возвращаем offline страницу
  if (request.destination === 'document') {
    const offlineResponse = await CacheManager.getFromCache(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }
  }
  
  // Для других ресурсов пытаемся найти в кэше
  const cachedResponse = await CacheManager.getFromCache(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Возвращаем fallback ответ
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain'
    }
  });
}

/**
 * Background Sync
 */
self.addEventListener('sync', (event) => {
  console.log(`SW ${SW_VERSION}: Background sync triggered:`, event.tag);
  
  event.waitUntil(
    BackgroundSyncManager.executeSync(event.tag)
      .then(() => {
        console.log(`SW ${SW_VERSION}: Background sync completed:`, event.tag);
      })
      .catch((error) => {
        console.error(`SW ${SW_VERSION}: Background sync failed:`, event.tag, error);
      })
  );
});

/**
 * Push уведомления
 */
self.addEventListener('push', (event) => {
  console.log(`SW ${SW_VERSION}: Push received`);
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Абсурдная Игра';
  const options = {
    body: data.body || 'Новые фразы доступны!',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/badge-72x72.png',
    tag: data.tag || 'default',
    data: data.url || '/',
    actions: [
      {
        action: 'open',
        title: 'Открыть игру',
        icon: '/assets/icons/action-open.png'
      },
      {
        action: 'dismiss',
        title: 'Закрыть',
        icon: '/assets/icons/action-close.png'
      }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: false
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Клик по уведомлению
 */
self.addEventListener('notificationclick', (event) => {
  console.log(`SW ${SW_VERSION}: Notification clicked`);
  
  const notification = event.notification;
  const action = event.action;
  
  notification.close();
  
  if (action === 'dismiss') {
    return;
  }
  
  const urlToOpen = notification.data || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then((clients) => {
        // Ищем уже открытое окно
        for (const client of clients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Открываем новое окно
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

/**
 * Обработка сообщений от клиентов
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: SW_VERSION });
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'BACKGROUND_SYNC':
      BackgroundSyncManager.register(data.tag, data.payload);
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME)
        .then(() => {
          event.ports[0].postMessage({ success: true });
        })
        .catch((error) => {
          event.ports[0].postMessage({ success: false, error });
        });
      break;
      
    default:
      console.warn(`SW ${SW_VERSION}: Unknown message type:`, type);
  }
});

/**
 * Периодическая очистка кэша
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(
      (async () => {
        // Очистка устаревших записей
        for (const route of ROUTE_STRATEGIES) {
          if (route.cacheExpiration) {
            await CacheManager.cleanupExpiredEntries(
              route.cacheName || CACHE_NAME,
              route.cacheExpiration.maxAgeSeconds
            );
            
            if (route.cacheExpiration.maxEntries) {
              await CacheManager.limitCacheSize(
                route.cacheName || CACHE_NAME,
                route.cacheExpiration.maxEntries
              );
            }
          }
        }
        
        console.log(`SW ${SW_VERSION}: Cache cleanup completed`);
      })()
    );
  }
});

// ================================================
// 🚀 ЭКСПОРТ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ
// ================================================

// Делаем менеджеры доступными глобально
self.CacheManager = CacheManager;
self.NetworkManager = NetworkManager;
self.BackgroundSyncManager = BackgroundSyncManager;

console.log(`SW ${SW_VERSION}: Script loaded successfully`);