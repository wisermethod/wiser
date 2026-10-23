"""Review regressions using synthetic files and replaced native boundaries only."""
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch

from PIL import Image
from support import TOOL, temporary
import capture
import install
import media
import paths
import pipeline
from paths import CaptureError


class VideoReviewTests(unittest.TestCase):
    def frames(self, root):
        files = []
        for i in range(3):
            path = root / ('f%05d.png' % (i + 1))
            Image.new('RGB', (40, 30), (240 - i * 20, 250, 255)).save(path)
            files.append(path)
        return files

    def test_check_decode_has_no_rate_filter(self):
        with temporary() as directory:
            root = Path(directory)
            def decoded(arguments, operation):
                Image.new('RGB', (20, 20)).save(root / 'decoded/f00001.png')
            with patch.object(media, 'run', side_effect=decoded) as run:
                media.decode(root / 'input.mp4', root / 'decoded', None)
            arguments = run.call_args.args[0]
            self.assertNotIn('-vf', arguments)
            self.assertEqual(arguments[arguments.index('-fps_mode') + 1], 'passthrough')

    def test_verify_reads_every_frame_as_written(self):
        with temporary() as directory:
            root = Path(directory)
            files = self.frames(root)
            checked = {'frames': 3, 'distinct_frames': 3, 'hits': [], 'hits_per_engine': {'vision': 0, 'tesseract': 0}}
            with patch.object(pipeline, 'versions', return_value={}), \
                    patch.object(pipeline, 'decode', return_value=files) as decode, \
                    patch.object(pipeline, 'verify', return_value=checked):
                pipeline.execute('verify', root / 'published.mp4', None, root / 'report.json', fps=30)
            self.assertIsNone(decode.call_args.args[2], 'verify must decode with no frame-rate filter')

    def test_short_decode_refuses_redact(self):
        with temporary() as directory:
            root = Path(directory)
            files = self.frames(root)
            destination = root / 'destination'
            destination.mkdir()
            output = destination / 'out.mp4'
            checked = {'frames': 2, 'hits': [], 'hits_per_engine': {'vision': 0, 'tesseract': 0}}
            def encoded(frames, candidate, fps):
                candidate.write_bytes(b'synthetic encoded file')
                return {}
            with patch.object(pipeline, 'versions', return_value={}), \
                    patch.object(pipeline, 'decode', side_effect=[files, files[:-1]]), \
                    patch.object(pipeline, 'detect', return_value=[[], [], []]), \
                    patch.object(pipeline, 'encode', side_effect=encoded), \
                    patch.object(pipeline, 'verify', return_value=checked), \
                    self.assertRaisesRegex(CaptureError, 'frame count'):
                pipeline.execute('redact', root / 'source.mp4', output, root / 'report.json', workers=1)
            self.assertEqual(list(destination.iterdir()), [])

    def test_interruption_after_encode_exposes_no_candidate_or_tagged_file(self):
        with temporary() as directory:
            root = Path(directory)
            files = self.frames(root)
            destination = root / 'destination'
            destination.mkdir()
            exposed = []
            def encoded(arguments, operation):
                Path(arguments[-1]).write_bytes(b'synthetic encoded file')
                exposed.extend(destination.iterdir())
            def interrupted(path, directory, fps=None):
                if directory.name == 'raw':
                    return files
                exposed.extend(destination.iterdir())
                raise KeyboardInterrupt()
            unknown = {key: 'unknown' for key in ('color_space', 'color_transfer', 'color_primaries')}
            final = {key: 'bt709' for key in unknown}
            with patch.object(pipeline, 'versions', return_value={}), \
                    patch.object(pipeline, 'decode', side_effect=interrupted), \
                    patch.object(pipeline, 'detect', return_value=[[], [], []]), \
                    patch.object(media, 'run', side_effect=encoded), \
                    patch.object(media, 'colour_tags', side_effect=[unknown, final]), \
                    self.assertRaises(KeyboardInterrupt):
                pipeline.execute('redact', root / 'source.mp4', destination / 'out.mp4',
                                 root / 'report.json', workers=1)
            self.assertEqual(exposed, [], 'unchecked files were exposed before cleanup')
            self.assertEqual(list(destination.iterdir()), [])


