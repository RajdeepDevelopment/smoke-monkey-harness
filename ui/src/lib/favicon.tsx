import type { ReactElement } from 'react';
import { Github, Gitlab } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

/**
 * Lightweight `faviconForUrl` mirroring the desktop app's BrandIconResolver
 * contract (`{ Icon, color } | null`) without pulling in `react-icons`.
 * Covers the common domains; unknown hosts return null so Markdown falls back
 * to the generic external-link glyph.
 */

export type FaviconIcon = LucideIcon | ((props: { className?: string }) => ReactElement);

function letterGlyph(letter: string): FaviconIcon {
  function BrandLetter({ className }: { className?: string }) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 select-none items-center justify-center rounded-[4px] text-[10px] font-extrabold leading-none',
          className
        )}
      >
        {letter}
      </span>
    );
  }
  return BrandLetter;
}

function OpenAIKnot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0-.511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

// Ordered hostname matchers: [regex, icon, brand accent class] (most specific first).
const MATCHERS: [RegExp, FaviconIcon, string][] = [
  [/^github\.com$|\.github\.io$/, Github, 'text-white'],
  [/^gitlab\.com$/, Gitlab, 'text-[#FC6D26]'],
  [/^openai\.com$|^chatgpt\.com$/, OpenAIKnot, 'text-[#10A37F]'],
  [/^anthropic\.com$|^claude\.ai$/, letterGlyph('A'), 'text-[#D97757]'],
  [/^gemini\.google\.com$|^google\.com$/, letterGlyph('G'), 'text-[#4285F4]'],
  [/^vercel\.com$/, letterGlyph('V'), 'text-white'],
  [/^hub\.docker\.com$|^docker\.com$/, letterGlyph('D'), 'text-[#2496ED]'],
  [/^supabase\.com$/, letterGlyph('S'), 'text-[#3ECF8E]'],
  [/^miro\.com$/, letterGlyph('M'), 'text-[#FFD02F]'],
  [/^notion\.so$/, letterGlyph('N'), 'text-white'],
  [/^figma\.com$/, letterGlyph('F'), 'text-[#F24E1E]'],
  [/^stripe\.com$/, letterGlyph('S'), 'text-[#635BFF]'],
  [/^slack\.com$/, letterGlyph('S'), 'text-[#E01E5A]'],
  [/^cloudflare\.com$/, letterGlyph('C'), 'text-[#F38020]'],
  [/^npmjs\.com$/, letterGlyph('n'), 'text-[#CB3837]'],
  [/^medium\.com$/, letterGlyph('M'), 'text-white'],
  [/^x\.com$|^twitter\.com$/, letterGlyph('X'), 'text-white'],
  [/^youtube\.com$/, letterGlyph('Y'), 'text-red-500'],
  [/^developer\.mozilla\.org$/, letterGlyph('M'), 'text-white'],
  [/^reddit\.com$/, letterGlyph('R'), 'text-[#FF4500]'],
  [/^stackoverflow\.com$/, letterGlyph('S'), 'text-[#F48024]'],
];

/**
 * Resolves the site brand icon for an external URL's hostname (e.g. a
 * `https://github.com/...` link → Github). Returns null when the host is
 * unknown, so callers can fall back to a generic external-link glyph.
 */
export function faviconForUrl(href: string | undefined | null): { Icon: FaviconIcon; color: string } | null {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  try {
    const host = new URL(href).hostname.toLowerCase();
    for (const [re, Icon, color] of MATCHERS) {
      if (re.test(host)) return { Icon, color };
    }
    return null;
  } catch {
    return null;
  }
}