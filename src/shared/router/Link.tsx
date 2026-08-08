import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './navigation.ts';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Build this with `buildPath()` from shared/lib/routes.ts — never by string concatenation. */
  to: string;
}

/**
 * An anchor that navigates client-side. It stays a real `<a href>` so crawlers, middle-click,
 * ctrl-click and "copy link address" all behave normally.
 */
export function Link({ to, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // Let the browser handle anything that isn't a plain left-click.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (props.target && props.target !== '_self') return;
    event.preventDefault();
    navigate(to);
  }

  return <a href={to} onClick={handleClick} {...props} />;
}
