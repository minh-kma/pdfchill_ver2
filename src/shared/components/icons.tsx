import type { SVGProps } from 'react';
import type { ToolCategory } from '../../toolRegistry.ts';

export type IconComponent = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* --- Tool icons -----------------------------------------------------------------------------
 *
 * The 11 tool icons are SOLID two-tone fills, deliberately a different animal from the chrome
 * icons at the bottom of this file, which stay 1.6-stroke outlines on a single `currentColor`.
 * Do not merge the two wrappers: `Svg` sets `stroke`, `ToolSvg` sets neither stroke nor fill on
 * the root, because each shape picks its own tone.
 *
 * The two tones arrive as CSS custom properties rather than props, so the registry contract is
 * untouched — `IconComponent` is still `(props) => JSX.Element` and `toolRegistry.ts` still just
 * stores the component. Whoever renders an icon sets the tones on any ancestor; `toolIconTone()`
 * below derives them from the tool's category.
 *
 * Every tone falls back to `currentColor`, and that fallback is load-bearing: AllToolsMenu renders
 * these same icons at 18px with no tile and a single text colour. There, primary and secondary
 * collapse to one hue and `--icon-secondary-opacity` (0.42 by default) is the only thing keeping
 * the two shapes apart — which is why the second tone is expressed as an opacity and not as a
 * second colour. A tile that sets both tones explicitly also sets that opacity back to 1.
 *
 * `import type { ToolCategory }` is type-only on purpose: toolRegistry.ts imports this file, so a
 * value import would close a module cycle. The type is erased at compile time; the cycle is not.
 */

function ToolSvg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

/** Foreground shape — the 600 step of the category ramp. */
const P = { fill: 'var(--icon-primary, currentColor)' } as const;
/** Backing shape — the 400 step. Opacity is what carries it in a monochrome context. */
const S = {
  fill: 'var(--icon-secondary, currentColor)',
  fillOpacity: 'var(--icon-secondary-opacity, 0.42)',
} as const;
/** Punched-out detail. It reads as a hole, so it must match the tile behind the icon. */
const K = { fill: 'var(--icon-knockout, #fff)' } as const;

/**
 * Category -> icon tones, as inline custom properties, plus the tile's own background.
 *
 * Keyed by the tool's EXISTING registry category, so a card's icon is the same hue as the filter
 * tab that selects it. Keyed by category and not by tool id: adding a tool to a category that
 * already exists needs no change here, and no tool is named in this file.
 */
const TONE_RAMP: Record<ToolCategory, string> = {
  organize: 'brand',
  optimize: 'accent',
  convert: 'violet',
  edit: 'sand',
  security: 'green',
};

export function toolIconTone(category: ToolCategory): React.CSSProperties {
  const ramp = TONE_RAMP[category];
  return {
    '--icon-primary': `var(--color-${ramp}-600)`,
    '--icon-secondary': `var(--color-${ramp}-400)`,
    '--icon-secondary-opacity': '1',
    '--icon-knockout': `var(--color-${ramp}-100)`,
    backgroundColor: `var(--color-${ramp}-100)`,
  } as React.CSSProperties;
}

export const MergeIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...S} x="2.5" y="2.5" width="12.5" height="15.5" rx="2.6" />
    <rect {...P} x="9" y="6" width="12.5" height="15.5" rx="2.6" />
  </ToolSvg>
);

export const SplitIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...P} x="2.5" y="3.5" width="8.2" height="17" rx="2.2" />
    <rect {...S} x="13.3" y="3.5" width="8.2" height="17" rx="2.2" />
  </ToolSvg>
);

export const ReorderIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...P} x="2.5" y="2.5" width="8.4" height="8.4" rx="2.4" />
    <rect {...S} x="13.1" y="2.5" width="8.4" height="8.4" rx="2.4" />
    <rect {...S} x="2.5" y="13.1" width="8.4" height="8.4" rx="2.4" />
    <rect {...P} x="13.1" y="13.1" width="8.4" height="8.4" rx="2.4" />
  </ToolSvg>
);

export const DeletePagesIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...S} x="2.5" y="2" width="13.5" height="19" rx="2.6" />
    <circle {...P} cx="17.2" cy="17.2" r="5.4" />
    <rect {...K} x="14.2" y="16.2" width="6" height="2" rx="1" />
  </ToolSvg>
);

// Arc band + arrowhead, not a stroked circle: everything in this group is a solid fill, so the
// ring is a closed path between an outer arc (R 8.4) and an inner one (r 5.6). The gap sits at
// 12 o'clock and the head points clockwise out of it.
export const RotateIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <circle {...S} cx="12" cy="12" r="8.6" />
    <path {...P} d="M11.27 3.63 A8.4 8.4 0 1 0 19.89 14.87 L17.26 13.92 A5.6 5.6 0 1 1 11.51 6.42 Z" />
    <path {...P} d="M16.37 4.59 11.73 8.92 11.05 1.14 Z" />
  </ToolSvg>
);

