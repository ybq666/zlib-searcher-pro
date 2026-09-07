import { UserProfile } from '../types';
import { getSettings } from './storage';

export interface AuthState {
  isLoggedIn: boolean;
  userId: string;
  userKey: string;
  userProfile?: UserProfile;
}

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

export async function resolveCredentials(targetUrl: string): Promise<{ userId: string; userKey: string }> {
  const settings = await getSettings();

  // 1. First priority: Check cookies on targetUrl
  let userId = await getCookie(targetUrl, 'remix_userid');
  let userKey = await getCookie(targetUrl, 'remix_userkey');

  // 2. Second priority: If missing, check common Z-Library auth hubs
  if (!userId || !userKey) {
    const fallbackUrls = [
      'https://singlelogin.re',
      'https://singlelogin.rs',
      'https://singlelogin.se',
      'https://z-lib.sk',
      'https://z-library.sk'
    ];

    for (const fbUrl of fallbackUrls) {
      if (!userId) userId = await getCookie(fbUrl, 'remix_userid');
      if (!userKey) userKey = await getCookie(fbUrl, 'remix_userkey');
      if (userId && userKey) break;
    }
  }

  // 3. Third priority: Manual fallback configured by user in settings
  if (!userId && settings.manualUserId) {
    userId = settings.manualUserId.trim();
  }
  if (!userKey && settings.manualUserKey) {
    userKey = settings.manualUserKey.trim();
  }

  return {
    userId: userId || '',
    userKey: userKey || ''
  };
}

export async function fetchUserProfile(baseUrl: string, userId: string, userKey: string): Promise<UserProfile | null> {
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
    console.error('Failed to fetch user profile:', e);
  }
  return null;
}

export async function getAuthState(baseUrl: string): Promise<AuthState> {
  const { userId, userKey } = await resolveCredentials(baseUrl);
  if (!userId || !userKey) {
    return { isLoggedIn: false, userId: '', userKey: '' };
  }

  const profile = await fetchUserProfile(baseUrl, userId, userKey);
  return {
    isLoggedIn: !!profile,
    userId,
    userKey,
    userProfile: profile || undefined
  };
}
