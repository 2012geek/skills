import tkinter as tk
import time


class OSDWindow:
    """tkinter floating OSD window for V3 recording feedback.

    Displays REC indicator, elapsed time, frame count, and a Stop button.
    No step count — steps are only known after Vision analysis.
    """

    def __init__(self, frame_count=0, start_time=None, stop_callback=None):
        self.frame_count = frame_count
        self.start_time = start_time or time.time()
        self._stop_callback = stop_callback
        self._stopping = False
        self.root = None
        self._frame_label = None
        self._time_label = None
        self._timer_id = None

    def show(self):
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

        # REC indicator + frame count + time
        rec_frame = tk.Frame(self.root, bg="#1a1a2e")
        rec_frame.pack(fill="x", padx=10, pady=(10, 5))

        rec_dot = tk.Label(rec_frame, text="REC", fg="#ff4444", bg="#1a1a2e",
                           font=("Helvetica", 14, "bold"))
        rec_dot.pack(side="left")

        self._frame_label = tk.Label(rec_frame, text=f"Frames: {self.frame_count}",
                                     fg="#ffffff", bg="#1a1a2e",
                                     font=("Helvetica", 12))
        self._frame_label.pack(side="left", padx=(20, 0))

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

    def update_frames(self, count):
        """Update frame count display. Safe to call from any thread."""
        if self._stopping:
            return
        if self.root and self._frame_label:
            self.root.after(0, lambda: self._do_frame_update(count))
        else:
            self.frame_count = count

    def _do_frame_update(self, count):
        self.frame_count = count
        if self._frame_label:
            self._frame_label.config(text=f"Frames: {count}")

    def _tick_timer(self):
        if not self.root:
            return
        elapsed = int(time.time() - self.start_time)
        if self._time_label:
            self._time_label.config(text=self._format_elapsed(elapsed))
        self._timer_id = self.root.after(1000, self._tick_timer)

    def _format_elapsed(self, seconds):
        seconds = max(0, seconds)
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes:02d}:{secs:02d}"

    def _on_stop_click(self):
        self._stopping = True
        if self._timer_id and self.root:
            self.root.after_cancel(self._timer_id)
        if self._stop_callback:
            self._stop_callback()
        if self.root:
            self.root.destroy()
            self.root = None

    def destroy(self):
        if self.root:
            self.root.after(0, self._on_stop_click)
