/**
 * Абсурдная Игра - Основная логика v2.0
 * Модульная архитектура с состоянием, API и PWA
 */

'use strict';

// ================================================
// 🎯 КОНФИГУРАЦИЯ И КОНСТАНТЫ
// ================================================

const CONFIG = {
  API: {
    PHRASES_URL: '/phrases.json',
    RETRY_ATTEMPTS: 3,
    TIMEOUT: 5000
  },
  STORAGE: {
    THEME_KEY: 'absudia_theme',
    FAVORITES_KEY: 'absudia_favorites',
    HISTORY_KEY: 'absudia_history',
    SETTINGS_KEY: 'absudia_settings'
  },
  CATEGORIES: {
    absurd: { name: 'Абсурд', emoji: '🤪', color: 'var(--cat-absurd)' },
    horror: { name: 'Ужасы', emoji: '👻', color: 'var(--cat-horror)' },
    kids: { name: 'Детское', emoji: '🧸', color: 'var(--cat-kids)' },
    romance: { name: 'Романтика', emoji: '💕', color: 'var(--cat-romance)' },
    adult: { name: '18+', emoji: '🔞', color: 'var(--cat-adult)' },
    street: { name: 'Улица', emoji: '🏙️', color: 'var(--cat-street)' }
  },
  ANIMATIONS: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 600
  },
  PWA: {
    UPDATE_CHECK_INTERVAL: 60000, // 1 минута
    CACHE_NAME: 'absudia-v1'
  }
};

// ================================================
// 🗂️ УТИЛИТЫ И ХЕЛПЕРЫ
// ================================================

class Utils {
  /**
   * Создает задержку для async/await
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Генерирует уникальный ID
   */
  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Безопасное получение элемента DOM
   */
  static getElement(selector, required = true) {
    const element = document.querySelector(selector);
    if (required && !element) {
      console.error(`Элемент не найден: ${selector}`);
    }
    return element;
  }

  /**
   * Дебаунс функции
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Проверка поддержки функций браузера
   */
  static checkBrowserSupport() {
    return {
      serviceWorker: 'serviceWorker' in navigator,
      webShare: 'share' in navigator,
      clipboard: 'clipboard' in navigator,
      vibration: 'vibrate' in navigator,
      localStorage: (() => {
        try {
          localStorage.setItem('test', 'test');
          localStorage.removeItem('test');
          return true;
        } catch {
          return false;
        }
      })()
    };
  }

