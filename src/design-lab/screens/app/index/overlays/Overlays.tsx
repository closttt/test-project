/** Global layer of the «Индекс» app (palette, quick add/note, shortcuts, assistant, dock, toasts…). */
import Dock from "./Dock";
import Pomodoro from "./Pomodoro";
import Assistant from "./Assistant";
import { CommandPalette } from "./CommandPalette";
import { QuickAdd } from "./QuickAdd";
import { QuickNote } from "./QuickNote";
import { Shortcuts } from "./Shortcuts";
import { Hotkeys } from "./Hotkeys";
import { ToastStyle } from "./Toasts";
import { Engines } from "./Engines";
import { CelebrationHost } from "./Celebration";
import { DialogsHost } from "./Dialogs";

export default function Overlays() {
  return (
    <>
      <ToastStyle />
      <Hotkeys />
      <Engines />
      <Dock />
      <Pomodoro />
      <Assistant />
      <CommandPalette />
      <QuickAdd />
      <QuickNote />
      <Shortcuts />
      <DialogsHost />
      <CelebrationHost />
    </>
  );
}
