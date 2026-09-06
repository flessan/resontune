/** Hand-rolled icon set — 1.6px stroke, consistent optical size. */
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: props.width ?? 18,
  height: props.height ?? 18,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6.5" y="5" width="3.4" height="14" rx="1" /><rect x="14" y="5" width="3.4" height="14" rx="1" /></svg>
);
export const IconPrev = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M17.5 5.5v13L8 12z" /><rect x="5.5" y="5.5" width="2.2" height="13" rx="1" /></svg>
);
export const IconNext = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M6.5 5.5v13L16 12z" /><rect x="16.3" y="5.5" width="2.2" height="13" rx="1" /></svg>
);
export const IconShuffle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 7h3.5c1.7 0 3.2.9 4 2.3l3 5.4c.8 1.4 2.3 2.3 4 2.3H21" /><path d="M3 17h3.5c1 0 2-.3 2.8-.9M21 7h-3.5c-1 0-2 .3-2.8.9" /><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" /></svg>
);
export const IconRepeat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M17 3l3 3-3 3" /><path d="M20 6H7a4 4 0 0 0-4 4v1M7 21l-3-3 3-3" /><path d="M4 18h13a4 4 0 0 0 4-4v-1" /></svg>
);
export const IconRepeatOne = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M17 3l3 3-3 3" /><path d="M20 6H7a4 4 0 0 0-4 4v1M7 21l-3-3 3-3" /><path d="M4 18h13a4 4 0 0 0 4-4v-1" /><path d="M11.6 10.2l1.4-1v5" strokeWidth={1.9} /></svg>
);
export const IconVolume = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M11 5.5 6.5 9H3.5v6h3L11 18.5z" fill="currentColor" stroke="none" /><path d="M14.5 9a4 4 0 0 1 0 6M17 6.5a7.5 7.5 0 0 1 0 11" /></svg>
);
export const IconMute = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M11 5.5 6.5 9H3.5v6h3L11 18.5z" fill="currentColor" stroke="none" /><path d="m15 9.5 5 5M20 9.5l-5 5" /></svg>
);
export const IconHeart = (p: SVGProps<SVGSVGElement> & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <svg {...base(rest)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7.5-4.7-9.3-9.3C1.5 7.6 3.6 4.5 6.8 4.5c2 0 3.6 1.1 4.4 2.7l.8 1.5.8-1.5c.8-1.6 2.4-2.7 4.4-2.7 3.2 0 5.3 3.1 4.1 6.2C19.5 15.3 12 20 12 20z" />
    </svg>
  );
};
export const IconQueue = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 6h12M3 11h12M3 16h7" /><path d="M16 14.5v5.2M16 19.7c0 .9 2 .9 2 0v-4l3-1" /></svg>
);
export const IconExpand = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m7 14-4 4m0 0v-3.5M3 18h3.5M17 10l4-4m0 0v3.5M21 6h-3.5" /></svg>
);
export const IconCollapse = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m4 20 5.5-5.5M9.5 18v-3.5H6M20 4l-5.5 5.5M14.5 6v3.5H18" /></svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m4 10.5 8-6.5 8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" /><path d="M9.5 20v-6h5v6" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="10.5" cy="10.5" r="6" /><path d="m15.5 15.5 5 5" /></svg>
);
export const IconLibrary = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4.5v15M8.5 4.5v15" /><path d="m12.5 5.5 5.5-1 2.5 14.6-5.5 1z" /></svg>
);
export const IconDisc = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></svg>
);
export const IconMic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></svg>
);
export const IconTag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.8l-6.1 6.1a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1-.6-1.4z" /><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" /></svg>
);
export const IconPlaylist = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 6.5h12M3 11h12M3 15.5h6" /><path d="M17.5 8v9.2M17.5 17.2c0 1.1 2.5 1.1 2.5 0V11l1.5-.6" /></svg>
);
export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 16V5M8 8.5 12 4.5l4 4" /><path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" /></svg>
);
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="8.5" r="3.7" /><path d="M4.5 20c1.3-3.3 4.1-5 7.5-5s6.2 1.7 7.5 5" /></svg>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M4.2 6.8l1.9 1.1M17.9 16.1l1.9 1.1M3 12h2.2M18.8 12H21M4.2 17.2l1.9-1.1M17.9 7.9l1.9-1.1" /></svg>
);
export const IconWave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 12h2c1 0 1-4 2-4s1 8 2 8 1-11 2-11 1 14 2 14 1-11 2-11 1 8 2 8 1-4 2-4h2" /></svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconDots = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
);
export const IconExternal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4.5 6.5h15M9.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6M7 6.5l.8 12.6a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 6.5" /></svg>
);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 4v11M8 11.5l4 4 4-4" /><path d="M4.5 16.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" /></svg>
);
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" /></svg>
);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></svg>
);
export const IconGitHub = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z" /></svg>
);
export const IconSubmit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 19V8.5M8.5 12 12 8.5l3.5 3.5" /><circle cx="12" cy="12" r="9.5" /></svg>
);
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3 5 5.8v5.4c0 4.4 3 8.1 7 9.3 4-1.2 7-4.9 7-9.3V5.8z" /><path d="m9 11.8 2.2 2.2L15.5 9.5" /></svg>
);
