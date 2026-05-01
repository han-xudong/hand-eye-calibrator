const fallbackSiteUrl = 'https://hand-eye-calibrator.vercel.app';

const normalizeSiteUrl = (value?: string): string => {
  if (!value) {
    return fallbackSiteUrl;
  }

  const withProtocol = value.startsWith('http') ? value : `https://${value}`;

  return withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol;
};

export const siteName = 'Hand-Eye Calibrator';

export const siteDescription =
  'Web-based hand-eye calibration for eye-in-hand and eye-to-hand setups with chessboard detection, TCP pose import, and 3D result visualization.';

export const siteKeywords = [
  'hand-eye calibration',
  'eye in hand calibration',
  'eye to hand calibration',
  'camera robot calibration',
  'chessboard detection',
  'robot tcp pose calibration',
  'next.js calibration tool',
];

export const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
);

export const siteOgImage = '/assets/screenshot.jpg';