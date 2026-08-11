import type { SVGProps } from 'react';

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

/* --- Tool icons. Referenced only from src/toolRegistry.ts. --------------------------------- */

export const MergeIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="9" height="11" rx="1.5" />
    <rect x="12" y="9" width="9" height="11" rx="1.5" />
  </Svg>
);

export const SplitIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="7" height="16" rx="1.5" />
    <rect x="14" y="4" width="7" height="16" rx="1.5" />
    <path d="M12 3v18" strokeDasharray="2 3" />
  </Svg>
);

export const ReorderIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="7" height="7" rx="1.5" />
    <rect x="14" y="4" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 17.5h7M18.5 15l2.5 2.5-2.5 2.5" />
  </Svg>
);

export const DeletePagesIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M6 7h12M10 7V5h4v2M8 7l.8 12.1A1 1 0 0 0 9.8 20h4.4a1 1 0 0 0 1-.9L16 7" />
    <path d="M10.5 11v5M13.5 11v5" />
  </Svg>
);

export const RotateIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 5v6h-6" />
  </Svg>
);

export const CompressIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M12 3v6M9 6l3-3 3 3" />
    <path d="M12 21v-6M9 18l3 3 3-3" />
    <path d="M4 12h16" />
  </Svg>
);

export const OcrIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9h4M7 13h10M7 17h7" />
    <path d="M15 8.5 17 12l2-3.5" />
  </Svg>
);

export const ImageToPdfIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 17 4.5-4.5L13 17" />
    <path d="m13 17 3-3 4 4" />
  </Svg>
);

export const WatermarkIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7.5 16 9-8" strokeWidth={2.2} opacity={0.55} />
    <path d="M8 8h3M13 16h3" opacity={0.55} />
  </Svg>
);

export const ProtectIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="4.5" y="10" width="15" height="10" rx="2" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    <path d="M12 14v2" />
  </Svg>
);

export const UnlockIcon: IconComponent = (props) => (
  <Svg {...props}>
    <rect x="4.5" y="10" width="15" height="10" rx="2" />
    <path d="M8 10V7.5a4 4 0 0 1 7.6-1.7" />
    <path d="M12 14v2" />
  </Svg>
);

/* --- Chrome icons. ------------------------------------------------------------------------- */

export const ChevronDownIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const LogoIcon: IconComponent = (props) => (
  <Svg {...props}>
    <path d="M6.5 3h7L19 8.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M13 3v6h6" />
    <path d="M9 17v-5h1.8a1.6 1.6 0 0 1 0 3.2H9" />
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
