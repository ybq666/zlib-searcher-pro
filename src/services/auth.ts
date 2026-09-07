import { UserProfile } from '../types';
import { getSettings, saveSettings } from './storage';

export interface AuthState {
  isLoggedIn: boolean;
  userId: string;
  userKey: string;
  fromSource?: string;
  userProfile?: UserProfile;
}

export interface SniffedCredentials {
  userId: string;
  userKey: string;
  fromDomain?: string;
}

/**
 * 获取指定 URL 上的特定 Cookie
 */
export async function getCookie(url: string, name: string): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.cookies?.get) {
    return null;
  }
  try {
    const cookie = await chrome.cookies.get({ url, name });
    return cookie ? cookie.value : null;
  } catch {
    return null;
  }
}

/**
 * 全浏览器跨域嗅探任意 Z-Library / SingleLogin 域名的登录 Cookie
 */
export async function sniffAllZLibCookies(): Promise<SniffedCredentials> {
  if (typeof chrome === 'undefined' || !chrome.cookies?.getAll) {
    return { userId: '', userKey: '' };
  }

  try {
    // 获取整个浏览器中所有名为 remix_userid 和 remix_userkey 的 Cookie
    const userIds = await chrome.cookies.getAll({ name: 'remix_userid' });
    const userKeys = await chrome.cookies.getAll({ name: 'remix_userkey' });

    if (userIds.length === 0 || userKeys.length === 0) {
      return { userId: '', userKey: '' };
    }

    // 优先寻找同域或父子域匹配的凭据
    for (const idCookie of userIds) {
      const match = userKeys.find((k) => {
        if (!k.value) return false;
        if (k.domain === idCookie.domain) return true;
        if (idCookie.domain.endsWith(k.domain) || k.domain.endsWith(idCookie.domain)) return true;
        return false;
      });

      if (match && idCookie.value && match.value) {
        return {
          userId: idCookie.value,
          userKey: match.value,
          fromDomain: idCookie.domain
        };
      }
    }

    // 次选：取任意有效的一组
    const validId = userIds.find((u) => u.value)?.value || '';
    const validKey = userKeys.find((k) => k.value)?.value || '';

    return {
      userId: validId,
      userKey: validKey,
      fromDomain: userIds[0]?.domain
    };
  } catch (err) {
    console.error('嗅探 Cookie 异常:', err);
    return { userId: '', userKey: '' };
  }
}

/**
 * 将凭据 Cookie 跨域同步到目标镜像节点
 */
export async function syncCookiesToNode(
  targetNodeUrl: string,
  userId: string,
  userKey: string
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.cookies?.set) return;

  try {
    const cleanUrl = targetNodeUrl.replace(/\/+$/, '');
    await chrome.cookies.set({
      url: cleanUrl,
      name: 'remix_userid',
      value: userId,
      path: '/'
    });
    await chrome.cookies.set({
      url: cleanUrl,
      name: 'remix_userkey',
      value: userKey,
      path: '/'
    });
  } catch (e) {
    console.warn('同步 Cookie 到目标节点失败:', e);
  }
}

/**
 * 解析当前可用的凭据 (优先级：手动配置 > 全局嗅探 > 目标节点 Cookie)
 */
export async function resolveCredentials(
  targetUrl: string
): Promise<{ userId: string; userKey: string; fromSource: string }> {
  const settings = await getSettings();

  // 1. 最高优先级：用户在设置中手动填写的凭据
  if (settings.manualUserId && settings.manualUserKey) {
    syncCookiesToNode(targetUrl, settings.manualUserId, settings.manualUserKey).catch(() => {});
    return {
      userId: settings.manualUserId.trim(),
      userKey: settings.manualUserKey.trim(),
      fromSource: '手动保存的凭据'
    };
  }

  // 2. 第二优先级：全局跨域嗅探浏览器 Cookie
  const sniffed = await sniffAllZLibCookies();
  if (sniffed.userId && sniffed.userKey) {
    // 自动回写同步到当前使用的节点
    syncCookiesToNode(targetUrl, sniffed.userId, sniffed.userKey).catch(() => {});
    return {
      userId: sniffed.userId,
      userKey: sniffed.userKey,
      fromSource: `从域名 ${sniffed.fromDomain || '已登录站点'} 自动嗅探`
    };
  }

  // 3. 第三优先级：检查目标镜像本身的 Cookie
  const nodeUserId = await getCookie(targetUrl, 'remix_userid');
  const nodeUserKey = await getCookie(targetUrl, 'remix_userkey');
  if (nodeUserId && nodeUserKey) {
    return {
      userId: nodeUserId,
      userKey: nodeUserKey,
      fromSource: '当前镜像站 Cookie'
    };
  }

  return { userId: '', userKey: '', fromSource: '未认证' };
}

/**
 * 获取用户信息及下载限额（支持网络异常时自动切换备用镜像节点）
 */
