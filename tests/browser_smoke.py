"""Exercise the built application at its real project subpath."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main():
    screenshots=ROOT/'browser-checks';screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT/'dist',Path(temporary)/'tripbrief')
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temporary))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                executable=os.environ.get('CHROMIUM_PATH')
                browser=p.chromium.launch(**({'executable_path':executable} if executable else {}))
                page=browser.new_page(viewport={'width':1280,'height':1000});errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto('http://127.0.0.1:'+str(server.server_port)+'/tripbrief/')
                expect(page.locator('#result-count')).to_contain_text(str(len(json.loads((ROOT/'web/data/index.json').read_text())['countries'])))
                page.locator('#search').fill('Açores')
                expect(page.locator('#countries .country')).to_have_count(1)
                page.locator('#countries .country').click()
                expect(page.locator('#detail h2')).to_have_text('Azores')
                page.get_by_role('button',name='Add to my trip').click()
                page.locator('#tab-trip').click()
                page.locator('#trip-title').fill('My trip <script>alert(1)</script>')
                page.get_by_label('Arrival date for Azores',exact=True).fill('2027-06-03')
                page.get_by_label('Departure date for Azores',exact=True).fill('2027-06-08')
                page.get_by_label('Notes for Azores').fill('<img src=x onerror=alert(1)> Meet at the ferry')
                page.locator('#save').click()
                expect(page.locator('#trip-status')).to_contain_text('Saved on this device')
                page.locator('#clear').click()
                expect(page.locator('#stops .stop')).to_have_count(0)
                page.locator('#load').click()
                expect(page.locator('#stops .stop')).to_have_count(1)
                expect(page.get_by_label('Arrival date for Azores',exact=True)).to_have_value('2027-06-03')
                assert page.locator('img').count()==0
                with page.expect_download() as event: page.locator('#download-json').click()
                exported=json.loads(Path(event.value.path()).read_text())
                assert exported['stops'][0]['code']=='PT-20'
                with page.expect_download() as event: page.locator('#download-brief').click()
                html=Path(event.value.path()).read_text()
                assert '&lt;img' in html and '<img' not in html and '2027-06-08' in html
                page.locator('#import').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"schema":3}'})
                expect(page.locator('#trip-status')).to_contain_text('Use a Trip Brief export')
                expect(page.locator('#stops .stop')).to_have_count(1)
                exported['title']='Imported trip'
                page.locator('#import').set_input_files({'name':'trip.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
                expect(page.locator('#trip-title')).to_have_value('Imported trip')
                expect(page.locator('#trip-status')).to_contain_text('Imported 1 destinations')
                page.screenshot(path=str(screenshots/'desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots/'mobile.png'),full_page=True)
                page.locator('#forget').click()
                assert page.evaluate("localStorage.getItem('coolcode:tripbrief:trip')") is None
                assert not errors,errors
                browser.close()
            print('Browser passed: catalogue, territories, dates, save/load, validated imports, safe offline export and mobile layout')
        finally: server.shutdown()

if __name__=='__main__': main()