  /**
   * Форматирование даты для отображения
   */
  static formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} дн назад`;
    
    return date.toLocaleDateString('ru-RU');
  }

  /**
   * Копирование текста в буфер обмена
   */
  static async copyToClipboard(text) {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
      }
    } catch (error) {
      console.error('Не удалось скопировать текст:', error);
      return false;
    }
  }
}

// ================================================
// 💾 СИСТЕМА ХРАНЕНИЯ ДАННЫХ
// ================================================

class StorageManager {
  constructor() {
    this.isSupported = Utils.checkBrowserSupport().localStorage;
  }

  /**
   * Сохранение данных
   */
  set(key, value) {
    if (!this.isSupported) return false;
    
    try {
      const data = {
        value,
        timestamp: Date.now(),
        version: '1.0'
      };
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Ошибка сохранения в localStorage:', error);
      return false;
    }
  }

  /**
   * Получение данных
   */
  get(key, defaultValue = null) {
    if (!this.isSupported) return defaultValue;
    
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      
      const data = JSON.parse(item);
      return data.value !== undefined ? data.value : defaultValue;
    } catch (error) {
      console.error('Ошибка чтения из localStorage:', error);
      return defaultValue;
    }
  }

  /**
   * Удаление данных
   */
  remove(key) {
    if (!this.isSupported) return false;
    
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Ошибка удаления из localStorage:', error);
      return false;
    }
  }

  /**
   * Очистка устаревших данных
   */
  cleanup(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 дней
    if (!this.isSupported) return;
    
    const now = Date.now();
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('absudia_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data.timestamp && (now - data.timestamp) > maxAge) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

// ================================================
// 🎨 СИСТЕМА УПРАВЛЕНИЯ ТЕМОЙ
// ================================================

class ThemeManager {
  constructor() {
    this.storage = new StorageManager();
    this.currentTheme = this.getInitialTheme();
    this.init();
  }

  /**
   * Определение начальной темы
   */
  getInitialTheme() {
    const savedTheme = this.storage.get(CONFIG.STORAGE.THEME_KEY);
    if (savedTheme) return savedTheme;
    
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /**
   * Инициализация темы
   */
  init() {
    this.applyTheme(this.currentTheme);
    this.setupToggle();
    this.watchSystemTheme();
  }

  /**
   * Применение темы
   */
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.currentTheme = theme;
    this.updateToggleButton();
    
    // Сохранение в localStorage
    this.storage.set(CONFIG.STORAGE.THEME_KEY, theme);
    
    // Обновление meta-тега для мобильных браузеров
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.content = theme === 'light' ? '#4f46e5' : '#667eea';
    }
  }

  /**
   * Переключение темы
   */
  toggle() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
    
    // Анимация переключения
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, CONFIG.ANIMATIONS.NORMAL);
  }

  /**
   * Настройка кнопки переключения
   */
  setupToggle() {
    const themeToggle = Utils.getElement('#themeToggle', false);
    if (!themeToggle) return;
    
    themeToggle.addEventListener('click', () => this.toggle());
  }

  /**
   * Обновление кнопки переключения
   */
  updateToggleButton() {
    const themeIcon = Utils.getElement('.theme-icon', false);
    const themeText = Utils.getElement('.theme-text', false);
    const themeToggle = Utils.getElement('#themeToggle', false);
    
    if (this.currentTheme === 'light') {
      if (themeIcon) themeIcon.textContent = '☀️';
      if (themeText) themeText.textContent = 'Светлая';
      if (themeToggle) themeToggle.setAttribute('aria-label', 'Переключить на тёмную тему');
    } else {
      if (themeIcon) themeIcon.textContent = '🌙';
      if (themeText) themeText.textContent = 'Тёмная';
      if (themeToggle) themeToggle.setAttribute('aria-label', 'Переключить на светлую тему');
    }
  }

  /**
   * Отслеживание изменений системной темы
   */
  watchSystemTheme() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (!this.storage.get(CONFIG.STORAGE.THEME_KEY)) {
        const systemTheme = e.matches ? 'dark' : 'light';
        this.applyTheme(systemTheme);
      }
    });
  }
}

// ================================================
// 📡 API ДЛЯ ЗАГРУЗКИ ФРАЗ
// ================================================

class PhrasesAPI {
  constructor() {
    this.cache = new Map();
    this.loading = false;
  }

  /**
   * Загрузка фраз с retry логикой
   */
  async loadPhrases() {
    if (this.cache.has('phrases')) {
      return this.cache.get('phrases');
    }

    if (this.loading) {
      // Ждем завершения текущей загрузки
      while (this.loading) {
        await Utils.delay(100);
      }
      return this.cache.get('phrases');
    }

    this.loading = true;

    for (let attempt = 1; attempt <= CONFIG.API.RETRY_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT);

        const response = await fetch(CONFIG.API.PHRASES_URL, {
          signal: controller.signal,
          cache: 'no-store'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Валидация данных
        if (!this.validatePhrasesData(data)) {
          throw new Error('Некорректная структура данных');
        }

        this.cache.set('phrases', data);
        this.loading = false;
        return data;

      } catch (error) {
        console.error(`Попытка ${attempt} загрузки фраз не удалась:`, error);
        
        if (attempt === CONFIG.API.RETRY_ATTEMPTS) {
          this.loading = false;
          return this.getFallbackPhrases();
        }
        
        await Utils.delay(1000 * attempt);
      }
    }
  }

  /**
   * Валидация структуры данных
   */
  validatePhrasesData(data) {
    if (!data || typeof data !== 'object') return false;
    
    const requiredCategories = Object.keys(CONFIG.CATEGORIES);
    return requiredCategories.every(category => 
      Array.isArray(data[category]) && data[category].length > 0
    );
  }

  /**
   * Fallback фразы если загрузка не удалась
   */
  getFallbackPhrases() {
    return {
      absurd: [
        "Ты проснулся в холодильнике, и твой батон стал мэром города.",
        "Эй, ты, не забудь: у тебя в кармане пельмень, а на голове мармелад.",
        "Твоя игрушка сбежала, чтобы начать карьеру танцора бальных гусей.",
        "Друг, ты в курсе, что твоя тень устроила побег из твоих тапок?",
        "Вчера ты ел бутерброд, а сегодня он ведёт переговоры с чайником."
      ],
      horror: [
        "В зеркале отражается не ты, а твой будущий кошмар.",
        "Каждую ночь стены твоего дома меняются местами.",
        "Твоя тень живёт своей жизнью, когда ты спишь."
      ],
      kids: [
        "Плюшевый мишка научился готовить блинчики!",
        "Радуга решила поселиться в твоём саду.",
        "Облака сегодня играют в прятки с солнышком."
      ],
      romance: [
        "Твоё сердце бьётся в ритме любимой песни.",
        "Звёзды написали на небе ваши имена.",
        "Каждый закат напоминает о первой встрече."
      ],
      adult: [
        "Контент для взрослых временно недоступен.",
        "Пожалуйста, подтвердите свой возраст."
      ],
      street: [
        "На районе все знают: ты крутой как мороженое в январе.",
        "Твоя походка — это отдельный вид искусства.",
        "Даже голуби с уважением кивают тебе."
      ]
    };
  }

  /**
   * Получение случайной фразы из категории
   */
  getRandomPhrase(category, excludeRecent = []) {
    const phrases = this.cache.get('phrases');
    if (!phrases || !phrases[category]) {
      return "Фразы временно недоступны. Попробуйте перезагрузить страницу.";
    }

    const categoryPhrases = phrases[category];
    let availablePhrases = categoryPhrases.filter(phrase => !excludeRecent.includes(phrase));
    
    // Если все фразы исключены, используем все
    if (availablePhrases.length === 0) {
      availablePhrases = categoryPhrases;
    }

    const randomIndex = Math.floor(Math.random() * availablePhrases.length);
    return availablePhrases[randomIndex];
  }
}

// ================================================
// 🎮 ОСНОВНОЙ ИГРОВОЙ КОНТРОЛЛЕР
// ================================================

class GameController {
  constructor() {
    this.storage = new StorageManager();
    this.phrasesAPI = new PhrasesAPI();
    this.state = this.initializeState();
    this.elements = this.getElements();
    this.recentPhrases = []; // Для избежания повторов
    
    this.init();
  }

  /**
   * Инициализация состояния игры
   */
  initializeState() {
    return {
      currentCategory: 'absurd',
      phraseCount: 0,
      favorites: this.storage.get(CONFIG.STORAGE.FAVORITES_KEY, []),
      history: this.storage.get(CONFIG.STORAGE.HISTORY_KEY, []),
      settings: this.storage.get(CONFIG.STORAGE.SETTINGS_KEY, {
        soundEnabled: true,
        animationsEnabled: true,
        keyboardShortcuts: true
      }),
      isLoading: false,
      currentPhrase: null
    };
  }

  /**
   * Получение элементов DOM
   */
  getElements() {
    return {
      categoryButtons: document.querySelectorAll('.category-btn'),
      phraseText: Utils.getElement('#phraseText'),
      phraseCounter: Utils.getElement('#phraseCounter'),
      phraseCategory: Utils.getElement('#phraseCategory'),
      nextBtn: Utils.getElement('#nextBtn'),
      shareBtn: Utils.getElement('#shareBtn'),
      favoriteBtn: Utils.getElement('#favoriteBtn')
    };
  }

  /**
   * Инициализация игры
   */
  async init() {
    try {
      // Загрузка фраз
      await this.phrasesAPI.loadPhrases();
      
      // Настройка обработчиков событий
      this.setupEventListeners();
      
      // Инициализация UI
      this.updateUI();
      
      // Настройка клавиатурных сочетаний
      if (this.state.settings.keyboardShortcuts) {
        this.setupKeyboardShortcuts();
      }
      
      console.log('Игра успешно инициализирована');
    } catch (error) {
      console.error('Ошибка инициализации игры:', error);
      this.showToast('Ошибка загрузки игры', 'error');
    }
  }

  /**
   * Настройка обработчиков событий
   */
  setupEventListeners() {
    // Кнопки категорий
    this.elements.categoryButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.selectCategory(e.target.dataset.category));
    });

    // Основные кнопки
    if (this.elements.nextBtn) {
      this.elements.nextBtn.addEventListener('click', () => this.nextPhrase());
    }

    if (this.elements.shareBtn) {
      this.elements.shareBtn.addEventListener('click', () => this.sharePhrase());
    }

    if (this.elements.favoriteBtn) {
      this.elements.favoriteBtn.addEventListener('click', () => this.toggleFavorite());
    }

    // Обработка видимости страницы
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkForUpdates();
      }
    });
  }

  /**
   * Выбор категории
   */
  async selectCategory(category) {
    if (!CONFIG.CATEGORIES[category]) return;

    this.state.currentCategory = category;
    
    // Обновление UI кнопок
    this.elements.categoryButtons.forEach(btn => {
      const isActive = btn.dataset.category === category;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive.toString());
    });

    // Анимация смены категории
    if (this.elements.phraseCategory) {
      await this.animateElementChange(this.elements.phraseCategory, () => {
        this.elements.phraseCategory.textContent = CONFIG.CATEGORIES[category].name;
      });
    }

    // Вибрация для мобильных устройств
    if (Utils.checkBrowserSupport().vibration) {
      navigator.vibrate(50);
    }

    this.showToast(`Выбрана категория: ${CONFIG.CATEGORIES[category].name}`, 'info');
  }

  /**
   * Получение следующей фразы
   */
  async nextPhrase() {
    if (this.state.isLoading) return;

    this.state.isLoading = true;
    this.state.phraseCount++;

    // Обновление счетчика
    if (this.elements.phraseCounter) {
      this.elements.phraseCounter.textContent = `Фраза #${this.state.phraseCount}`;
    }

    // Добавление состояния загрузки
    this.setLoadingState(true);

    try {
      // Небольшая задержка для плавности
      await Utils.delay(CONFIG.ANIMATIONS.FAST);

      // Получение новой фразы
      const newPhrase = this.phrasesAPI.getRandomPhrase(
        this.state.currentCategory, 
        this.recentPhrases.slice(-5) // Исключаем последние 5 фраз
      );

      // Анимированное обновление текста
      await this.animateElementChange(this.elements.phraseText, () => {
        this.elements.phraseText.textContent = newPhrase;
        this.state.currentPhrase = newPhrase;
      });

      // Обновление списка недавних фраз
      this.recentPhrases.push(newPhrase);
      if (this.recentPhrases.length > 10) {
        this.recentPhrases.shift();
      }

      // Добавление в историю
      this.addToHistory(newPhrase);

      // Обновление кнопки избранного
      this.updateFavoriteButton();

    } catch (error) {
      console.error('Ошибка при получении фразы:', error);
      this.showToast('Ошибка при загрузке фразы', 'error');
    } finally {
      this.state.isLoading = false;
      this.setLoadingState(false);
    }
  }

  /**
   * Анимированное изменение содержимого элемента
   */
  async animateElementChange(element, changeCallback) {
    if (!element || !this.state.settings.animationsEnabled) {
      changeCallback();
      return;
    }

    // Анимация исчезновения
    element.style.transform = 'translateY(-20px)';
    element.style.opacity = '0';

    await Utils.delay(CONFIG.ANIMATIONS.FAST);

    // Изменение содержимого
    changeCallback();

    // Анимация появления
    element.style.transform = 'translateY(20px)';
    
    await Utils.delay(50);
    
    element.style.transform = 'translateY(0)';
    element.style.opacity = '1';
  }

  /**
   * Установка состояния загрузки
   */
  setLoadingState(loading) {
    if (this.elements.nextBtn) {
      this.elements.nextBtn.disabled = loading;
      this.elements.nextBtn.classList.toggle('loading', loading);
      
      if (loading) {
        this.elements.nextBtn.setAttribute('aria-label', 'Загрузка новой фразы...');
      } else {
        this.elements.nextBtn.setAttribute('aria-label', 'Получить следующую фразу');
      }
    }
  }

  /**
   * Добавление фразы в историю
   */
  addToHistory(phrase) {
    const historyItem = {
      id: Utils.generateId(),
      text: phrase,
      category: this.state.currentCategory,
      timestamp: Date.now()
    };

    this.state.history.unshift(historyItem);
    
    // Ограничиваем историю 100 элементами
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(0, 100);
    }

    this.storage.set(CONFIG.STORAGE.HISTORY_KEY, this.state.history);
  }

  /**
   * Поделиться фразой
   */
  async sharePhrase() {
    if (!this.state.currentPhrase) {
      this.showToast('Нет фразы для шаринга', 'warning');
      return;
    }

    const shareData = {
      title: 'Абсурдная Игра',
      text: `"${this.state.currentPhrase}" — из игры "Абсурдная Игра"`,
      url: window.location.href
    };

    try {
      if (Utils.checkBrowserSupport().webShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        this.showToast('Фраза отправлена!', 'success');
      } else {
        // Fallback: копирование в буфер обмена
        const success = await Utils.copyToClipboard(`${shareData.text}\n\n${shareData.url}`);
        if (success) {
          this.showToast('Фраза скопирована в буфер обмена!', 'success');
        } else {
          this.showToast('Не удалось скопировать фразу', 'error');
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Ошибка при шаринге:', error);
        this.showToast('Ошибка при отправке', 'error');
      }
    }
  }

  /**
   * Переключение избранного
   */
  toggleFavorite() {
    if (!this.state.currentPhrase) return;

    const favoriteIndex = this.state.favorites.findIndex(
      fav => fav.text === this.state.currentPhrase
    );

    if (favoriteIndex > -1) {
      // Удаление из избранного
      this.state.favorites.splice(favoriteIndex, 1);
      this.showToast('Удалено из избранного', 'info');
    } else {
      // Добавление в избранное
      const favoriteItem = {
        id: Utils.generateId(),
        text: this.state.currentPhrase,
        category: this.state.currentCategory,
        timestamp: Date.now()
      };
      
      this.state.favorites.unshift(favoriteItem);
      this.showToast('Добавлено в избранное!', 'success');
    }

    // Ограничиваем избранное 50 элементами
    if (this.state.favorites.length > 50) {
      this.state.favorites = this.state.favorites.slice(0, 50);
    }

    this.storage.set(CONFIG.STORAGE.FAVORITES_KEY, this.state.favorites);
    this.updateFavoriteButton();
  }

  /**
   * Обновление кнопки избранного
   */
  updateFavoriteButton() {
    if (!this.elements.favoriteBtn || !this.state.currentPhrase) return;

    const isFavorite = this.state.favorites.some(
      fav => fav.text === this.state.currentPhrase
    );

    if (isFavorite) {
      this.elements.favoriteBtn.innerHTML = '❤️ В избранном';
      this.elements.favoriteBtn.setAttribute('aria-label', 'Удалить из избранного');
    } else {
      this.elements.favoriteBtn.innerHTML = '🤍 В избранное';
      this.elements.favoriteBtn.setAttribute('aria-label', 'Добавить в избранное');
    }
  }

  /**
   * Настройка клавиатурных сочетаний
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Игнорируем, если фокус на input элементах
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'enter':
          e.preventDefault();
          this.nextPhrase();
          break;
        case 's':
          e.preventDefault();
          this.sharePhrase();
          break;
        case 'f':
          e.preventDefault();
          this.toggleFavorite();
          break;
        case 't':
          e.preventDefault();
          // Переключение темы через глобальный themeManager
          if (window.themeManager) {
            window.themeManager.toggle();
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
          e.preventDefault();
          const categories = Object.keys(CONFIG.CATEGORIES);
          const categoryIndex = parseInt(e.key) - 1;
          if (categories[categoryIndex]) {
            this.selectCategory(categories[categoryIndex]);
          }
          break;
      }
    });
  }

  /**
   * Обновление интерфейса
   */
  updateUI() {
    // Обновление активной категории
    this.elements.categoryButtons.forEach(btn => {
      const isActive = btn.dataset.category === this.state.currentCategory;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive.toString());
    });

    // Обновление отображения категории
    if (this.elements.phraseCategory) {
      this.elements.phraseCategory.textContent = CONFIG.CATEGORIES[this.state.currentCategory].name;
    }

    // Обновление счетчика
    if (this.elements.phraseCounter) {
      this.elements.phraseCounter.textContent = `Фраза #${this.state.phraseCount}`;
    }

    this.updateFavoriteButton();
  }

  /**
   * Показ toast уведомления
   */
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-xl z-50 max-w-sm transition-all duration-300 transform translate-x-full`;
    
    const colors = {
      success: 'bg-green-500 text-white',
      error: 'bg-red-500 text-white', 
      info: 'bg-blue-500 text-white',
      warning: 'bg-yellow-500 text-black'
    };
    
    toast.className += ` ${colors[type] || colors.info}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    document.body.appendChild(toast);
    
    // Анимация появления
    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-full');
    });
    
    // Автоматическое удаление
    setTimeout(() => {
      toast.classList.add('translate-x-full');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  /**
   * Проверка обновлений
   */
  async checkForUpdates() {
    // Эта функция будет расширена при добавлении PWA функциональности
    console.log('Проверка обновлений...');
  }
}

// ================================================
// ✨ СИСТЕМА АНИМАЦИИ ЧАСТИЦ
// ================================================

class ParticleSystem {
  constructor() {
    this.container = Utils.getElement('.particles', false);
    this.particles = [];
    this.animationId = null;
    this.isActive = false;
    
    if (this.container) {
      this.init();
    }
  }

  /**
   * Инициализация системы частиц
   */
  init() {
    this.createParticles();
    this.startAnimation();
    
    // Пересоздание частиц при изменении размера окна
    window.addEventListener('resize', Utils.debounce(() => {
      this.recreateParticles();
    }, 250));
  }

  /**
   * Создание частиц
   */
  createParticles() {
    this.container.innerHTML = '';
    this.particles = [];
    
    const particleCount = window.innerWidth < 768 ? 15 : 30;
    
    for (let i = 0; i < particleCount; i++) {
      const particle = this.createParticle();
      this.particles.push(particle);
      this.container.appendChild(particle.element);
    }
  }

  /**
   * Создание одной частицы
   */
  createParticle() {
    const element = document.createElement('div');
    element.className = 'particle';
    
    const size = Math.random() * 2 + 2;
    element.style.width = size + 'px';
    element.style.height = size + 'px';
    element.style.left = Math.random() * 100 + '%';
    element.style.top = Math.random() * 100 + '%';
    element.style.animationDelay = Math.random() * 8 + 's';
    element.style.animationDuration = (Math.random() * 6 + 8) + 's';
    
    return {
      element,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size
    };
  }

  /**
   * Пересоздание частиц
   */
  recreateParticles() {
    this.createParticles();
  }

  /**
   * Запуск анимации
   */
  startAnimation() {
    if (this.isActive) return;
    this.isActive = true;
    this.animate();
  }

  /**
   * Остановка анимации
   */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.isActive = false;
  }

  /**
   * Основной цикл анимации
   */
  animate() {
    if (!this.isActive) return;
    
    // Здесь можно добавить дополнительную логику анимации
    // Сейчас используется CSS анимация
    
    this.animationId = requestAnimationFrame(() => this.animate());
  }
}

