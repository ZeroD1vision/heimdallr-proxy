/**
 * MediaManager — управление видео-ассетами для сцен.
 *
 * Архитектура:
 * 1. Кэшируем конфиг видеоресурсов один раз при инициализации (или при смене сцены)
 * 2. Для каждой сцены ('hero', 'data', 'auth') резолвим URL через конфиг
 * 3. Поддерживаем динамическую загрузку видео без перезагрузки страницы
 * 4. Fallback на статические пути, если API недоступен (в данный момент так и есть)
 *
 * Использование:
 *   const mgr = new MediaManager();
 *   await mgr.init();  // Загружаем конфиг с бэка
 *   const url = mgr.getVideoUrl('auth');  // Получаем динамический URL
 */

import { mediaApi, type MediaAsset } from './api';

type Section = 'hero' | 'data' | 'auth';

// Fallback на статические пути, если API недоступен или медленен
const FALLBACK_VIDEO_PATH = (section: Section, quality: string = '720'): string => {
  return `/assets/videos/${quality}/${section}_section_animation_${quality}.mp4`;
};

export class MediaManager {
  private config: Map<Section, MediaAsset> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Инициализация: fetch конфиг с бэка.
   * Кэшируется — повторный вызов возвращает сразу.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initInternal();
    await this.initPromise;
  }

  private async _initInternal(): Promise<void> {
    try {
      const mediaConfig = await mediaApi.getMediaConfig();

      if (mediaConfig.assets && Array.isArray(mediaConfig.assets)) {
        mediaConfig.assets.forEach((asset) => {
          this.config.set(asset.section, asset);
        });
      }

      this.initialized = true;
      console.log('[MediaManager] Loaded config:', Array.from(this.config.entries()));
    } catch (err) {
      // 401: Unauthorized — эндпоинт требует аутентификации (или она не настроена)
      // Это OK для публичного видео-конфига, используем fallback статические пути
      if (err instanceof Error) {
        console.warn('[MediaManager] Failed to load media config (using fallback):', err.message);
      } else {
        console.warn('[MediaManager] Failed to load media config (using fallback)');
      }
      // Fallback: остаемся с пустым конфигом, getVideoUrl вернет fallback
      this.initialized = true;
    }
  }

  /**
   * Получить URL видео для сцены.
   * Если конфиг не инициализирован, использует fallback.
   */
  getVideoUrl(section: Section, quality: string = '720'): string {
    const asset = this.config.get(section);

    if (asset && asset.url) {
      // Если URL относительный (начинается с /) или абсолютный (http/https) — возвращаем как есть
      // Если это имя файла — предполагаем, что он в /assets/videos/{quality}/
      if (asset.url.startsWith('/') || asset.url.startsWith('http')) {
        return asset.url;
      }
      // Иначе конструируем полный путь
      return `/assets/videos/${quality}/${asset.url}`;
    }

    return FALLBACK_VIDEO_PATH(section, quality);
  }

  /**
   * Проверить, инициализирован ли конфиг
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Получить полный конфиг (для отладки)
   */
  getConfig(): Map<Section, MediaAsset> {
    return new Map(this.config);
  }

  /**
   * Пересоздать конфиг (если нужно обновить видеоресурсы на лету)
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    this.initPromise = null;
    await this.init();
  }
}

// используется на всех страницах
export const mediaManager = new MediaManager();
