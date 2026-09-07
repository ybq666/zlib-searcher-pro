import { Book, BookSearchResponse } from '../types';
import { resolveCredentials } from './auth';
import { getSettings, saveSettings } from './storage';

export interface SearchOptions {
  page?: number;
  limit?: number;
  extension?: string;
}

export function formatFileSize(bytesStr: string | number): string {
  const bytes = typeof bytesStr === 'number' ? bytesStr : parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes <= 0) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function searchBooks(
  baseUrl: string,
  query: string,
  options: SearchOptions = {}
): Promise<BookSearchResponse> {
  const { page = 1, limit = 20, extension } = options;

  const settings = await getSettings();
  const candidateUrls = Array.from(
    new Set([
      baseUrl,
      settings.activeNodeUrl,
      'https://z-library.website',
      'https://z-lib.by',
      'http://z-lib.sk',
      ...settings.nodes.map((n) => n.url)
    ].filter(Boolean))
  );

  let lastError: Error | null = null;

  for (const nodeUrl of candidateUrls) {
    try {
      const { userId, userKey } = await resolveCredentials(nodeUrl);
      const endpoint = `${nodeUrl.replace(/\/+$/, '')}/eapi/book/search`;
      const formData = new FormData();
      
      const searchMessage = query.trim();
      if (extension && extension !== 'all') {
        formData.append('extensions[]', extension);
      }
      formData.set('message', searchMessage);
      formData.set('limit', limit.toString());
      formData.set('page', page.toString());

      const headers: Record<string, string> = {};
      if (userId && userKey) {
        headers['remix-userid'] = userId;
        headers['remix-userkey'] = userKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // 如果备用节点成功，自动将设置切为该存活节点
      if (nodeUrl !== settings.activeNodeUrl) {
        settings.activeNodeUrl = nodeUrl;
        await saveSettings(settings);
      }

      if (!data.books) {
        return {
          success: data.success || 0,
          exactBooksCount: 0,
          books: [],
          pagination: {
            current: page,
            limit,
            before: false,
            next: 0,
            total_items: 0,
            total_pages: 0
          }
        };
      }

      const books: Book[] = data.books.map((b: any) => ({
        id: b.id,
        hash: b.hash,
        title: b.title || '无标题',
        author: b.author || '未知作者',
        publisher: b.publisher || '',
        year: b.year || '',
        language: b.language || '',
        extension: (b.extension || '').toUpperCase(),
        filesize: b.filesize || '0',
        filesizeString: formatFileSize(b.filesize),
        cover: b.cover || '',
        pages: b.pages && b.pages !== '0' ? b.pages : undefined,
        readOnlineUrl: b.readOnlineUrl || undefined,
        description: b.description || '',
        rating: b.rating || ''
      }));

      return {
        success: data.success || 1,
        exactBooksCount: data.exactBooksCount || 0,
        books,
        pagination: {
          current: data.pagination?.current || page,
          limit: data.pagination?.limit || limit,
          before: !!data.pagination?.before,
          next: data.pagination?.next || 0,
          total_items: data.pagination?.total_items || books.length,
          total_pages: data.pagination?.total_pages || 1
        }
      };
    } catch (err: any) {
      console.warn(`[Z-Lib API] 镜像节点 ${nodeUrl} 搜索失败，尝试下一节点...`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('所有可用镜像节点搜索均超时或不可用');
}

export async function fetchDownloadUrl(
  baseUrl: string,
  book: Book
): Promise<string> {
  const settings = await getSettings();
  const candidateUrls = Array.from(
    new Set([
      baseUrl,
      settings.activeNodeUrl,
      'https://z-library.website',
      'https://z-lib.by',
      'http://z-lib.sk',
      ...settings.nodes.map((n) => n.url)
    ].filter(Boolean))
  );

  let lastError: Error | null = null;

  for (const nodeUrl of candidateUrls) {
    try {
      const { userId, userKey } = await resolveCredentials(nodeUrl);
      if (!userId || !userKey) {
        throw new Error('请先在当前镜像站登录，或在设置中填入 UserKey 凭据才能下载。');
      }

      const endpoint = `${nodeUrl.replace(/\/+$/, '')}/eapi/book/${book.id}/${book.hash}/file`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'remix-userid': userId,
          'remix-userkey': userKey
        },
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`获取下载地址失败 (HTTP ${res.status})`);
      }

      const data = await res.json();
      let link = data?.file?.downloadLink || data?.downloadLink;
      if (link) {
        if (link.startsWith('/')) {
          link = new URL(link, nodeUrl).href;
        }
        return link;
      }
      if (data?.error || data?.message) {
        throw new Error(data.error || data.message);
      }
    } catch (err: any) {
      console.warn(`[Z-Lib API] 镜像节点 ${nodeUrl} 获取下载地址失败:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('未能解析到可用的下载链接');
}

export async function downloadBookFile(
  downloadUrl: string,
  suggestedFilename?: string
): Promise<number | undefined> {
  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: downloadUrl,
          filename: suggestedFilename ? sanitizeFilename(suggestedFilename) : undefined,
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
        }
      );
    });
  } else {
    // Fallback: trigger normal browser link click
    const a = document.createElement('a');
    a.href = downloadUrl;
    if (suggestedFilename) a.download = suggestedFilename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return undefined;
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}
