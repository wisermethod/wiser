"""Offline command tests. Every native boundary is denied unless explicitly stubbed."""
import runpy as _runpy
from pathlib import Path as _IsolationPath
_runpy.run_path(str(_IsolationPath(__file__).parent / '../../lib/tests/isolated_home.py'))
import contextlib
import ctypes
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch, call
from PIL import Image, ImageDraw
from support import TOOL, temporary
import capture
import desktop
import install
import native
from paths import CaptureError


def window(wid=11, owner='Sample', layer=0, width=200, height=100, x=100, y=50):
    return {'id': wid, 'owner': owner, 'layer': layer, 'title': 'Synthetic window',
            'bounds': dict(x=x, y=y, width=width, height=height)}


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(sys, 'platform', 'darwin'))
        # An unexpected screen/NSWorkspace/subprocess operation fails the test.
        self.adapters = {}
        for name in ('permissions', 'launching_app', 'parent_process', 'window_list', 'activate',
                     'frontmost', 'osascript', 'mouse', 'keyboard', 'capture', 'pause', 'app_pid', 'display_bounds',
                     'window_levels'):
            self.adapters[name] = self.stack.enter_context(patch.object(native, name, side_effect=AssertionError('unstubbed native adapter')))
        for name, result in (('permissions', {'screen_recording': True, 'accessibility': True}),
                             ('launching_app', 'Synthetic Host'), ('window_list', [window()]),
                             ('frontmost', 'Sample'), ('activate', None), ('pause', None), ('app_pid', 4242),
                             ('display_bounds', [dict(x=0, y=0, width=2000, height=1200)]),
                             ('window_levels', {'cursor': 2147483630, 'dock': 20})):
            self.stub(name, return_value=result)
        self.stack.enter_context(patch.object(install, 'ensure'))
        self.stack.enter_context(patch.object(desktop.shutil, 'which', return_value='/synthetic/bin/program'))

    def stub(self, name, **kwargs):
        mock = self.adapters[name]
        mock.side_effect = None
        mock.reset_mock()
        mock.configure_mock(**kwargs)
        return mock

    def invoke(self, args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = capture.main(args)
        return code, out.getvalue(), err.getvalue()

    def test_check_false_permissions_panes_host_no_install(self):
        self.stack.enter_context(patch.object(desktop, 'media_has_libx264', return_value=True))
        self.stub('permissions', return_value={'screen_recording': False, 'accessibility': False})
        with temporary() as directory, patch.object(capture, 'TOOL', Path(directory)):
            code, out, err = self.invoke(['check'])
            result = json.loads(out)
            self.assertEqual((code, err), (0, ''))
            for name, pane in (('screen_recording', 'Screen Recording'), ('accessibility', 'Accessibility')):
                permission = result['permissions'][name]
                self.assertFalse(permission['granted'])
                self.assertEqual(permission['app'], 'Synthetic Host')
                self.assertEqual(permission['pane'], 'System Settings > Privacy & Security > ' + pane)
            self.assertEqual(result['python'], sys.version.split()[0])
            self.assertEqual(set(result['programs']), {'ffmpeg', 'ffprobe', 'tesseract', 'screencapture', 'ffmpeg_libx264'})
            self.assertTrue(all(result['programs'].values()))
            self.assertEqual(len(result['packages']), 7)
            self.assertTrue(all(not p['installed'] for p in result['packages'].values()))
            self.assertEqual(list(Path(directory).iterdir()), [])
        install.ensure.assert_not_called()
        for name in ('window_list', 'activate', 'osascript', 'mouse', 'keyboard', 'capture'):
            self.adapters[name].assert_not_called()

    def test_permission_ctypes_probes_and_launch_parent_walk(self):
        # Invoke the real probes only against fake framework handles.
        with patch.object(ctypes, 'CDLL', return_value=Mock()) as load:
            handle = load.return_value
            handle.CGPreflightScreenCaptureAccess.return_value = False
            handle.AXIsProcessTrusted.return_value = False
            result = ORIGINAL_PERMISSIONS()
            self.assertEqual(result, {'screen_recording': False, 'accessibility': False})
            self.assertEqual(load.call_count, 2)
            handle.CGPreflightScreenCaptureAccess.assert_called_once_with()
            handle.AXIsProcessTrusted.assert_called_once_with()
        self.stub('parent_process', side_effect=[('/usr/bin/python3', 42), ('/Applications/Sample Host.app/Contents/MacOS/host', 1)])
        with patch.object(native.os, 'getppid', return_value=43):
            self.assertEqual(ORIGINAL_LAUNCHING_APP(), 'Sample Host')
        self.stub('parent_process', return_value=('/usr/bin/process', 0))
        self.assertEqual(ORIGINAL_LAUNCHING_APP(), 'unknown')

    def test_native_adapters_use_only_expected_apis_with_no_modifiers(self):
        quartz = Mock()
        quartz.kCGEventMouseMoved = 5
        quartz.kCGEventLeftMouseDown = 1
        quartz.kCGEventLeftMouseUp = 2
        quartz.kCGMouseButtonLeft = 0
        quartz.kCGHIDEventTap = 0
        quartz.kCGEventSourceStateHIDSystemState = 1
        quartz.CGEventSourceCreate.return_value = 'source'
        quartz.CGEventCreateMouseEvent.return_value = 'mouse'
        quartz.CGEventCreateKeyboardEvent.return_value = 'key'
        with patch.dict(sys.modules, {'Quartz': quartz}):
            for kind, code in (('move', 5), ('down', 1), ('up', 2)):
                ORIGINAL_MOUSE(kind, 14, 22)
                quartz.CGEventCreateMouseEvent.assert_called_with('source', code, (14, 22), 0)
            ORIGINAL_KEYBOARD(53, True)
            ORIGINAL_KEYBOARD(53, False)
        self.assertEqual(quartz.CGEventCreateKeyboardEvent.call_args_list,
                         [call('source', 53, True), call('source', 53, False)])
        self.assertEqual(quartz.CGEventSetFlags.call_args_list,
                         [call('mouse', 0)] * 3 + [call('key', 0)] * 2)
        self.assertEqual(quartz.CGEventPost.call_args_list,
                         [call(0, 'mouse')] * 3 + [call(0, 'key')] * 2)
        with patch.object(native.subprocess, 'run', return_value=Mock(returncode=0, stdout=b'1,2,3,4')) as run:
            self.assertEqual(ORIGINAL_OSASCRIPT('synthetic script', ['Sample', '200', '100']), '1,2,3,4')
            self.assertEqual(run.call_args.args[0], ['osascript', '-e', 'synthetic script', '--', 'Sample', '200', '100'])
            ORIGINAL_CAPTURE(['-x', '-o', '-l11', '/synthetic/out.png'])
            self.assertEqual(run.call_args.args[0], ['screencapture', '-x', '-o', '-l11', '/synthetic/out.png'])

    def test_the_front_app_and_running_list_are_read_after_pending_notifications(self):
        # Without a pass of the run loop a command keeps the front app it first read, which refused a live click.
        order = Mock()
        appkit, foundation = Mock(), Mock()
        foundation.NSRunLoop.currentRunLoop.return_value.runMode_beforeDate_ = order.pump
        shared = appkit.NSWorkspace.sharedWorkspace.return_value
        shared.frontmostApplication = order.front
        order.front.return_value.localizedName.return_value = 'Sample'
        running = Mock()
        running.localizedName.return_value = 'Sample'
        running.processIdentifier.return_value = 4242
        shared.runningApplications = order.running
        order.running.return_value = [running]
        with patch.dict(sys.modules, {'AppKit': appkit, 'Foundation': foundation}):
            self.assertEqual(ORIGINAL_FRONTMOST(), 'Sample')
            self.assertEqual(ORIGINAL_APP_PID('Sample'), 4242)
        self.assertEqual([c[0] for c in order.mock_calls if c[0] in ('pump', 'front', 'running')],
                         ['pump', 'front', 'pump', 'running'])

    def test_check_reads_pins_from_venv_only(self):
        with temporary() as directory:
            tool = Path(directory)
            location = tool / '.venv' / ('lib/python%d.%d/site-packages' % sys.version_info[:2])
            dist = location / 'pillow-11.3.0.dist-info'
            dist.mkdir(parents=True)
            (dist / 'METADATA').write_text('Metadata-Version: 2.1\nName: Pillow\nVersion: 11.3.0\n')
            result = desktop.package_status(tool)
            self.assertTrue(result['pillow']['installed'])
            self.assertFalse(result['pyobjc-core']['installed'])

    def test_windows_permission_exact_app_and_largest_layer_zero(self):
        self.stub('permissions', return_value={'screen_recording': False, 'accessibility': True})
        code, out, err = self.invoke(['windows', '--app', 'Sample'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('Screen Recording', err)
        self.adapters['window_list'].assert_not_called()
        self.stub('permissions', return_value={'screen_recording': True, 'accessibility': True})
        self.stub('window_list', return_value=[window(), window(12, width=300), window(13, layer=1, width=900),
                                               window(14, owner='Sample Other', width=999)])
        code, out, err = self.invoke(['windows', '--app', 'Sample'])
        self.assertEqual((code, err), (0, ''))
        result = json.loads(out)
        self.assertEqual(result['main'], 12)
        self.assertEqual([row['id'] for row in result['windows']], [11, 12, 13])
        self.assertEqual(desktop.main_window('Sample')['id'], 12)

    def test_size_readback_mismatch_and_safe_script_arguments(self):
        script = self.stub('osascript', return_value='100,50,199,100')
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('bounds differ', err)
        self.stub('osascript', return_value='-20,30,200,100')
        self.stub('window_list', return_value=[window(x=-20, y=30)])
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100', '--x', '-20', '--y', '30'])
        self.assertEqual((code, err), (0, ''))
        self.assertEqual(json.loads(out)['bounds'], dict(x=-20, y=30, width=200, height=100))
        self.assertNotIn('id', json.loads(out))
        self.assertEqual(script.call_args.args[1], ['Sample', '200', '100', '-20', '30'])
        self.assertNotIn('Sample', script.call_args.args[0])
        self.assertIn('position of front window', script.call_args.args[0])

    def test_size_refuses_when_the_sized_window_is_not_the_main_window(self):
        # System Events sized a small front window; the app's largest window, which later steps use, is elsewhere.
        self.stub('osascript', return_value='100,50,200,100')
        self.stub('window_list', return_value=[window(wid=11), window(wid=12, width=900, height=600, x=0, y=0)])
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('not the app', err)

    def test_size_and_still_bring_a_window_on_another_space_forward_first(self):
        self.stub('osascript', return_value='100,50,200,100')
        # No window on screen until the app is activated, as when it is on another desktop Space.
        self.stub('window_list', return_value=[])
        self.stub('activate', side_effect=lambda app: self.stub('window_list', return_value=[window()]))
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100'])
        self.assertEqual((code, err), (0, ''))
        self.adapters['activate'].assert_called_with('Sample')
        with temporary() as directory:
            self.stub('window_list', return_value=[])
            self.stub('activate', side_effect=lambda app: self.stub('window_list', return_value=[window()]))
            capture_mock = self.stub('capture', side_effect=lambda args: Path(args[-1]).write_bytes(b'synthetic'))
            code, out, err = self.invoke(['still', '--app', 'Sample', '--output', str(Path(directory) / 'still.png')])
            self.assertEqual((code, err), (0, ''))
            capture_mock.assert_called_once()
        # An app whose window never comes on screen is refused by name, before any capture.
        self.stub('window_list', return_value=[])
        self.stub('activate', return_value=None)
        capture_mock.reset_mock()
        with temporary() as directory:
            code, out, err = self.invoke(['still', '--app', 'Sample', '--output', str(Path(directory) / 'none.png')])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('window on screen', err)
        capture_mock.assert_not_called()

    def test_size_installs_and_needs_both_permissions_before_touching_the_window(self):
        script = self.stub('osascript', return_value='100,50,200,100')
        install.ensure.side_effect = CaptureError('packages missing; retry with --install')
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('packages missing', err)
        script.assert_not_called()
        install.ensure.side_effect = None
        self.stub('permissions', return_value={'screen_recording': False, 'accessibility': True})
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('Screen Recording', err)
        script.assert_not_called()
        self.stub('permissions', return_value={'screen_recording': True, 'accessibility': True})
        code, out, err = self.invoke(['size', '--app', 'Sample', '--width', '200', '--height', '100', '--install'])
        self.assertEqual((code, err), (0, ''))

    def test_a_key_other_than_escape_is_refused_when_a_dialog_is_in_front(self):
        keyboard = self.stub('keyboard')
        dialog = window(wid=12, width=80, height=40, x=150, y=80)
        self.stub('window_list', return_value=[dialog, window(wid=11)])
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'return'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('in front of the selected one', err)
        keyboard.assert_not_called()
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'escape'])
        self.assertEqual((code, err), (0, ''))
        self.assertFalse(json.loads(out)['selected_window_in_front'])
        self.assertEqual([c.args[1] for c in keyboard.call_args_list], [True, False])

    def test_a_release_is_never_posted_at_large_when_the_app_has_gone(self):
        mouse = self.stub('mouse')
        self.stub('app_pid', return_value=None)
        def flip(kind, x, y, pid=None):
            if kind == 'down':
                self.stub('frontmost', return_value='Other')
        mouse.side_effect = flip
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('quit', err)
        self.assertEqual([c.args[0] for c in mouse.call_args_list], ['move', 'down'])

    def test_a_key_release_still_goes_out_when_the_app_has_gone(self):
        keyboard = self.stub('keyboard')
        self.stub('app_pid', return_value=None)
        def flip(code, down, pid=None):
            if down:
                self.stub('frontmost', return_value='Other')
        keyboard.side_effect = flip
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'return'])
        self.assertEqual((code, out), (1, ''))
        self.assertEqual([(c.args[1], c.kwargs.get('pid')) for c in keyboard.call_args_list], [(True, None), (False, None)])

    def test_an_alert_or_menu_of_the_app_at_any_level_refuses_return(self):
        keyboard = self.stub('keyboard')
        for layer in (8, 101):
            panel = window(wid=30, layer=layer, width=60, height=30, x=160, y=90)
            self.stub('window_list', return_value=[panel, window(wid=11)])
            code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'return'])
            self.assertEqual((code, out), (1, ''), layer)
            self.assertIn('in front of the selected one', err)
        keyboard.assert_not_called()
        # The app's menu bar icon overlaps no window, and a transparent overlay is not in front.
        icon = window(wid=31, layer=25, width=22, height=22, x=900, y=0)
        overlay = dict(window(wid=32, layer=0, width=200, height=100), alpha=0.0)
        self.stub('window_list', return_value=[icon, overlay, window(wid=11)])
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'return'])
        self.assertEqual((code, err), (0, ''))
        self.assertTrue(json.loads(out)['selected_window_in_front'])

    def test_focus_lost_after_move_posts_no_press(self):
        mouse = self.stub('mouse')
        def flip(kind, x, y):
            if kind == 'move':
                self.stub('frontmost', return_value='Other')
        mouse.side_effect = flip
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('frontmost', err)
        self.assertEqual([c.args[0] for c in mouse.call_args_list], ['move'])

    def test_focus_lost_after_press_still_releases_the_button(self):
        mouse = self.stub('mouse')
        def flip(kind, x, y, pid=None):
            if kind == 'down':
                self.stub('frontmost', return_value='Other')
        mouse.side_effect = flip
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        self.assertEqual([c.args[0] for c in mouse.call_args_list], ['move', 'down', 'up'])
        # The release goes to the app itself, never to whatever now holds the point.
        self.assertEqual(mouse.call_args_list[-1].kwargs.get('pid'), 4242)
        self.assertNotIn('pid', mouse.call_args_list[1].kwargs)

    def test_interrupt_while_pressed_still_releases_to_the_app(self):
        mouse = self.stub('mouse')
        def pause(seconds):
            if seconds == 0.06:
                raise KeyboardInterrupt()
        self.stub('pause', side_effect=pause)
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        self.assertEqual([c.args[0] for c in mouse.call_args_list], ['move', 'down', 'up'])
        self.assertEqual(mouse.call_args_list[-1].kwargs.get('pid'), 4242)

    def test_the_menu_bar_over_the_point_refuses_the_click(self):
        mouse = self.stub('mouse')
        menu_bar = window(wid=1, owner='Window Server', layer=24, x=0, y=0, width=2000, height=24)
        app = window(x=100, y=0)
        # Choosing the app's window uses the list without desktop elements; the hit test, the list with them.
        self.stub('window_list', side_effect=lambda desktop=False: [menu_bar, app] if desktop else [app])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '2'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('covers that point', err)
        mouse.assert_not_called()
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '40'])
        self.assertEqual((code, err), (0, ''))

    def test_the_pointers_own_image_does_not_cover_the_point_it_moved_to(self):
        mouse = self.stub('mouse')
        pointer = window(wid=6, owner='Window Server', layer=2147483630, x=105, y=65, width=35, height=50)
        self.stub('window_list', return_value=[pointer, window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, err), (0, ''))
        self.assertEqual([c.args[0] for c in mouse.call_args_list], ['move', 'down', 'up'])
        # The same small window at any other level still covers the point.
        mouse.reset_mock()
        self.stub('window_list', return_value=[dict(pointer, layer=25), window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        mouse.assert_not_called()

    def test_the_docks_display_sized_overlay_does_not_cover_the_window(self):
        mouse = self.stub('mouse')
        overlay = window(wid=9, owner='Dock', layer=20, x=0, y=0, width=2000, height=1200)
        self.stub('window_list', return_value=[overlay, window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, err), (0, ''))
        self.assertEqual([c.args[0] for c in mouse.call_args_list], ['move', 'down', 'up'])
        # The Dock's own bar, smaller than the display, still covers what is under it.
        mouse.reset_mock()
        bar = window(wid=9, owner='Dock', layer=20, x=0, y=1100, width=2000, height=100)
        self.stub('window_list', return_value=[bar, window(y=1000, height=200)])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '150'])
        self.assertEqual((code, out), (1, ''))
        mouse.assert_not_called()
        # A Dock window the size of the display at another level, as Mission Control may draw, still covers the point.
        self.stub('window_list', return_value=[dict(overlay, layer=101), window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        mouse.assert_not_called()
        # Another app's window the size of the display still covers the point.
        self.stub('window_list', return_value=[overlay, window()])
        mouse.reset_mock()
        self.stub('window_list', return_value=[dict(overlay, owner='Other App'), window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '20'])
        self.assertEqual((code, out), (1, ''))
        mouse.assert_not_called()

    def test_a_window_over_the_point_refuses_the_click(self):
        mouse = self.stub('mouse')
        # The Dock, front-most in the window server's order, covers the bottom of the app's window.
        self.stub('window_list', return_value=[window(wid=99, owner='Dock', layer=20, x=0, y=130, width=2000, height=40),
                                               window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '90'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('covers that point', err)
        mouse.assert_not_called()
        # A transparent window over the point does not count as covering it.
        self.stub('window_list', return_value=[dict(window(wid=98, owner='Overlay', layer=25, x=0, y=0, width=2000, height=2000), alpha=0.0),
                                               window()])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10', '--y', '90'])
        self.assertEqual((code, err), (0, ''))

    def test_key_focus_lost_after_press_releases_and_refuses(self):
        keyboard = self.stub('keyboard')
        def flip(code, down, pid=None):
            if down:
                self.stub('frontmost', return_value='Other')
        keyboard.side_effect = flip
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'escape'])
        self.assertEqual((code, out), (1, ''))
        self.assertEqual([c.args[1] for c in keyboard.call_args_list], [True, False])
        self.assertEqual(keyboard.call_args_list[-1].kwargs.get('pid'), 4242)

    def test_run_refuses_when_the_main_window_changes(self):
        mouse = self.stub('mouse')
        # The app's main window changes once the first click has been released.
        def after(kind, x, y, pid=None):
            if kind == 'up':
                self.stub('window_list', return_value=[window(wid=12, width=300)])
        mouse.side_effect = after
        with temporary() as directory:
            root = Path(directory)
            recipe = root / 'recipe.json'
            recipe.write_text(json.dumps({'app': 'Sample', 'steps': [{'click': [10, 20]}, {'click': [10, 20]}]}))
            code, out, err = self.invoke(['run', '--recipe', str(recipe), '--output', str(root / 'run')])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('main window changed', err)
            receipt = json.loads((root / 'run' / 'run.json').read_text())
            self.assertEqual([s['status'] for s in receipt['steps']], ['done', 'refused'])

    def test_click_move_outside_fresh_bounds_and_frontmost(self):
        mouse = self.stub('mouse')
        for command in ('click', 'move'):
            for x, y in ((200, 20), (10, 100), (-1, 0), (0, -1)):
                code, out, err = self.invoke([command, '--app', 'Sample', '--x', str(x), '--y', str(y)])
                self.assertEqual((code, out), (1, ''))
                self.assertTrue(err)
            mouse.assert_not_called()
            # The old rectangle would admit x=150. Only the rectangle read AFTER activation excludes it.
            self.stub('window_list', return_value=[window(width=200)])
            self.stub('activate', side_effect=lambda app: self.stub('window_list', return_value=[window(width=100)]))
            code, out, err = self.invoke([command, '--app', 'Sample', '--x', '150', '--y', '20'])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('outside', err)
            mouse.assert_not_called()
            self.stub('activate')
            self.stub('frontmost', return_value='Other')
            code, out, err = self.invoke([command, '--app', 'Sample', '--x', '10', '--y', '20'])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('frontmost', err)
            mouse.assert_not_called()
            # Focus lost during the rectangle read is also refused.
            self.stub('frontmost', side_effect=['Sample', 'Other'])
            code, out, err = self.invoke([command, '--app', 'Sample', '--x', '10', '--y', '20'])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('frontmost', err)
            mouse.assert_not_called()
            self.stub('frontmost', return_value='Sample')

    def test_click_move_inside_exact_events_point_and_timings(self):
        mouse = self.stub('mouse')
        self.stub('window_list', return_value=[window(x=-100, y=70)])
        code, out, err = self.invoke(['click', '--app', 'Sample', '--x', '10.5', '--y', '20'])
        self.assertEqual((code, err), (0, ''))
        self.assertEqual(mouse.call_args_list, [call('move', -89.5, 90), call('down', -89.5, 90), call('up', -89.5, 90)])
        self.assertEqual(self.adapters['pause'].call_args_list, [call(0.12), call(0.06)])
        self.assertNotIn('Synthetic window', out)
        mouse.reset_mock()
        code, out, err = self.invoke(['move', '--app', 'Sample', '--x', '0', '--y', '0'])
        self.assertEqual((code, err), (0, ''))
        mouse.assert_called_once_with('move', -100, 70)

    def test_park_moves_only_sixty_left_at_middle(self):
        mouse = self.stub('mouse')
        code, out, err = self.invoke(['move', '--app', 'Sample', '--park'])
        self.assertEqual((code, err), (0, ''))
        mouse.assert_called_once_with('move', 40, 100)
        self.adapters['keyboard'].assert_not_called()

    def test_key_closed_set_down_up_and_frontmost(self):
        keyboard = self.stub('keyboard')
        for name in desktop.KEYS:
            code, out, err = self.invoke(['key', '--app', 'Sample', '--key', name])
            self.assertEqual((code, err), (0, ''))
            self.assertEqual(keyboard.call_args_list[-2:], [call(desktop.KEYS[name], True), call(desktop.KEYS[name], False)])
        keyboard.reset_mock()
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'typing'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('--key', err)
        keyboard.assert_not_called()
        self.stub('frontmost', return_value='Other')
        code, out, err = self.invoke(['key', '--app', 'Sample', '--key', 'escape'])
        self.assertEqual((code, out), (1, ''))
        self.assertIn('frontmost', err)
        keyboard.assert_not_called()

    def test_still_record_exact_arguments_existing_output_and_duration(self):
        with temporary() as directory:
            root = Path(directory)
            capture_mock = self.stub('capture', side_effect=lambda args: Path(args[-1]).write_bytes(b'synthetic'))
            for command, suffix, extra, flags in (
                ('still', '.png', [], ['-x', '-o', '-l11']),
                ('record', '.mov', ['--seconds', '2.5'], ['-x', '-v', '-C', '-o', '-l11', '-V2.5'])):
                output = root / ('out' + suffix)
                args = [command, '--app', 'Sample', '--output', str(output)] + extra
                code, out, err = self.invoke(args)
                self.assertEqual((code, err), (0, ''))
                self.assertEqual(capture_mock.call_args, call(flags + [str(output.resolve())]))
                capture_mock.reset_mock()
                code, out, err = self.invoke(args)
                self.assertEqual((code, out), (1, ''))
                self.assertIn('already exists', err)
                capture_mock.assert_not_called()
            for seconds in ('600.01', '0', '-1', 'nan', 'inf'):
                code, out, err = self.invoke(['record', '--app', 'Sample', '--seconds', seconds, '--output', str(root / 'long.mov')])
                self.assertEqual((code, out), (1, ''))
                self.assertIn('--seconds', err)
            capture_mock.assert_not_called()

    def test_permission_refusals_no_events_or_capture(self):
        self.stub('permissions', return_value={'screen_recording': False, 'accessibility': False})
        with temporary() as directory:
            commands = [['size', '--width', '200', '--height', '100'], ['click', '--x', '1', '--y', '1'],
                        ['move', '--park'], ['key', '--key', 'escape'],
                        ['still', '--output', str(Path(directory) / 'a.png')],
                        ['record', '--seconds', '1', '--output', str(Path(directory) / 'a.mov')]]
            for args in commands:
                code, out, err = self.invoke(args + ['--app', 'Sample'])
                self.assertEqual((code, out), (1, ''))
                self.assertIn('permission', err)
        for name in ('activate', 'window_list', 'osascript', 'mouse', 'keyboard', 'capture'):
            self.adapters[name].assert_not_called()

    def test_run_invalid_recipe_is_validated_before_first_step(self):
        with temporary() as directory:
            root = Path(directory)
            recipe = root / 'recipe.json'
            for bad in ({'unknown': 1}, {'click': [1]}, {'park': False}, {'key': 'type'}, {'wait_ms': 60001},
                        {'wait_ms': True}, {'still': '../bad'}, {'move': [1, float('nan')]}):
                recipe.write_text(json.dumps({'app': 'Sample', 'steps': [{'wait_ms': 0}, {'park': True}, bad]}))
                code, out, err = self.invoke(['run', '--recipe', str(recipe), '--output', str(root / 'run')])
                self.assertEqual((code, out), (1, ''))
                self.assertFalse((root / 'run').exists())
                self.adapters['pause'].assert_not_called()
                self.adapters['activate'].assert_not_called()
                install.ensure.assert_not_called()
            for data in ({'app': 'Sample', 'window': {'width': True, 'height': 100}, 'steps': []},
                         {'app': 'Sample', 'window': {'width': '200', 'height': 100}, 'steps': []},
                         {'app': 'Sample', 'steps': [{'still': 'A'}, {'still': 'a'}]},
                         {'app': 'Sample', 'steps': [], 'extra': True}):
                with self.assertRaises(CaptureError):
                    desktop.validate_recipe(data)
            recipe.write_text('{"app":"Sample","app":"Other","steps":[]}')
            code, out, err = self.invoke(['run', '--recipe', str(recipe), '--output', str(root / 'run')])
            self.assertEqual((code, out), (1, ''))
            self.assertFalse((root / 'run').exists())

    def test_run_third_step_refusal_records_first_two_and_exits_one(self):
        with temporary() as directory:
            root = Path(directory)
            recipe, output = root / 'recipe.json', root / 'run'
            recipe.write_text(json.dumps({'app': 'Sample', 'steps': [{'wait_ms': 0}, {'wait_ms': 1},
                              {'click': [250, 20]}, {'still': 'never'}]}))
            code, out, err = self.invoke(['run', '--recipe', str(recipe), '--output', str(output)])
            self.assertEqual((code, out), (1, ''))
            receipt = json.loads((output / 'run.json').read_text())
            self.assertFalse(receipt['ok'])
            self.assertEqual([s['status'] for s in receipt['steps']], ['done', 'done', 'refused'])
            self.assertEqual([s['kind'] for s in receipt['steps']], ['wait_ms', 'wait_ms', 'click'])
            self.assertEqual(receipt['recipe_sha256'], hashlib.sha256(recipe.read_bytes()).hexdigest())
            self.adapters['mouse'].assert_not_called()
            self.adapters['capture'].assert_not_called()
            self.assertIn('run.json', err)
            self.assertIn('outside the window', receipt['steps'][2]['result']['reason'])
            self.assertIn('step 3, click', err)

    def test_run_window_first_and_still_file_and_pixel_hashes(self):
        self.stub('osascript', return_value='100,50,200,100')
        self.stub('mouse')
        self.stub('keyboard')
        self.stub('capture', side_effect=lambda args: Image.new('RGB', (20, 10), 'white').save(args[-1]))
        with temporary() as directory:
            root = Path(directory)
            recipe, output = root / 'recipe.json', root / 'run'
            recipe.write_text(json.dumps({'app': 'Sample', 'window': {'width': 200, 'height': 100},
                                         'steps': [{'click': [1, 2]}, {'move': [3, 4]}, {'park': True},
                                                   {'key': 'escape'}, {'wait_ms': 1}, {'still': 'first'}]}))
            code, out, err = self.invoke(['run', '--recipe', str(recipe), '--output', str(output)])
            self.assertEqual((code, err), (0, ''))
            receipt_text = (output / 'run.json').read_text()
            receipt = json.loads(receipt_text)
            self.assertEqual([s['kind'] for s in receipt['steps']], ['size', 'click', 'move', 'park', 'key', 'wait_ms', 'still'])
            self.assertTrue(all(s['status'] == 'done' for s in receipt['steps']))
            result = receipt['steps'][-1]['result']
            self.assertEqual(result['file'], 'raw/first.png')
            self.assertEqual(result['sha256'], hashlib.sha256((output / result['file']).read_bytes()).hexdigest())
            with Image.open(output / result['file']) as image:
                expected = hashlib.sha256(repr(image.size).encode() + image.convert('RGBA').tobytes()).hexdigest()
            self.assertEqual(result['pixel_sha256'], expected)
            self.assertNotIn('Synthetic window', receipt_text + out)

    def test_compare_identical_rectangle_sizes_and_missing(self):
        with temporary() as directory:
            root = Path(directory)
            a, b = root / 'a', root / 'b'
            for run in (a, b):
                (run / 'raw').mkdir(parents=True)
                for sid in ('same', 'rect', 'size'):
                    Image.new('RGBA', (30, 20), 'white').save(run / 'raw' / (sid + '.png'))
            # Include alpha-only differences: RGBA.getbbox alone would miss RGB changes with equal alpha.
            image = Image.new('RGBA', (30, 20), 'white')
            ImageDraw.Draw(image).rectangle((4, 6, 10, 9), fill=(255, 255, 255, 0))
            image.save(b / 'raw/rect.png')
            Image.new('RGB', (31, 20), 'white').save(b / 'raw/size.png')
            Image.new('RGB', (1, 1)).save(a / 'raw/left.png')
            Image.new('RGB', (1, 1)).save(b / 'raw/right.png')
            code, out, err = self.invoke(['compare', '--a', str(a), '--b', str(b)])
            self.assertEqual((code, err), (0, ''))
            result = json.loads(out)
            rows = {r['id']: r for r in result['stills']}
            self.assertEqual(rows['same'], {'id': 'same', 'same_size': True, 'identical': True, 'differing_pixels': 0, 'box': None})
            self.assertEqual(rows['rect'], {'id': 'rect', 'same_size': True, 'identical': False, 'differing_pixels': 28, 'box': [4, 6, 11, 10]})
            self.assertFalse(rows['size']['same_size'])
            self.assertIsNone(rows['size']['differing_pixels'])
            self.assertEqual(result['only_a'], ['left'])
            self.assertEqual(result['only_b'], ['right'])
            self.adapters['window_list'].assert_not_called()

    def test_new_commands_closed_flags_and_macos_first(self):
        for help_command in ('help', '--help'):
            code, out, err = self.invoke([help_command, '--unknown=private'])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('--unknown', err)
            self.assertNotIn('private', err)
        for command in desktop.FLAGS:
            install.ensure.reset_mock()
            code, out, err = self.invoke([command, '--not-a-flag=private'])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('--not-a-flag', err)
            self.assertNotIn('private', err)
            install.ensure.assert_not_called()
            all_flags = set().union(*desktop.FLAGS.values())
            for flag in all_flags - desktop.FLAGS[command]:
                code, out, err = self.invoke([command, flag])
                self.assertEqual((code, out), (1, ''))
                self.assertIn('unknown option ' + flag, err)
            with patch.object(sys, 'platform', 'linux'):
                code, out, err = self.invoke([command, '--recipe', 'relative'])
            self.assertEqual((code, out), (1, ''))
            self.assertIn('macOS', err)
        for command in desktop.FLAGS:
            for flag in desktop.FLAGS[command]:
                self.assertIn(flag, capture.USAGE)
        for args in (['move', '--app', 'Sample', '--park', '--x', '1', '--y', '1'],
                     ['move', '--app', 'Sample', '--x', '1'],
                     ['size', '--app', 'Sample', '--width', '200', '--height', '100', '--x', '1'],
                     ['click', '--app', 'Sample', '--x', 'nan', '--y', '0'],
                     ['check', '--install'], ['windows', '--app', 'Sample', '--key', 'escape']):
            with self.assertRaises(CaptureError):
                capture.parse(args)


# Save only function objects; these originals are called with their underlying OS boundaries replaced.
ORIGINAL_MOUSE = native.mouse
ORIGINAL_KEYBOARD = native.keyboard
ORIGINAL_OSASCRIPT = native.osascript
ORIGINAL_CAPTURE = native.capture
ORIGINAL_PERMISSIONS = native.permissions
ORIGINAL_LAUNCHING_APP = native.launching_app
ORIGINAL_FRONTMOST = native.frontmost
ORIGINAL_APP_PID = native.app_pid

if __name__ == '__main__':
    unittest.main()