class CacheReviewTests(unittest.TestCase):
    def cache(self, root):
        tool = root / 'Screen Capture'
        tool.mkdir()
        shutil.copyfile(TOOL / 'requirements.txt', tool / 'requirements.txt')
        cache = tool / '.venv'
        site = cache / ('lib/python%d.%d/site-packages' % sys.version_info[:2])
        (site / 'objc').mkdir(parents=True)
        (site / 'objc/__init__.py').touch()
        (cache / 'bin').mkdir()
        (cache / 'bin/python3').touch()
        return tool, cache, site

    def distribution(self, site, name, version):
        dist = site / (name.replace('-', '_') + '.dist-info')
        dist.mkdir(exist_ok=True)
        (dist / 'METADATA').write_text('Metadata-Version: 2.1\nName: %s\nVersion: %s\n' % (name, version))

    def complete(self, site):
        for name in ('pyobjc-core', 'pyobjc-framework-Cocoa', 'pyobjc-framework-Quartz',
                     'pyobjc-framework-CoreML', 'pyobjc-framework-Vision'):
            self.distribution(site, name, '11.1')
        self.distribution(site, 'pillow', '11.3.0')
        self.distribution(site, 'numpy', '2.0.2' if sys.version_info < (3, 11) else '2.3.5')

    def test_core_only_cache_is_not_ready(self):
        with temporary() as directory:
            tool, cache, site = self.cache(Path(directory))
            self.distribution(site, 'pyobjc-core', '11.1')
            self.assertFalse(install.ready(cache))

    def test_wrong_version_is_not_ready_and_markers_choose_the_pin(self):
        with temporary() as directory:
            tool, cache, site = self.cache(Path(directory))
            self.complete(site)
            self.assertTrue(install.ready(cache))
            self.distribution(site, 'numpy', '2.3.5' if sys.version_info < (3, 11) else '2.0.2')
            self.assertFalse(install.ready(cache))

    def test_other_interpreter_site_packages_do_not_satisfy_cache(self):
        with temporary() as directory:
            tool, cache, site = self.cache(Path(directory))
            other = cache / 'lib/python0.0/site-packages'
            other.parent.mkdir()
            site.rename(other)
            self.complete(other)
            self.assertFalse(install.ready(cache))

    def test_partial_cache_is_repaired_under_existing_consent(self):
        with temporary() as directory:
            root = Path(directory)
            tool, cache, site = self.cache(root)
            self.distribution(site, 'pyobjc-core', '11.1')
            marker = root / '.wiser-consent'
            marker.write_text(json.dumps({'realpath': str(root)}))
            def repaired(arguments, **kwargs):
                self.complete(site)
                return subprocess.CompletedProcess(arguments, 0)
            with patch.object(install, 'plugin_root', return_value=root), \
                    patch.dict(os.environ, {'WISER_ALLOW_INSTALL': '0', 'WISER_CAPTURE_CACHE_RUN': '0'}), \
                    patch.object(install.subprocess, 'run', side_effect=repaired) as run, \
                    patch.object(install.os, 'execv'), contextlib.redirect_stderr(io.StringIO()):
                install.ensure(tool, False, ['verify'])
            self.assertEqual(run.call_count, 1)
            self.assertIn('pip', run.call_args.args[0])
            self.assertTrue(install.ready(cache))

    def test_install_failures_name_incomplete_cache_without_stderr(self):
        for existing in (False, True):
            for error in (OSError('private install stderr'),
                          subprocess.CalledProcessError(1, ['synthetic'], stderr=b'private install stderr')):
                with self.subTest(existing=existing, error=type(error).__name__), temporary() as directory:
                    tool = Path(directory) / 'Screen Capture'
                    tool.mkdir()
                    cache = tool / '.venv'
                    if existing:
                        (cache / 'bin').mkdir(parents=True)
                        (cache / 'bin/python3').touch()
                    with patch.object(install, 'ready', return_value=False), \
                            patch.object(install, 'plugin_root', return_value=None), \
                            patch.object(install.subprocess, 'run', side_effect=error), \
                            contextlib.redirect_stderr(io.StringIO()):
                        try:
                            install.ensure(tool, True, [])
                        except Exception as failure:
                            self.assertIsInstance(failure, CaptureError)
                            self.assertIn('incomplete .venv', str(failure))
                            self.assertIn(str(cache), str(failure))
                            self.assertNotIn('private install stderr', str(failure))
                        else:
                            self.fail('failed install was accepted')

    def test_cache_reexec_disables_bytecode(self):
        with temporary() as directory:
            tool, cache, site = self.cache(Path(directory))
            with patch.object(install, 'ready', return_value=True), \
                    patch.dict(os.environ, {'WISER_CAPTURE_CACHE_RUN': '0'}), \
                    patch.object(install.os, 'execv') as execute:
                install.ensure(tool, False, ['verify'])
            self.assertEqual(execute.call_args.args[1][1], '-B')


class PathAndWorkerReviewTests(unittest.TestCase):
    def test_input_hard_link_to_another_credential_file_is_refused(self):
        with temporary() as directory:
            root = Path(directory)
            credentials = root / 'credentials'
            credentials.mkdir()
            other = credentials / 'other-credential'
            other.touch()
            source = root / 'input.png'
            os.link(other, source)
            with patch.object(paths, 'config_dir', return_value=credentials), \
                    self.assertRaisesRegex(CaptureError, 'credential directory'):
                capture.parse(['verify', '--input', str(source), '--report', str(root / 'report.json')])

    def test_parallel_verify_on_copy_writes_no_script_bytecode(self):
        with temporary() as directory:
            root = Path(directory)
            tool = root / 'Screen Capture'
            shutil.copytree(TOOL / 'scripts', tool / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
            files = [root / 'first.png', root / 'second.png']
            for path, colour in zip(files, ('white', 'lightblue')):
                Image.new('RGB', (80, 50), colour).save(path)
            runner = root / 'parallel_verify.py'
            runner.write_text('import json, sys\n'
                              'sys.path.insert(0, sys.argv[1])\n'
                              'if __name__ == "__main__":\n'
                              '    import runpy\n'
                              '    runpy.run_path(sys.argv[1] + "/capture.py")\n'
                              '    import check\n'
                              '    result = check.verify(sys.argv[2:], (), workers=2)\n'
                              '    print(json.dumps(result))\n')
            environment = dict(os.environ)
            for key in ('PYTHONDONTWRITEBYTECODE', 'PYTHONPYCACHEPREFIX'):
                environment.pop(key, None)
            result = subprocess.run([sys.executable, str(runner), str(tool / 'scripts')] + list(map(str, files)),
                                    env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            reading = json.loads(result.stdout)
            self.assertEqual((reading['frames'], reading['distinct_frames'], reading['hits']), (2, 2, []))
            self.assertEqual(list((tool / 'scripts').rglob('__pycache__')), [])


if __name__ == '__main__':
    unittest.main()
