import tkinter as tk
import time


class OSDWindow:
    """tkinter floating OSD window for recording feedback.

    Displays recording state (REC indicator), step count, elapsed time,
    and a Stop Recording button. Window is always-on-top, semi-transparent,
    and positioned at the top-right corner of the screen.

    All tkinter operations must happen on the main thread. Listener callbacks
    from pynput (which run on sub-threads) must use root.after() to schedule
    UI updates on the main thread.
    """

    def __init__(self, step_count=0, start_time=None, stop_callback=None):
        self.step_count = step_count
        self.start_time = start_time or time.time()
        self._stop_callback = stop_callback
        self.root = None
        self._step_label = None
        self._time_label = None
        self._timer_id = None

    def show(self):
        """Create and show the OSD window. Must be called on the main thread."""
        self.root = tk.Tk()
        self.root.title("Desktop Automator")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.85)

        self.root.update_idletasks()
        screen_w = self.root.winfo_screenwidth()
        win_w = 280
        win_h = 90
        x_pos = screen_w - win_w - 20
        y_pos = 20
        self.root.geometry(f"{win_w}x{win_h}+{x_pos}+{y_pos}")

        self.root.configure(bg="#1a1a2e")

        # REC indicator
        rec_frame = tk.Frame(self.root, bg="#1a1a2e")
        rec_frame.pack(fill="x", padx=10, pady=(10, 5))

        rec_dot = tk.Label(rec_frame, text="REC", fg="#ff4444", bg="#1a1a2e",
                           font=("Helvetica", 14, "bold"))
        rec_dot.pack(side="left")

        self._step_label = tk.Label(rec_frame, text=f"Step: {self.step_count}",
                                    fg="#ffffff", bg="#1a1a2e",
                                    font=("Helvetica", 12))
        self._step_label.pack(side="left", padx=(20, 0))

        self._time_label = tk.Label(rec_frame, text=self._format_elapsed(0),
                                    fg="#aaaaaa", bg="#1a1a2e",
                                    font=("Helvetica", 12))
        self._time_label.pack(side="right")

        # Stop button
        stop_btn = tk.Button(self.root, text="Stop Recording",
                             command=self._on_stop_click,
                             bg="#e74c3c", fg="white",
                             font=("Helvetica", 11, "bold"),
                             relief="flat", cursor="hand2")
        stop_btn.pack(fill="x", padx=10, pady=(5, 10))

        self._tick_timer()

        self.root.protocol("WM_DELETE_WINDOW", self._on_stop_click)
        self.root.mainloop()

    def update_steps(self, count):
        """Update step count display. Safe to call from any thread."""
        self.step_count = count
        if self.root and self._step_label:
            self.root.after(0, self._refresh_step_label)

    def _refresh_step_label(self):
        """Refresh step label on the main thread."""
        if self._step_label:
            self._step_label.config(text=f"Step: {self.step_count}")

    def _tick_timer(self):
        """Update elapsed time display every second."""
        if not self.root:
            return
        elapsed = int(time.time() - self.start_time)
        if self._time_label:
            self._time_label.config(text=self._format_elapsed(elapsed))
        self._timer_id = self.root.after(1000, self._tick_timer)

    def _format_elapsed(self, seconds):
        """Format elapsed seconds as MM:SS."""
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes:02d}:{secs:02d}"

    def _on_stop_click(self):
        """Handle stop button click or window close."""
        if self._timer_id and self.root:
            self.root.after_cancel(self._timer_id)
        if self._stop_callback:
            self._stop_callback()
        if self.root:
            self.root.destroy()
            self.root = None

    def destroy(self):
        """Destroy the window from external code."""
        if self.root:
            self.root.after(0, self._on_stop_click)
