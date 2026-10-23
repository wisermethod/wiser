"""Capture and drive commands, with stdlib-only validation above the dependency gate."""
import hashlib
import importlib.metadata
import json
import math
import os
import re
import shutil
import sys
from pathlib import Path

import native
from paths import CaptureError, screen

KEYS = {'escape': 53, 'return': 36, 'tab': 48, 'space': 49,
        'up': 126, 'down': 125, 'left': 123, 'right': 124}
FLAGS = {
    'check': set(), 'windows': {'--app'},
    'size': {'--app', '--width', '--height', '--x', '--y'},
    'click': {'--app', '--x', '--y'}, 'move': {'--app', '--x', '--y', '--park'},
    'key': {'--app', '--key'}, 'still': {'--app', '--output'},
    'record': {'--app', '--seconds', '--output'},
    'run': {'--recipe', '--output'}, 'compare': {'--a', '--b'},
}
for _command in ('windows', 'click', 'move', 'key', 'still', 'record', 'run', 'compare'):
    FLAGS[_command].add('--install')

SID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z')
SIZING = '''on run argv
    set appName to item 1 of argv
    tell application "System Events"
        tell process appName
            set size of front window to {item 2 of argv as integer, item 3 of argv as integer}
            if (count of argv) is 5 then
                set position of front window to {item 4 of argv as integer, item 5 of argv as integer}
            end if
            delay 0.2
            set p to position of front window
            set s to size of front window
            return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)
        end tell
    end tell
end run'''


def macos():
    if sys.platform != 'darwin':
        raise CaptureError('macOS is required for this command; run it on macOS')


def number(value, label, minimum=None, maximum=None, integer=False):
    try:
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            raise ValueError()
        result = float(value)
        if not math.isfinite(result) or (integer and result != int(result)):
            raise ValueError()
        if minimum is not None and result < minimum or maximum is not None and result > maximum:
            raise ValueError()
        return int(result) if integer else result
    except (ValueError, OverflowError):
        raise CaptureError(label + ' has an invalid numeric value; consult help for its bounds') from None


def app_name(value):
    if not isinstance(value, str) or not value.strip() or any(ord(c) < 32 for c in value):
        raise CaptureError('--app must be a nonblank app name without control characters; consult help')
    return value


def window_spec(value):
    if not isinstance(value, dict) or set(value) - {'width', 'height', 'x', 'y'} or not {'width', 'height'} <= set(value):
        raise CaptureError('window needs width and height, with optional x and y only; consult help')
    if ('x' in value) != ('y' in value):
        raise CaptureError('window x and y must be given together; consult help')
    return {k: number(v, 'window ' + k, minimum=1 if k in ('width', 'height') else None, integer=True)
            for k, v in value.items()}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CaptureError('JSON repeats a key; give each key once and retry')
        result[key] = value
    return result


def validate_recipe(data):
    if not isinstance(data, dict) or set(data) - {'app', 'window', 'steps'} or not {'app', 'steps'} <= set(data):
        raise CaptureError('recipe needs app and steps, with optional window only; consult help')
    app_name(data['app'])
    if 'window' in data:
        window_spec(data['window'])
        if any(type(v) not in (int, float) for v in data['window'].values()):
            raise CaptureError('recipe window values must be numbers; consult help')
    if not isinstance(data['steps'], list):
        raise CaptureError('recipe steps must be a list; consult help')
    seen = set()
    for step in data['steps']:
        validate_step(step, seen)
    return data


def validate_step(step, seen):
    if not isinstance(step, dict) or len(step) != 1:
        raise CaptureError('each recipe step must have exactly one known key; consult help')
    kind, value = next(iter(step.items()))
    if kind in ('click', 'move'):
        if not isinstance(value, list) or len(value) != 2 or any(type(n) not in (int, float) for n in value):
            raise CaptureError('recipe click and move need two numbers; consult help')
        for n in value:
            number(n, 'recipe point', minimum=0)
    elif kind == 'park':
        if value is not True:
            raise CaptureError('recipe park must be true; consult help')
    elif kind == 'key':
        if not isinstance(value, str) or value not in KEYS:
            raise CaptureError('unsupported --key; choose escape, return, tab, space, up, down, left or right')
    elif kind == 'wait_ms':
        if type(value) is not int:
            raise CaptureError('recipe wait_ms must be an integer from 0 to 60000; consult help')
        number(value, 'recipe wait_ms', minimum=0, maximum=60000, integer=True)
    elif kind == 'still':
        if not isinstance(value, str) or not SID.fullmatch(value) or value.casefold() in seen:
            raise CaptureError('still id must be unique (case-insensitive), 1 to 80 ASCII letters, digits, hyphens or underscores, starting alphanumeric; consult help')
        seen.add(value.casefold())
    else:
        raise CaptureError('unknown recipe step; use click, move, park, key, wait_ms or still')


