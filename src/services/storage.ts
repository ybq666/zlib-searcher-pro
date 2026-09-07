import { AppSettings, ZLibNode } from '../types';

export const DEFAULT_NODES: ZLibNode[] = [
  { id: 'z-lib-website', name: 'Z-Library 镜像 (z-library.website)', url: 'https://z-library.website', status: 'unknown', isOfficial: true },
  { id: 'z-lib-by', name: 'Z-Library 镜像 (z-lib.by)', url: 'https://z-lib.by', status: 'unknown', isOfficial: true },
  { id: 'z-lib-sk-http', name: 'Z-Library (http://z-lib.sk)', url: 'http://z-lib.sk', status: 'unknown', isOfficial: true },
  { id: 'zh-z-lib-sk', name: 'Z-Library 中文 (zh.z-library.sk)', url: 'https://zh.z-library.sk', status: 'unknown', isOfficial: true },
  { id: 'z-lib-sk', name: 'Z-Library (z-lib.sk)', url: 'https://z-lib.sk', status: 'unknown', isOfficial: true },
  { id: 'z-lib-fm', name: 'Z-Library (z-lib.fm)', url: 'https://z-lib.fm', status: 'unknown', isOfficial: true },
  { id: 'zh-z-lib-gd', name: 'Z-Library 镜像 (zh.z-lib.gd)', url: 'https://zh.z-lib.gd', status: 'unknown', isOfficial: true },
  { id: 'z-lib-qa', name: 'Z-Library (z-library.qa)', url: 'https://z-library.qa', status: 'unknown', isOfficial: true },
  { id: 'z-lib-im', name: 'Z-Library (z-library.im)', url: 'https://z-library.im', status: 'unknown', isOfficial: true },
  { id: 'zh-zlib-li', name: 'Z-Library 镜像 (zh.zlib.li)', url: 'https://zh.zlib.li', status: 'unknown', isOfficial: true },
  { id: 'zh-101su-ru', name: 'Z-Library 备用 (zh.101su.ru)', url: 'https://zh.101su.ru', status: 'unknown', isOfficial: true },
  { id: 'zh-z-lib-rest', name: 'Z-Library 官方 (zh.z-lib.rest)', url: 'https://zh.z-lib.rest', status: 'unknown', isOfficial: true }
];

export const DEFAULT_SETTINGS: AppSettings = {
  activeNodeUrl: 'https://z-library.website',
  nodes: DEFAULT_NODES,
  manualUserId: '',
  manualUserKey: '',
  autoSpeedTest: true,
  autoSyncMirrors: true,
  lastSyncTime: undefined,
  defaultExtension: 'all'
};

export async function getSettings(): Promise<AppSettings> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get('app_settings');
    if (data && data.app_settings) {
      // Ensure merged with defaults in case of new fields
      return {
        ...DEFAULT_SETTINGS,
        ...data.app_settings,
        nodes: data.app_settings.nodes && data.app_settings.nodes.length > 0
          ? data.app_settings.nodes
          : DEFAULT_NODES
      };
    }
  } else {
    const local = localStorage.getItem('app_settings');
    if (local) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(local) };
      } catch {}
    }
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ app_settings: settings });
  } else {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }
}

export async function getSessionCache<T>(key: string): Promise<T | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    try {
      const data = await chrome.storage.session.get(key);
      return (data && data[key]) ? (data[key] as T) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function setSessionCache<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    try {
      await chrome.storage.session.set({ [key]: value });
    } catch {}
  }
}
