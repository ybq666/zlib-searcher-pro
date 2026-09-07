export interface ZLibNode {
  id: string;
  name: string;
  url: string;
  latency?: number; // ms
  status: 'unknown' | 'testing' | 'available' | 'error';
  isOfficial?: boolean;
  isCustom?: boolean;
}

export interface UserProfile {
  id: string | number;
  name: string;
  email?: string;
  downloads_today: number;
  downloads_limit: number;
  is_donor?: boolean;
}

export interface Book {
  id: number | string;
  hash: string;
  title: string;
  author: string;
  publisher?: string;
  year?: string;
  language?: string;
  extension: string;
  filesize: string;
  filesizeString?: string;
  cover: string;
  pages?: string;
  readOnlineUrl?: string;
  description?: string;
  rating?: string;
}

export interface BookPagination {
  current: number;
  limit: number;
  before: boolean;
  next: number;
  total_items: number;
  total_pages: number;
}

export interface BookSearchResponse {
  success: number;
  exactBooksCount: number;
  books: Book[];
  pagination: BookPagination;
}

export interface AppSettings {
  activeNodeUrl: string;
  nodes: ZLibNode[];
  manualUserId: string;
  manualUserKey: string;
  autoSpeedTest: boolean;
  autoSyncMirrors: boolean;
  lastSyncTime?: number;
  defaultExtension: string;
}