def parse(argv, tool):
    command = argv[0]
    macos()  # Every new command refuses other platforms before inspecting values or paths.
    values, index = {}, 1
    while index < len(argv):
        option = argv[index]
        if option not in FLAGS[command] | {'--help'}:
            name = option.split('=', 1)[0] if option.startswith('-') else '(positional argument)'
            raise CaptureError('unknown option ' + name + '; run python3 scripts/capture.py help')
        if option in values:
            raise CaptureError(option + ' was repeated; give it once and consult help')
        if option in ('--help', '--park', '--install'):
            values[option] = True
            index += 1
        else:
            if index + 1 == len(argv) or argv[index + 1].startswith('--'):
                raise CaptureError(option + ' needs a value; consult help')
            values[option] = argv[index + 1]
            index += 2
    if values.get('--help'):
        return None
    required = FLAGS[command] - {'--help', '--install'}
    if command in ('size', 'move'):
        required = required - {'--x', '--y', '--park'}
    for option in sorted(required):
        if option not in values:
            raise CaptureError(option + ' is required; consult help')
    if '--app' in values:
        app_name(values['--app'])
    if command == 'size':
        window_spec({k[2:]: v for k, v in values.items() if k != '--app'})
    if command == 'move':
        if (values.get('--park') and ('--x' in values or '--y' in values)) or (not values.get('--park') and not {'--x', '--y'} <= set(values)):
            raise CaptureError('move needs either --x and --y or --park; consult help')
    for k in ('--x', '--y', '--width', '--height', '--seconds'):
        if k in values:
            values[k] = number(values[k], k, minimum=1 if k in ('--width', '--height') else
                               0 if command != 'size' else None,
                               maximum=600 if k == '--seconds' else None, integer=command == 'size')
    if command == 'record' and values['--seconds'] <= 0:
        raise CaptureError('--seconds must be greater than 0 and at most 600; consult help')
    if command == 'key' and values['--key'] not in KEYS:
        raise CaptureError('unsupported --key; choose escape, return, tab, space, up, down, left or right')
    if '--output' in values:
        values['--output'] = screen(values['--output'], '--output', tool, True)
        extension = {'still': '.png', 'record': '.mov'}.get(command)
        if extension and values['--output'].suffix.lower() != extension:
            raise CaptureError('--output must resolve to ' + extension + '; correct its extension')
    if command == 'run':
        recipe = screen(values['--recipe'], '--recipe', tool)
        if recipe.suffix.lower() != '.json':
            raise CaptureError('--recipe must resolve to JSON; correct its extension')
        try:
            payload = recipe.read_bytes()
            data = json.loads(payload, object_pairs_hook=unique_object)
        except (ValueError, UnicodeError, OSError):
            raise CaptureError('recipe is not readable JSON; correct it and retry') from None
        values['recipe'] = validate_recipe(data)
        values['recipe_sha256'] = hashlib.sha256(payload).hexdigest()
    if command == 'compare':
        for k in ('--a', '--b'):
            values[k] = screen(values[k], k, tool, directory=True)
    return {'command': command, 'values': values}


def package_status(tool):
    # The same pins and the same single site-packages directory install.ready() reads, so check and the run agree.
    from install import required_pins
    site = tool / '.venv' / ('lib/python%d.%d/site-packages' % sys.version_info[:2])
    found = {}
    for dist in importlib.metadata.distributions(path=[str(site)]):
        name = dist.metadata.get('Name')
        if name:
            found.setdefault(re.sub(r'[-_.]+', '-', name).lower(), set()).add(dist.version)
    status = {}
    # The pins ship beside these scripts; the cache is the one in the tool directory the caller runs.
    for name, pin in required_pins(Path(__file__).resolve().parent.parent).items():
        versions = found.get(name, set())
        status[name] = {'required': pin, 'version': ', '.join(sorted(versions)) or None, 'installed': versions == {pin}}
    return status