export const CompressIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...S} x="2.5" y="10.8" width="19" height="2.6" rx="1.3" />
    <path {...P} d="M12 9.9 7.9 5.6 h8.2 Z" />
    <rect {...P} x="10.5" y="1.6" width="3" height="4.6" rx="1.5" />
    <path {...P} d="M12 14.3 7.9 18.6 h8.2 Z" />
    <rect {...P} x="10.5" y="18" width="3" height="4.6" rx="1.5" />
  </ToolSvg>
);

export const OcrIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...S} x="2.5" y="2" width="14.5" height="19" rx="2.6" />
    <rect {...P} x="5.6" y="6.4" width="8.3" height="2.1" rx="1.05" />
    <rect {...P} x="5.6" y="10.4" width="5.6" height="2.1" rx="1.05" />
    <path
      {...P}
      d="M16.9 10.6a5.3 5.3 0 1 0 3.02 9.66l1.32 1.32a1.3 1.3 0 0 0 1.84-1.84l-1.32-1.32A5.3 5.3 0 0 0 16.9 10.6Zm0 2.6a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z"
    />
  </ToolSvg>
);

export const ImageToPdfIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...S} x="2.5" y="2.5" width="13" height="16.5" rx="2.6" />
    <rect {...P} x="8.5" y="6.5" width="13" height="15" rx="2.6" />
    <circle {...K} cx="12.6" cy="11.1" r="1.7" />
    <path {...K} d="M10 18.6 13.9 13.9 16.3 16.8 18 14.8 20.3 18.6 Z" />
  </ToolSvg>
);

// The knockout bars are the page's text and the diagonal is the mark stamped over it — the
// crossing is the whole metaphor, so the bar is sized to stay inside the page (a 13.6x3.2 bar
// rotated 30 degrees spans x 5.3-18.7, y 7.2-16.8) rather than being clipped. No clipPath here
// on purpose: it would need an id, and this icon renders many times on one page.
export const WatermarkIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <rect {...S} x="2.5" y="2.5" width="19" height="19" rx="3" />
    <rect {...K} x="6.2" y="5.6" width="8.4" height="1.9" rx="0.95" />
    <rect {...K} x="9.4" y="16.6" width="8.4" height="1.9" rx="0.95" />
    <rect
      {...P}
      x="5.9"
      y="10.35"
      width="12.2"
      height="3.3"
      rx="1.65"
      transform="rotate(30 12 12)"
    />
  </ToolSvg>
);

export const ProtectIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <path {...S} d="M7.8 11 V7.6 A4.2 4.2 0 0 1 16.2 7.6 V11 H14.2 V7.6 A2.2 2.2 0 0 0 9.8 7.6 V11 Z" />
    <rect {...P} x="3.6" y="10" width="16.8" height="11.5" rx="3.2" />
    <circle {...K} cx="12" cy="14.6" r="1.8" />
    <rect {...K} x="11.1" y="15.4" width="1.8" height="3.4" rx="0.9" />
  </ToolSvg>
);

export const UnlockIcon: IconComponent = (props) => (
  <ToolSvg {...props}>
    <path {...S} d="M7.8 11 V7.6 A4.2 4.2 0 0 1 16.2 7.6 H14.2 A2.2 2.2 0 0 0 9.8 7.6 V11 Z" />
    <rect {...P} x="3.6" y="10" width="16.8" height="11.5" rx="3.2" />
    <circle {...K} cx="12" cy="14.6" r="1.8" />
    <rect {...K} x="11.1" y="15.4" width="1.8" height="3.4" rx="0.9" />
  </ToolSvg>
);

/* --- Chrome icons. Outline, 1.6 stroke, one `currentColor`. Not two-tone; see above. -------- */

export const ChevronDownIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const UndoIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M4 9h10a5 5 0 0 1 0 10h-4" />
    <path d="M7.5 5.5 4 9l3.5 3.5" />
  </Svg>
);

export const RedoIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M20 9H10a5 5 0 0 0 0 10h4" />
    <path d="M16.5 5.5 20 9l-3.5 3.5" />
  </Svg>
);

export const CloseIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const ZoomIcon: IconComponent = (props) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4M8.5 11h5M11 8.5v5" />
  </Svg>
);

export const UploadIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M12 16V4M8 7.5 12 3.5l4 4" />
    <path d="M4 15v3.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Svg>
);

export const PlusIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const CheckIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const DownloadIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M12 4v12M8 12.5l4 4 4-4" />
    <path d="M4 19h16" />
  </Svg>
);
