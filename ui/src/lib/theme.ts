import type { SmokeMonkeyChatCustomTheme } from '../types/options';

/** Bare HSL channels: "220 38% 5%". Tokens are consumed as
 *  `hsl(var(--token) / alpha)`, so a hex value would break every usage. */
const HSL = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/;

/** Normalizes an HSL triple, or returns undefined for anything else. */
export function hslTriple(value: string | undefined): string | undefined {
  const m = value?.match(HSL);
  return m ? `${m[1]} ${m[2]}% ${m[3]}%` : undefined;
}

type Hsl = [h: number, s: number, l: number];

function parse(value: string | undefined): Hsl | undefined {
  const m = value?.match(HSL);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const fmt = (n: number) => Math.round(n * 10) / 10;
const at = (hsl: Hsl, l: number, s = hsl[1]): string => `${fmt(hsl[0])} ${fmt(s)}% ${fmt(clamp(l))}%`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** WCAG relative luminance of an HSL triple, for picking a readable
 *  foreground on a caller-supplied brand color. */
function luminance([h, s, l]: Hsl): number {
  const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l / 100 - c / 2;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r + m) + 0.7152 * lin(g + m) + 0.0722 * lin(b + m);
}

/**
 * Fills in the tokens a partial `customTheme` left out.
 *
 * Without this, setting just `bg` and `inkPrimary` produces an unreadable
 * mix: the caller's light background combined with the stock dark surfaces
 * (code blocks land at ~1.1:1). Anything the caller sets explicitly always
 * wins; everything below is only synthesized for omitted keys.
 */
export function deriveCustomThemeVars(theme: SmokeMonkeyChatCustomTheme): Record<string, string> {
  const has = (k: keyof SmokeMonkeyChatCustomTheme) => theme[k] !== undefined;
  const set = (v: string | undefined, k: keyof SmokeMonkeyChatCustomTheme) =>
    v && !has(k) ? ({ [token(k)]: v } as Record<string, string>) : null;

  const out: Record<string, string> = {};
  const add = (o: Record<string, string> | null) => {
    if (o) Object.assign(out, o);
  };

  const bg = parse(theme.bg);
  const ink = parse(theme.inkPrimary);
  const primary = parse(theme.primary);
  const accent = parse(theme.accent);
  if (!bg && !ink && !primary && !accent) return out;

  // An explicit `scheme` wins; otherwise a light `bg` implies light ramps.
  const dark = theme.scheme ? theme.scheme !== 'light' : (bg ? bg[2] <= 50 : true);
  // Hover moves away from the body text: lighter on dark, darker on light.
  const hoverStep = dark ? 8 : -8;

  // Brand ramp. Without this, `em`, focus rings and hover states stay the
  // stock purple no matter what brand color the caller picked.
  if (primary) {
    add(set(`${theme.primary} / 0.15`, 'primarySubtle' as never));
    add(set(at(primary, primary[2] + hoverStep), 'primaryHover' as never));
    add(set(at(primary, primary[2] + (dark ? -18 : -14)), 'primaryDeep' as never));
    add(set(theme.primary, 'ring' as never));
    const lu = luminance(primary);
    add(set(`0 0% ${1.05 / (lu + 0.05) >= (lu + 0.05) / 0.05 ? 98 : 10}%`, 'primaryForeground' as never));
  }
  if (accent) {
    add(set(`${theme.accent} / 0.15`, 'accentSubtle' as never));
    add(set(at(accent, accent[2] + hoverStep), 'accentHover' as never));
    const lu = luminance(accent);
    add(set(`0 0% ${1.05 / (lu + 0.05) >= (lu + 0.05) / 0.05 ? 98 : 10}%`, 'accentForeground' as never));
  }

  // The stock ramps, expressed as offsets from the caller's own bg/ink so a
  // custom palette keeps the same depth relationships as a built-in theme.
  if (bg) {
    const [h, , l] = bg;
    const ramp = dark
      ? { surface950: 5, surface900: 3, surface850: 4, surface800: 2, surface750: 5, surface700: 6, surface600: 10 }
      : { surface950: 3, surface900: 1, surface850: -2, surface800: -3, surface750: -5, surface700: -7, surface600: -11 };
    add(set(at(bg, l + ramp.surface950), 'surface950' as never));
    add(set(at(bg, l + ramp.surface900), 'surface900' as never));
    add(set(at(bg, l + ramp.surface850), 'surface850' as never));
    add(set(at(bg, l + ramp.surface800), 'surface800' as never));
    add(set(at(bg, l + ramp.surface750), 'surface750' as never));
    add(set(at(bg, l + ramp.surface700), 'surface700' as never));
    add(set(at(bg, l + ramp.surface600), 'surface600' as never));
    add(set(at(bg, l + (dark ? 4 : 2)), 'bgElevated' as never));
    add(set(at(bg, l + (dark ? 7 : -2)), 'input' as never));
    add(set(at(bg, l + (dark ? 14 : -8), dark ? bg[1] * 0.9 : bg[1] * 0.7), 'border' as never));
    add(set(at(bg, l + (dark ? 22 : -18), dark ? bg[1] * 0.8 : bg[1] * 0.5), 'borderStrong' as never));
    const elevated = out['--surface-900'] ?? out['--surface-950'];
    if (elevated) {
      add(set(elevated, 'popover' as never));
      add(set(elevated, 'card' as never));
    }
  }

  if (ink) {
    // Land on the same lightness the built-in themes use, so body text and
    // emphasis clear AA whether the palette is dark or light.
    const bgL = bg?.[2] ?? (dark ? 8 : 96);
    add(set(at(ink, lerp(ink[2], bgL, dark ? 0.29 : 0.42)), 'inkSecondary' as never));
    add(set(at(ink, lerp(ink[2], bgL, dark ? 0.5 : 0.61)), 'inkMuted' as never));
  }

  if (!dark) {
    // The dark defaults are ~45% lightness, which is only ~2.2:1 on a light
    // surface. Same values the `light` / `solar` / `paper` palettes use.
    add(set('142 72% 28%', 'success' as never));
    add(set('32 90% 34%', 'warning' as never));
    add(set('0 76% 40%', 'destructive' as never));
    add(set('205 88% 34%', 'info' as never));
  }
  add(set(theme.inkPrimary, 'cardForeground' as never));
  add(set(theme.inkPrimary, 'popoverForeground' as never));

  return out;
}

/** camelCase option key -> `--kebab-case` token. Also splits letter/digit
 *  boundaries so `surface950` becomes `--surface-950`, not `--surface950`. */
export function token(key: keyof SmokeMonkeyChatCustomTheme): string {
  return `--${String(key)
    .replace(/([a-z])([A-Z0-9])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()}`;
}