def media_has_libx264():
    from media import has_libx264
    return has_libx264()


def check(tool):
    granted = native.permissions()
    app = native.launching_app()
    return {'ok': True, 'python': sys.version.split()[0], 'packages': package_status(tool),
            'programs': {**{name: shutil.which(name) is not None
                            for name in ('ffmpeg', 'ffprobe', 'tesseract', 'screencapture')},
                         'ffmpeg_libx264': shutil.which('ffmpeg') is not None and media_has_libx264()},
            'permissions': {key: {'granted': value, **({} if value else
                           {'app': app, 'pane': 'System Settings > Privacy & Security > ' +
                            ('Screen Recording' if key == 'screen_recording' else 'Accessibility')})}
                            for key, value in granted.items()}}


def require(*names):
    granted = native.permissions()
    for name in names:
        if not granted[name]:
            pane = 'Screen Recording' if name == 'screen_recording' else 'Accessibility'
            raise CaptureError(pane + ' permission is required; grant it to ' + native.launching_app() +
                               ' in System Settings > Privacy & Security > ' + pane + ' and retry')


def windows(app):
    require('screen_recording')
    return [{k: row[k] for k in ('id', 'title', 'layer', 'bounds')} for row in native.window_list()
            if row['owner'] == app and row['bounds']['width'] > 0 and row['bounds']['height'] > 0]


def main_window(app):
    rows = [row for row in windows(app) if row['layer'] == 0]
    if not rows:
        raise CaptureError('no on-screen layer-0 window for the named app; open its window and retry')
    return max(rows, key=lambda row: row['bounds']['width'] * row['bounds']['height'])


def geometry(row):
    # Titles are exposed only by the explicit windows inventory, never in action receipts.
    return {k: row[k] for k in ('id', 'bounds')}


def size(app, spec):
    require('accessibility')
    spec = window_spec(spec)
    text = native.osascript(SIZING, [app] + [str(spec[k]) for k in ('width', 'height', 'x', 'y') if k in spec])
    try:
        actual = list(map(int, text.split(',')))
        if len(actual) != 4:
            raise ValueError()
        bounds = dict(zip(('x', 'y', 'width', 'height'), actual))
    except ValueError:
        raise CaptureError('System Events returned invalid bounds; check Accessibility and retry') from None
    if any(bounds[key] != value for key, value in spec.items()):
        raise CaptureError('window bounds differ from the requested size or position; check the app minimum size and retry')
    # System Events sized the app's front window; every later step uses its largest layer-0 window. They must be one.
    rows = [row for row in native.window_list() if row['owner'] == app and row['layer'] == 0
            and row['bounds']['width'] > 0 and row['bounds']['height'] > 0]
    main = max(rows, key=lambda row: row['bounds']['width'] * row['bounds']['height']) if rows else None
    if main is None or any(int(round(main['bounds'][key])) != value for key, value in bounds.items()):
        raise CaptureError('the sized window is not the app\'s main window; close the app\'s other windows and retry')
    return {'bounds': bounds, 'id': main['id']}


def foreground(app):
    require('accessibility', 'screen_recording')
    native.activate(app)
    for _ in range(20):
        if native.frontmost() == app:
            return
        native.pause(0.05)
    raise CaptureError('named app is not frontmost; bring it forward and retry')


def frontmost(app):
    if native.frontmost() != app:
        raise CaptureError('named app is not frontmost; bring it forward and retry')


def same_window(row, expected):
    if expected is not None and row['id'] != expected:
        raise CaptureError('the app\'s main window changed during the recipe; close its other windows and retry in a new directory')


def topmost_at(x, y):
    """The front-most visible window containing a global point, in the window server's front-to-back order."""
    for row in native.window_list(desktop=True):
        b = row['bounds']
        if row.get('alpha', 1.0) > 0 and b['x'] <= x < b['x'] + b['width'] and b['y'] <= y < b['y'] + b['height']:
            return row
    return None


def guard(app, window_id, target=None):
    """Read immediately before each event: the app frontmost, and at a target, its window the one on top there."""
    frontmost(app)
    if target is not None:
        top = topmost_at(*target)
        if top is None or top['id'] != window_id:
            raise CaptureError('another window covers that point, such as the menu bar, the Dock or a notification; '
                               'clear it and retry')