// ================================================
// 🚀 PWA МЕНЕДЖЕР
// ================================================

class PWAManager {
  constructor() {
    this.registration = null;
    this.updateAvailable = false;
    this.init();
  }

  /**
   * Инициализация PWA
   */
  async init() {
    if (!Utils.checkBrowserSupport().serviceWorker) {
      console.log('Service Worker не поддерживается');
      return;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker зарегистрирован:', this.registration);
      
      this.setupUpdateListener();
      this.checkForUpdates();
      
    } catch (error) {
      console.error('Ошибка регистрации Service Worker:', error);
    }
  }

  /**
   * Настройка отслеживания обновлений
   */
  setupUpdateListener() {
    if (!this.registration) return;

    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.updateAvailable = true;
          this.showUpdatePrompt();
        }
      });
    });
  }

  /**
   * Проверка наличия обновлений
   */
  async checkForUpdates() {
    if (!this.registration) return;

    try {
      await this.registration.update();
    } catch (error) {
      console.error('Ошибка проверки обновлений:', error);
    }
  }

  /**
   * Показ уведомления об обновлении
   */
  showUpdatePrompt() {
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 left-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 flex items-center justify-between';
    notification.innerHTML = `
      <div>
        <strong>Доступно обновление!</strong>
        <p class="text-sm">Перезагрузите страницу для получения новых функций.</p>
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1 bg-white text-blue-600 rounded text-sm font-medium" id="updateApp">
          Обновить
        </button>
        <button class="px-3 py-1 border border-white rounded text-sm" id="dismissUpdate">
          Позже
        </button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Обработчики кнопок
    notification.querySelector('#updateApp').addEventListener('click', () => {
      window.location.reload();
    });
    
    notification.querySelector('#dismissUpdate').addEventListener('click', () => {
      notification.remove();
    });
  }
}

// ================================================
// 🎯 ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ================================================

class App {
  constructor() {
    this.components = {};
    this.init();
  }

  /**
   * Инициализация приложения
   */
  async init() {
    try {
      // Проверка поддержки браузера
      const support = Utils.checkBrowserSupport();
      console.log('Поддержка браузера:', support);

      // Инициализация компонентов
      this.components.storage = new StorageManager();
      this.components.theme = new ThemeManager();
      this.components.particles = new ParticleSystem();
      this.components.game = new GameController();
      this.components.pwa = new PWAManager();

      // Глобальный доступ к менеджеру темы для горячих клавиш
      window.themeManager = this.components.theme;

      // Очистка устаревших данных
      this.components.storage.cleanup();

      // Установка обработчика ошибок
      this.setupErrorHandling();

      console.log('Приложение успешно инициализировано');

    } catch (error) {
      console.error('Ошибка инициализации приложения:', error);
    }
  }

  /**
   * Настройка обработки ошибок
   */
  setupErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Глобальная ошибка:', event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Необработанный промис:', event.reason);
      event.preventDefault();
    });
  }
}

// ================================================
// 🚀 ЗАПУСК ПРИЛОЖЕНИЯ
// ================================================

// Ждем загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.absurdiaApp = new App();
  });
} else {
  window.absurdiaApp = new App();
}