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
 * 获取用户信息及下载限额
 */
export async function fetchUserProfile(
  baseUrl: string,
  userId: string,
  userKey: string
): Promise<UserProfile | null> {
  if (!userId || !userKey) return null;

  try {
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/eapi/user/profile`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'remix-userid': userId,
        'remix-userkey': userKey
      }
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.user) {
      return {
        id: json.user.id,
        name: json.user.name || 'Z-Library 读者',
        email: json.user.email,
        downloads_today: json.user.downloads_today ?? 0,
        downloads_limit: json.user.downloads_limit ?? 10,
        is_donor: json.user.is_donor ?? false
      };
    }
  } catch (e) {
    console.error('获取用户资料失败:', e);
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
 * 账号密码直接登录接口
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
}> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/eapi/user/login`;
  const formData = new FormData();
  formData.append('email', email.trim());
  formData.append('password', password);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok || data.success === 0) {
      return {
        success: false,
        message: data.error || data.message || `登录失败 (HTTP ${res.status})`
      };
    }

    let userId = '';
    let userKey = '';

    // 从返回的 user 对象中解析
    if (data.user) {
      userId = String(data.user.id || data.user.remix_userid || '');
      userKey = String(data.user.remix_userkey || data.user.key || '');
    }

    // 备用：从全局嗅探中获取刚写入的 Cookie
    if (!userId || !userKey) {
      const sniffed = await sniffAllZLibCookies();
      if (sniffed.userId) userId = sniffed.userId;
      if (sniffed.userKey) userKey = sniffed.userKey;
    }

    // 备用：从当前节点 Cookie 提取
    if (!userId) userId = (await getCookie(baseUrl, 'remix_userid')) || '';
    if (!userKey) userKey = (await getCookie(baseUrl, 'remix_userkey')) || '';

    if (!userId || !userKey) {
      return {
        success: false,
        message: '登录已成功，但未解析到 remix_userkey。您可以尝试在网页登录后点击一键嗅探。'
      };
    }

    // 保存到设置
    const settings = await getSettings();
    settings.manualUserId = userId;
    settings.manualUserKey = userKey;
    await saveSettings(settings);

    // 同步写入 Cookie
    await syncCookiesToNode(baseUrl, userId, userKey);

    // 获取用户资料
    const profile = await fetchUserProfile(baseUrl, userId, userKey);

    return {
      success: true,
      message: `登录成功！欢迎，${profile?.name || email}`,
      profile: profile || undefined,
      userId,
      userKey
    };
  } catch (err: any) {
    return {
      success: false,
      message: `登录请求异常: ${err.message || '请检查当前镜像站连接状态'}`
    };
  }
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
