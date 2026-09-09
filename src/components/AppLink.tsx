/**
 * Links that opt into the ResonTune view-transition path by default.
 *
 * Reduced motion and browsers without the API fall back to an instant
 * navigation - React Router ignores `viewTransition` when the document
 * cannot start one.
 */
import {
  Link as RRLink,
  NavLink as RRNavLink,
  type LinkProps,
  type NavLinkProps,
} from 'react-router-dom';
import { shouldViewTransition } from '@/lib/motion';

export function Link({ viewTransition, ...props }: LinkProps) {
  return <RRLink viewTransition={viewTransition ?? shouldViewTransition()} {...props} />;
}

export function NavLink({ viewTransition, ...props }: NavLinkProps) {
  return <RRNavLink viewTransition={viewTransition ?? shouldViewTransition()} {...props} />;
}
