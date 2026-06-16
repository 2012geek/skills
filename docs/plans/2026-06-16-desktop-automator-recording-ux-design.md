# Desktop Automator Recording UX Design

## Problem Statement

The V2 recorder has 4 critical UX gaps:

1. **No visual feedback during recording** — Users cannot tell if recording is active while operating the desktop. Only terminal stdout output exists.
2. **No step count visibility** — Users cannot see how many steps have been recorded or recording duration in real-time.
3. **No reliable stop mechanism** — Only Esc key stops recording. No signal handling (SIGTERM/SIGKILL), causing data loss when process is interrupted (previous incident: recording killed, task.json not saved).
4. **No save confirmation** — Users cannot confirm data was saved successfully after recording ends.

## Architecture: tkinter OSD + Signal Handling + Status File

### Component 1: tkinter OSD Floating Window

A semi-transparent, always-on-top floating window positioned at the top-right corner of the screen:

```
┌───────────────────────────┐
│ 🔴 REC   Step: 5   01:23 │
│                           │
│ [  ⬛  Stop Recording  ] │
└───────────────────────────┘
```

- **Status area**: Red dot + "REC" label, indicates recording is active
- **Counter area**: Current step count + elapsed time (from start to now)
- **Stop button**: Click to stop recording and save data
- Window properties: `always_on_top`, semi-transparent background, draggable but not minimizable
- Elapsed time updates every second via tkinter `after()` timer

Implementation details:
- tkinter is Python built-in, no extra dependencies
- On Wayland: tkinter uses XWayland, which is typically available on GNOME/KDE Wayland sessions
- Window uses `root.attributes('-topmost', True)` for always-on-top
- Window uses `root.attributes('-alpha', 0.85)` for semi-transparency
- Step count updates via callback from recorder's `_record_step()`

### Component 2: Threading Model Change

Current recorder is a **blocking process** — `mouse_listener.join()` + `key_listener.join()` blocks the main thread.

New threading model:
- **Main thread**: Runs tkinter `mainloop()`, manages OSD window
- **Sub-thread 1**: mouse.Listener (existing, already runs in thread)
- **Sub-thread 2**: keyboard.Listener (existing, already runs in thread)
- Replaced `listener.join()` calls with `root.mainloop()`
- Stop button click → calls `recorder.stop()` → `root.destroy()` → `sys.exit(0)`
- Esc key → same as stop button (calls `stop()`)

Key constraint: tkinter operations must happen on the main thread. The listener callbacks (`_on_click`, `_on_key_release`) run on listener threads, so they must use `root.after()` to schedule UI updates on the main thread.

```python
# In listener callback (sub-thread):
def _on_click(self, x, y, button, pressed):
    # ... record step ...
    self.root.after(0, self._update_osd)  # Schedule UI update on main thread

# In main thread:
def _update_osd(self):
    self.step_label.config(text=f"Step: {self.step_counter}")
    # Update elapsed time display
```

### Component 3: Signal Handling

Add SIGTERM/SIGINT handlers to ensure data saves on process interruption:

```python
import signal

def _signal_handler(signum, frame):
    self.stop()  # Flush key buffer, save task.json
    if self.root:
        self.root.destroy()
    sys.exit(0)

signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)
```

This ensures:
- Ctrl+C (SIGINT) → save data, clean exit
- Process kill (SIGTERM) → save data, clean exit
- SIGKILL cannot be caught (OS-level), but SIGTERM is the standard graceful termination signal

### Component 4: Status File

Write `.recording` status file when recording starts, update on each step, delete when recording ends:

```json
{
  "task_name": "谷歌搜索天气",
  "pid": 12345,
  "started": "2026-06-16T10:00:00Z",
  "display_server": "wayland",
  "steps_so_far": 5
}
```

- File location: `tasks/<task-name>/.recording`
- Created when `Recorder.start()` is called
- Updated (`steps_so_far`) each time `_record_step()` adds a step
- Deleted when `Recorder.stop()` completes successfully
- Residual detection: if `.recording` exists but PID is not running, warn user about incomplete recording

This enables `/desktop-automator status` command to query recording state.

### Component 5: Data Save Guarantee

Current behavior: `_save_task()` only called once at end of recording. If process is killed before `stop()`, no data is saved.

New behavior:
- `_save_task()` is always called via `stop()`, which is triggered by:
  - Esc key press (keyboard listener)
  - OSD stop button click (tkinter main thread)
  - SIGTERM/SIGINT signal handler
- Signal handler runs `stop()` synchronously before `sys.exit(0)`
- This provides 3 reliable stop paths, covering all normal termination scenarios
- Only SIGKILL (uncatchable) could still cause data loss, but SIGKILL is rare and typically indicates system-level issues

### Component 6: New SKILL.md Commands

```
/desktop-automator status
```
- Check for `.recording` status file in tasks directory
- If found and PID is alive: display task name, step count, elapsed time
- If found but PID is dead: warn about incomplete recording, suggest cleanup
- If not found: display "No recording in progress"

## File Structure

```
desktop-automator/
├── lib/
│   └── osd_window.py          # NEW: tkinter OSD floating window
│   └── recording_status.py    # NEW: .recording status file management
├── scripts/
│   ├── recorder.py            # REWRITE: tkinter mainloop, signal handling, OSD integration
├── tests/
│   ├── test_osd_window.py     # NEW: OSD window creation, update, destroy
│   ├── test_recording_status.py  # NEW: status file create/update/delete/residual detection
│   ├── test_recorder.py       # REWRITE: add signal handling tests, OSD integration tests
├── SKILL.md                   # UPDATE: add status command, update record command description
```

## Dependencies

No new pip dependencies (tkinter is Python built-in).

System dependency consideration:
- tkinter requires `python3-tk` package on some Linux distros
- On Ubuntu/Debian: `sudo apt-get install python3-tk`
- On Wayland: tkinter uses XWayland (usually available)

## Performance Impact

- OSD window: ~2MB memory (tkinter), negligible CPU (updates only on events)
- Status file: ~0.1ms per step update (JSON write to disk)
- Signal handling: zero overhead (only triggered on termination)

## Known Limitations

1. **tkinter on pure Wayland**: Requires XWayland. On systems without XWayland (rare), OSD will not display. Recorder will still work (just without OSD).
2. **SIGKILL uncatchable**: No solution exists. Only mitigation is frequent status file updates so users can see partial state.
3. **tkinter styling**: Limited visual customization compared to GTK. The OSD will look functional but not as polished as a native GNOME widget.
