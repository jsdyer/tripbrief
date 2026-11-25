import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from refresh import normalize, refresh

def source():
    return {'metadata': {'generated': {'timestamp': 1767225600}}, 'data': {'PT-20': {'country-iso': 'PT-20', 'has-content': 1, 'advisory-state': 0, 'has-regional-advisory': 1, 'date-published': {'asp': '2026-01-01T02:00:00+01:00'}, 'recent-updates-type': 'Update', 'eng': {'name': 'Azores', 'url-slug': 'azores', 'advisory-text': 'Take normal precautions', 'recent-updates': 'Entry information updated'}, 'fra': {'name': 'Açores'}}}}

class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        (self.root/'config').mkdir()
        (self.root/'config/source.json').write_text(json.dumps({'url':'https://data.international.gc.ca/travel-voyage/index-alpha-eng.json','minimum_records':1,'history_limit':2}))
    def tearDown(self): self.tmp.cleanup()
    def run_capture(self, doc=None, now='2026-01-02T00:00:00Z'):
        refresh(self.root, fetch=lambda _: doc or source(), now=now)
        return json.loads((self.root/'web/data/index.json').read_text())
    def test_region_and_timezone(self):
        generated, rows=normalize(source())
        self.assertEqual(rows[0]['code'],'PT-20');self.assertTrue(rows[0]['regional'])
        self.assertEqual(rows[0]['updated_at'],'2026-01-01T01:00:00Z')
    def test_unchanged_check_does_not_invent_advisory_update(self):
        first=self.run_capture();second=self.run_capture(now='2026-01-03T00:00:00Z')
        self.assertNotEqual(first['checked_at'],second['checked_at'])
        self.assertEqual(first['countries'],second['countries']);self.assertEqual(second['changes'],[])
        status=json.loads((self.root/'web/data/status.json').read_text())
        self.assertEqual(status['sha256'],hashlib.sha256((self.root/'web/data/index.json').read_bytes()).hexdigest())
    def test_failed_source_retains_both_files(self):
        self.run_capture();before={p.name:p.read_bytes() for p in (self.root/'web/data').iterdir()}
        bad=source();bad['data']['PT-20']['advisory-state']=9
        with self.assertRaises(ValueError): self.run_capture(bad)
        with self.assertRaises(OSError): refresh(self.root, fetch=lambda _: (_ for _ in ()).throw(OSError('HTTP 403')))
        self.assertEqual(before,{p.name:p.read_bytes() for p in (self.root/'web/data').iterdir()})
    def test_future_and_missing_record_rejected(self):
        with self.assertRaises(ValueError): self.run_capture(now='2025-12-31T00:00:00Z')
        with self.assertRaises(ValueError): normalize({'metadata':source()['metadata'],'data':{}})
    def test_changes_include_text_even_if_risk_unchanged(self):
        first=self.run_capture();doc=source();doc['data']['PT-20']['eng']['recent-updates']='Transport strike'
        second=self.run_capture(doc,now='2026-01-03T00:00:00Z')
        self.assertEqual(len(second['changes']),1);self.assertEqual(second['changes'][0]['kind'],'updated')
        self.assertEqual(second['baseline_at'],first['baseline_at'])