def point(app, x=None, y=None, park=False, expected=None):
    foreground(app)
    native.ready()
    row = main_window(app)  # Fresh rectangle, after activation, just before the event.
    same_window(row, expected)
    bounds = row['bounds']
    if park:
        target = (bounds['x'] - 60, bounds['y'] + bounds['height'] / 2)
    else:
        if not (0 <= x < bounds['width'] and 0 <= y < bounds['height']):
            raise CaptureError('point is outside the window; use coordinates within its current bounds')
        target = (bounds['x'] + x, bounds['y'] + y)
    frontmost(app)
    return target, row['id']


def click(app, x, y, expected=None):
    target, window_id = point(app, x, y, expected=expected)
    guard(app, window_id, target)
    native.mouse('move', *target)
    native.pause(0.12)
    guard(app, window_id, target)
    native.mouse('down', *target)
    released = False
    try:
        native.pause(0.06)
        guard(app, window_id, target)
        native.mouse('up', *target)
        released = True
    finally:
        if not released:
            # A pressed button is always released, even on an interrupt, and to the app itself, never to a window
            # that now covers the point.
            native.mouse('up', *target, pid=native.app_pid(app))
    return {'point': list(target)}


def move(app, x=None, y=None, park=False, expected=None):
    target, window_id = point(app, x, y, park, expected=expected)
    # A parked pointer is outside the window by design, so only the app's focus is read for it.
    guard(app, window_id, None if park else target)
    native.mouse('move', *target)
    return {'point': list(target)}


def key(app, name, expected=None):
    if name not in KEYS:
        raise CaptureError('unsupported --key; choose escape, return, tab, space, up, down, left or right')
    foreground(app)
    native.ready()
    same_window(main_window(app), expected)
    guard(app, None)
    # Down and up back to back. Where focus moved between them, or anything failed, the key is released to the app
    # itself, never left down; focus is read again after.
    native.keyboard(KEYS[name], True)
    released = False
    try:
        if native.frontmost() == app:
            native.keyboard(KEYS[name], False)
            released = True
    finally:
        if not released:
            native.keyboard(KEYS[name], False, pid=native.app_pid(app))
    guard(app, None)
    return {'key': name}


def capture_file(app, output, tool, seconds=None, expected=None):
    # Recheck each recipe destination immediately before its capture.
    output = screen(str(output), '--output', tool, True)
    require('screen_recording')
    row = main_window(app)
    same_window(row, expected)
    if not shutil.which('screencapture'):
        raise CaptureError('missing screencapture; check: command -v screencapture. Make that check pass and retry')
    if seconds is None:
        arguments = ['-x', '-o', '-l%d' % row['id'], str(output)]
    else:
        seconds = number(seconds, '--seconds', minimum=0, maximum=600)
        if seconds <= 0:
            raise CaptureError('--seconds must be greater than 0 and at most 600; consult help')
        # -C keeps the pointer in the recording: a walkthrough shows it, and the redaction is tested with it moving.
        arguments = ['-x', '-v', '-C', '-o', '-l%d' % row['id'], '-V' + format(seconds, 'g'), str(output)]
    try:
        native.capture(arguments)
        if not output.is_file() or output.stat().st_size == 0:
            raise CaptureError('screencapture wrote no file; check Screen Recording and retry')
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return {**geometry(row), 'output': str(output)}


def still_hash(path):
    from PIL import Image
    with Image.open(path) as image:
        rgba = image.convert('RGBA')
        pixels = hashlib.sha256(repr(rgba.size).encode() + rgba.tobytes()).hexdigest()
    return {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'pixel_sha256': pixels}


