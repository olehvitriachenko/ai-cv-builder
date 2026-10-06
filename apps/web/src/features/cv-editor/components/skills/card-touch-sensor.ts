import { TouchSensor } from "@dnd-kit/core";

const CONTROLS = "input, textarea, select, button, a, [role='combobox'], [role='listbox'], [contenteditable='true']";

/**
 * A touch sensor for dragging a whole card: a long press on the card itself starts the drag, but a
 * press on one of its controls (fields, buttons, chips) never does, so they keep working. The drag
 * handle (`data-drag-handle`) is a control that does start it.
 */
export class CardTouchSensor extends TouchSensor {
  static override activators: typeof TouchSensor.activators = [
    {
      eventName: "onTouchStart",
      handler: (event, options) => {
        const target = event.nativeEvent.target;
        if (target instanceof Element && target.closest(CONTROLS) && !target.closest("[data-drag-handle]")) {
          return false;
        }
        const [activator] = TouchSensor.activators;
        return activator ? activator.handler(event, options) : false;
      },
    },
  ];
}
