import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * The app's one dnd-kit sensor configuration.
 *
 * `spec/maintainability.md` pain point #9: the page workspace and the images-to-PDF grid used to
 * carry independently-maintained copies of this, so a UX tweak to one silently diverged from the
 * other. Both go through this hook now.
 *
 * The numbers are load-bearing (`spec/features.md` §1.4): 6px of pointer movement before a drag
 * starts, so clicking a thumbnail's rotate/delete button never turns into a drag; touch needs a
 * 150ms hold with 6px of tolerance.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