def run_recipe(values, tool):
    data = values['recipe']
    validate_recipe(data)  # Complete validation must precede mkdir, sizing, waits and all events.
    output = screen(str(values['--output']), '--output', tool, True)
    output.mkdir()
    (output / 'raw').mkdir()
    receipt = {'ok': True, 'recipe_sha256': values['recipe_sha256'], 'steps': []}
    steps = ([{'size': data['window']}] if 'window' in data else []) + data['steps']
    window_id = None  # One window for the whole recipe: the one sized, or the main window at the first step.
    try:
        for step in steps:
            kind, value = next(iter(step.items()))
            row = {'kind': kind, 'status': 'refused', 'result': {'refused': True}}
            receipt['steps'].append(row)
            if kind != 'size' and kind != 'wait_ms' and window_id is None:
                window_id = main_window(data['app'])['id']
            if kind == 'size':
                result = size(data['app'], value)
                window_id = result.pop('id')
            elif kind == 'click':
                result = click(data['app'], *value, expected=window_id)
            elif kind == 'move':
                result = move(data['app'], *value, expected=window_id)
            elif kind == 'park':
                result = move(data['app'], park=True, expected=window_id)
            elif kind == 'key':
                result = key(data['app'], value, expected=window_id)
            elif kind == 'wait_ms':
                native.pause(value / 1000)
                result = {'wait_ms': value}
            else:
                path = output / 'raw' / (value + '.png')
                captured = capture_file(data['app'], path, tool, expected=window_id)
                result = {'id': value, 'file': 'raw/' + path.name, **still_hash(path),
                          'window': {k: captured[k] for k in ('id', 'bounds')}}
            row.update(status='done', result=result)
    except (Exception, KeyboardInterrupt) as error:
        receipt['ok'] = False
        # A CaptureError's message is the tool's own fixed text, never screen text or a term, so it is kept.
        reason = str(error) if isinstance(error, CaptureError) else 'the step failed or was interrupted'
        where = 'before its first step'
        if receipt['steps']:
            receipt['steps'][-1]['result'] = {'refused': True, 'reason': reason}
            where = 'at step %d, %s' % (len(receipt['steps']), receipt['steps'][-1]['kind'])
        raise CaptureError('recipe stopped ' + where + ': ' + reason + '. Inspect run.json, correct the recipe '
                           'or app state, and retry in a new directory') from None
    finally:
        with (output / 'run.json').open('x', encoding='utf-8') as stream:
            json.dump(receipt, stream, indent=2)
            stream.write('\n')
    return {'ok': True, 'output': str(output), 'steps': len(receipt['steps']), 'recipe_sha256': receipt['recipe_sha256']}


def compare(a, b, tool):
    from PIL import Image, ImageChops
    def stills(directory):
        raw = directory / 'raw'
        if not raw.is_dir():
            raise CaptureError('run has no raw directory; choose a capture run directory')
        result = {}
        for path in sorted(raw.glob('*.png')):
            if not SID.fullmatch(path.stem):
                raise CaptureError('run has an invalid still id; choose an unmodified capture run')
            result[path.stem] = screen(str(path), 'run still', tool)
        return result
    aa, bb = stills(a), stills(b)
    rows = []
    for sid in sorted(aa.keys() & bb.keys()):
        with Image.open(aa[sid]) as left, Image.open(bb[sid]) as right:
            row = {'id': sid, 'same_size': left.size == right.size}
            if left.size != right.size:
                row.update(identical=False, differing_pixels=None, box=None,
                           size_a=list(left.size), size_b=list(right.size))
            else:
                delta = ImageChops.difference(left.convert('RGBA'), right.convert('RGBA'))
                channels = delta.split()
                mask = channels[0]
                for channel in channels[1:]:
                    mask = ImageChops.lighter(mask, channel)
                count = sum(mask.histogram()[1:])
                box = mask.getbbox()
                row.update(identical=count == 0, differing_pixels=count, box=list(box) if box else None)
            rows.append(row)
    return {'ok': True, 'stills': rows, 'only_a': sorted(aa.keys() - bb.keys()), 'only_b': sorted(bb.keys() - aa.keys())}


def execute(command, values, tool, argv):
    macos()
    if command == 'check':
        return check(tool)
    # All flags, paths and the complete recipe passed before this dependency gate.
    from install import ensure
    if command != 'size':
        ensure(tool, values.get('--install', False), argv)
    app = values.get('--app')
    if command == 'windows':
        rows = windows(app)
        main = [row for row in rows if row['layer'] == 0]
        return {'ok': True, 'windows': rows,
                'main': max(main, key=lambda r: r['bounds']['width'] * r['bounds']['height'])['id'] if main else None}
    if command == 'size':
        result = size(app, {k[2:]: v for k, v in values.items() if k != '--app'})
        result.pop('id')
    elif command == 'click':
        result = click(app, values['--x'], values['--y'])
    elif command == 'move':
        result = move(app, values.get('--x'), values.get('--y'), values.get('--park', False))
    elif command == 'key':
        result = key(app, values['--key'])
    elif command in ('still', 'record'):
        result = capture_file(app, values['--output'], tool, values.get('--seconds'))
    elif command == 'run':
        return run_recipe(values, tool)
    else:
        return compare(values['--a'], values['--b'], tool)
    return {'ok': True, **result}
