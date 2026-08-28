export type HostOS = 'macos' | 'linux' | 'windows' | 'unsupported';

export function detectOS(): HostOS {
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (/mac os|macintosh/.test(ua) || /mac/.test(platform)) return 'macos';
  if (/windows|win32|win64/.test(ua) || /win/.test(platform)) return 'windows';
  if (/linux|x11/.test(ua) || /linux/.test(platform)) return 'linux';
  return 'unsupported';
}
