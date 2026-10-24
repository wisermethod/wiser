"""Small macOS adapters. Importing this module never contacts a window or loads PyObjC."""
import ctypes
import os
import subprocess
import time
from pathlib import Path

from paths import CaptureError


def permissions():
    cg = ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
    ax = ctypes.CDLL('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
    cg.CGPreflightScreenCaptureAccess.argtypes = []
    cg.CGPreflightScreenCaptureAccess.restype = ctypes.c_bool
    ax.AXIsProcessTrusted.argtypes = []
    ax.AXIsProcessTrusted.restype = ctypes.c_bool
    # These probes never ask macOS to show a permission prompt.
    return {"screen_recording": bool(cg.CGPreflightScreenCaptureAccess()),
            "accessibility": bool(ax.AXIsProcessTrusted())}


def parent_process(pid):
    """Executable path and parent pid only; never inspect arguments or environment."""
    lib = ctypes.CDLL('/usr/lib/libproc.dylib')
    lib.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    lib.proc_pidpath.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(4096)
    length = lib.proc_pidpath(pid, buffer, len(buffer))
    result = subprocess.run(['ps', '-o', 'ppid=', '-p', str(pid)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    parent = int(result.stdout.strip()) if result.returncode == 0 else 0
    return (os.fsdecode(buffer.value) if length > 0 else ''), parent


def launching_app():
    pid, seen = os.getppid(), set()
    while pid > 0 and pid not in seen:
        seen.add(pid)
        try:
            executable, parent = parent_process(pid)
        except (OSError, ValueError):
            break
        for component in Path(executable).parts:
            if component.endswith('.app'):
                return component[:-4]
        pid = parent
    return 'unknown'


def window_list(desktop=False):
    """On-screen windows, front to back. desktop=True keeps the menu bar, the Dock and the desktop itself."""
    import Quartz as q
    options = q.kCGWindowListOptionOnScreenOnly | (0 if desktop else q.kCGWindowListExcludeDesktopElements)
    rows = q.CGWindowListCopyWindowInfo(options, q.kCGNullWindowID)
    if rows is None:
        raise CaptureError('window list unavailable; grant Screen Recording and retry')
    result = []
    for row in rows:
        bounds = row.get(q.kCGWindowBounds, {})
        result.append({"owner": str(row.get(q.kCGWindowOwnerName, '')),
                       "id": int(row.get(q.kCGWindowNumber, -1)),
                       "title": str(row.get(q.kCGWindowName, '')),
                       "layer": int(row.get(q.kCGWindowLayer, -1)),
                       "alpha": float(row.get(q.kCGWindowAlpha, 1.0)),
                       "bounds": {key: float(bounds.get(source, 0))
                                  for key, source in (("x", "X"), ("y", "Y"),
                                                      ("width", "Width"), ("height", "Height"))}})
    return result


def display_bounds():
    """Each active display's bounds in global points, as the window list gives window bounds."""
    import Quartz as q
    error, ids, count = q.CGGetActiveDisplayList(16, None, None)
    if error:
        return []
    result = []
    for display in ids[:count]:
        r = q.CGDisplayBounds(display)
        result.append({"x": float(r.origin.x), "y": float(r.origin.y),
                       "width": float(r.size.width), "height": float(r.size.height)})
    return result


def cursor_level():
    """The window level of the pointer's own image, which the window server lists as a window under the pointer."""
    import Quartz as q
    return int(q.CGWindowLevelForKey(q.kCGCursorWindowLevelKey))


def ready():
    """Load the frameworks the event adapters use, so no import sits between a check and its event."""
    import AppKit  # noqa: F401
    import Foundation  # noqa: F401
    import Quartz  # noqa: F401


def workspace():
    """The shared workspace with its pending notifications delivered. A command never runs its main loop, so without
    this pass the front app and the running list stay as the process first read them, measured on macOS 26."""
    from AppKit import NSWorkspace
    from Foundation import NSDate, NSDefaultRunLoopMode, NSRunLoop
    NSRunLoop.currentRunLoop().runMode_beforeDate_(NSDefaultRunLoopMode, NSDate.date())
    return NSWorkspace.sharedWorkspace()


def activate(app):
    from AppKit import NSApplicationActivateIgnoringOtherApps
    for running in workspace().runningApplications():
        if str(running.localizedName()) == app:
            if running.activateWithOptions_(NSApplicationActivateIgnoringOtherApps):
                return
    raise CaptureError('app could not be activated; open the named app and retry')


def frontmost():
    running = workspace().frontmostApplication()
    return str(running.localizedName()) if running else None


def osascript(script, arguments):
    result = subprocess.run(['osascript', '-e', script, '--'] + list(arguments),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise CaptureError('System Events sizing failed; grant Accessibility and Automation to the launching app and retry')
    return result.stdout.decode('utf-8').strip()


def app_pid(app):
    for running in workspace().runningApplications():
        if str(running.localizedName()) == app:
            return int(running.processIdentifier())
    return None


def _post(event, pid):
    import Quartz as q
    q.CGEventSetFlags(event, 0)
    if pid is None:
        q.CGEventPost(q.kCGHIDEventTap, event)
    else:
        # Delivered to that app alone, whatever window is now on top.
        q.CGEventPostToPid(pid, event)


def mouse(kind, x, y, pid=None):
    import Quartz as q
    types = {'move': q.kCGEventMouseMoved, 'down': q.kCGEventLeftMouseDown, 'up': q.kCGEventLeftMouseUp}
    source = q.CGEventSourceCreate(q.kCGEventSourceStateHIDSystemState)
    event = q.CGEventCreateMouseEvent(source, types[kind], (x, y), q.kCGMouseButtonLeft)
    if event is None:
        raise CaptureError('mouse event could not be created; check Accessibility and retry')
    _post(event, pid)


def keyboard(code, down, pid=None):
    import Quartz as q
    source = q.CGEventSourceCreate(q.kCGEventSourceStateHIDSystemState)
    event = q.CGEventCreateKeyboardEvent(source, code, down)
    if event is None:
        raise CaptureError('keyboard event could not be created; check Accessibility and retry')
    _post(event, pid)


def capture(arguments):
    result = subprocess.run(['screencapture'] + list(arguments), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise CaptureError('screencapture failed; check Screen Recording, the window and the destination, then retry')


def pause(seconds):
    time.sleep(seconds)