export async function fetchUserProfile(
  baseUrl: string,
  userId: string,
  userKey: string
): Promise<UserProfile | null> {
  if (!userId || !userKey) return null;

  const settings = await getSettings();
  const candidateUrls = Array.from(new Set([
    baseUrl,
    'https://z-library.website',
    'https://z-lib.by',
    'http://z-lib.sk',
    ...settings.nodes.map((n) => n.url)
  ])).filter((u) => u && u.startsWith('http'));

  for (const nodeUrl of candidateUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    try {
      const endpoint = `${nodeUrl.replace(/\/+$/, '')}/eapi/user/profile`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'remix-userid': userId,
          'remix-userkey': userKey
        },
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timer);
      if (!res.ok) continue;

      const json = await res.json();
      if (json && json.user) {
        // 若使用了备选节点成功响应，且当前节点不可用，自动切换为该有效节点
        if (nodeUrl !== settings.activeNodeUrl) {
          settings.activeNodeUrl = nodeUrl;
          await saveSettings(settings);
          await syncCookiesToNode(nodeUrl, userId, userKey);
        }

        return {
          id: json.user.id,
          name: json.user.name || 'Z-Library 读者',
          email: json.user.email,
          downloads_today: json.user.downloads_today ?? 0,
          downloads_limit: json.user.downloads_limit ?? 10,
          is_donor: json.user.is_donor ?? false
        };
      }
    } catch {
      clearTimeout(timer);
      // 当前节点不可达，继续尝试下一个候选节点
    }
  }

  return null;
}

/**
 * 获取当前全局登录认证状态
 */
export async function getAuthState(baseUrl: string): Promise<AuthState> {
  const { userId, userKey, fromSource } = await resolveCredentials(baseUrl);
  if (!userId || !userKey) {
    return { isLoggedIn: false, userId: '', userKey: '', fromSource };
  }

  const profile = await fetchUserProfile(baseUrl, userId, userKey);
  return {
    isLoggedIn: !!profile,
    userId,
    userKey,
    fromSource,
    userProfile: profile || undefined
  };
}

/**
 * 账号密码直接登录接口（支持多镜像自动轮询与智能容灾切换）
 */
export async function loginWithCredentials(
  baseUrl: string,
  email: string,
  password: string
): Promise<{
  success: boolean;
  message: string;
  profile?: UserProfile;
  userId?: string;
  userKey?: string;
  workingNode?: string;
}> {
  const settings = await getSettings();
  const candidateUrls = Array.from(new Set([
    baseUrl,
    'https://z-library.website',
    'https://z-lib.by',
    'http://z-lib.sk',
    ...settings.nodes.map((n) => n.url)
  ])).filter((u) => u && u.startsWith('http'));

  let lastErrorMessage = '';

  for (const nodeUrl of candidateUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    try {
      const endpoint = `${nodeUrl.replace(/\/+$/, '')}/eapi/user/login`;
      const formData = new FormData();
      formData.append('email', email.trim());
      formData.append('password', password);

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timer);
      const data = await res.json();

      // 如果返回明确的业务错误（例如密码错误），直接中断并提示，无需尝试其他节点
      if (!res.ok || data.success === 0) {
        lastErrorMessage = data.error || data.message || '账号或密码不正确';
        return {
          success: false,
          message: lastErrorMessage
        };
      }

      // 登录成功
      let userId = '';
      let userKey = '';

      if (data.user) {
        userId = String(data.user.id || data.user.remix_userid || '');
        userKey = String(data.user.remix_userkey || data.user.key || '');
      }

      if (!userId || !userKey) {
        const sniffed = await sniffAllZLibCookies();
        if (sniffed.userId) userId = sniffed.userId;
        if (sniffed.userKey) userKey = sniffed.userKey;
      }

      if (!userId || !userKey) {
        userId = (await getCookie(nodeUrl, 'remix_userid')) || '';
        userKey = (await getCookie(nodeUrl, 'remix_userkey')) || '';
      }

      if (!userId || !userKey) {
        continue;
      }

      // 保存凭据并自动优选切换到当前打通的节点
      settings.activeNodeUrl = nodeUrl;
      settings.manualUserId = userId;
      settings.manualUserKey = userKey;
      await saveSettings(settings);

      // 同步写入 Cookie
      await syncCookiesToNode(nodeUrl, userId, userKey);

      const profile: UserProfile = {
        id: data.user?.id || userId,
        name: data.user?.name || email,
        email: data.user?.email || email,
        downloads_today: data.user?.downloads_today ?? 0,
        downloads_limit: data.user?.downloads_limit ?? 10,
        is_donor: !!data.user?.donations_active
      };

      const hostname = new URL(nodeUrl).hostname;
      return {
        success: true,
        message: `登录成功！欢迎回来，${profile.name} (已自动优选连接至可用镜像: ${hostname})`,
        profile,
        userId,
        userKey,
        workingNode: nodeUrl
      };
    } catch (err: any) {
      clearTimeout(timer);
      lastErrorMessage = err.message || '网络连接超时';
      // 当前节点网络受限，继续轮询下一个候选节点
    }
  }

  return {
    success: false,
    message: `全部可用镜像连接失败 (${lastErrorMessage})，请检查网络或开启代理。`
  };
}

/**
 * 监听浏览器 Cookie 变更，当用户在其他标签页登录完成时自动回调
 */
export function listenCookieChanges(callback: () => void): void {
  if (typeof chrome !== 'undefined' && chrome.cookies?.onChanged) {
    chrome.cookies.onChanged.addListener((changeInfo) => {
      const name = changeInfo.cookie?.name;
      if (name === 'remix_userid' || name === 'remix_userkey') {
        callback();
      }
    });
  }
}
