import type { JwPlayerInstance } from "@/lib/jwplayerLoader";

// JW Player's own stock rewind-10 icon (src/assets/SVG/rewind-10.svg in the
// player source) — reused as-is for the forward button so both controls match
// the default look instead of a custom-drawn icon. Mirrored via CSS
// (.jw-icon-forward10 svg in globals.css) to point the opposite direction.
const REWIND_10_ICON =
  '<svg class="jw-svg-icon jw-svg-icon-rewind" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" focusable="false"><path d="M113.2,131.078a21.589,21.589,0,0,0-17.7-10.6,21.589,21.589,0,0,0-17.7,10.6,44.769,44.769,0,0,0,0,46.3,21.589,21.589,0,0,0,17.7,10.6,21.589,21.589,0,0,0,17.7-10.6,44.769,44.769,0,0,0,0-46.3Zm-17.7,47.2c-7.8,0-14.4-11-14.4-24.1s6.6-24.1,14.4-24.1,14.4,11,14.4,24.1S103.4,178.278,95.5,178.278Zm-43.4,9.7v-51l-4.8,4.8-6.8-6.8,13-13a4.8,4.8,0,0,1,8.2,3.4v62.7l-9.6-.1Zm162-130.2v125.3a4.867,4.867,0,0,1-4.8,4.8H146.6v-19.3h48.2v-96.4H79.1v19.3c0,5.3-3.6,7.2-8,4.3l-41.8-27.9a6.013,6.013,0,0,1-2.7-8,5.887,5.887,0,0,1,2.7-2.7l41.8-27.9c4.4-2.9,8-1,8,4.3v19.3H209.2A4.974,4.974,0,0,1,214.1,57.778Z"/></svg>';

/** Adds a forward-10 button next to JW's native rewind-10 once the player is
 * ready. Native controlbar buttons carry no "button" attribute (only
 * addButton()-created ones do) — they're identified by their jw-icon-<name>
 * class instead, which is why the native rewind lookup uses a class selector. */
export function addForwardButton(player: JwPlayerInstance): void {
  player.once("ready", () => {
    player.addButton(
      REWIND_10_ICON,
      "Forward 10 seconds",
      () => player.seek(player.getPosition() + 10),
      "forward10",
      "jw-icon-forward10",
    );

    const controlbar = player.getContainer().querySelector(".jw-controlbar");
    const nativeRewind = controlbar?.querySelector(".jw-icon-rewind");
    const forward10 = controlbar?.querySelector('[button="forward10"]');
    if (nativeRewind && forward10) {
      nativeRewind.insertAdjacentElement("afterend", forward10);
    }
  });
}
