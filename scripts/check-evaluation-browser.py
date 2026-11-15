"""Automated synthetic-fixture and read-only UI checks through local ChromeDriver."""
import argparse,base64,json,pathlib,subprocess,urllib.error,urllib.request

origin='http://127.0.0.1:9516'
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=pathlib.Path,default=root/'data/domain-examples',help='Directory for actual check output and screenshots.')
out=parser.parse_args().output.resolve()
out.mkdir(parents=True,exist_ok=True)
checks=[]
def request(method,path,payload=None):
    data=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request(origin+path,data=data,method=method,headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=40) as response: result=json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error
    value=result.get('value')
    if isinstance(value,dict) and value.get('error'): raise RuntimeError(value)
    return value

session=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'chrome','goog:chromeOptions':{'binary':'/usr/bin/chromium','args':['--headless=new','--no-sandbox','--disable-dev-shm-usage','--user-data-dir=/tmp/reviewproof-improvements-browser']},'goog:loggingPrefs':{'browser':'ALL'}}}})
sid=session['sessionId']
def api(method,path,payload=None): return request(method,'/session/'+sid+path,payload)
def js(script,*args): return api('POST','/execute/sync',{'script':script,'args':list(args)})
def element(selector): return api('POST','/element',{'using':'css selector','value':selector})['element-6066-11e4-a52e-4f735466cecf']
def keys(selector,text): api('POST','/element/'+element(selector)+'/value',{'text':text})
def go(path): api('POST','/url',{'url':'http://127.0.0.1:4411'+path})
def screenshot(name): (out/name).write_bytes(base64.b64decode(api('GET','/screenshot')))
try:
    api('POST','/window/rect',{'width':1280,'height':900})
    go('/examples/frontend?version=head')
    assert js("return document.getElementById('search-query').labels[0].textContent.trim()")=='Find a synthetic note'
    keys('button[type=submit]','\ue007')
    assert js("return document.activeElement.id==='search-query' && document.getElementById('search-query').getAttribute('aria-invalid')==='true' && !document.getElementById('search-error').hidden")
    checks.append('Head keyboard Enter on native submit exposes empty-input error and focuses the associated input.')
    keys('#search-query','example')
    assert js("return document.getElementById('search-error').hidden && !document.getElementById('search-query').hasAttribute('aria-invalid')")
    keys('button[type=submit]',' ')
    assert js("return document.getElementById('search-result').textContent.includes('Synthetic result')")
    checks.append('Editing clears stale errors; native submit activates with Space and displays synthetic output.')
    go('/examples/frontend?version=head');keys('#search-query','example\ue007')
    assert js("return document.getElementById('search-result').textContent.includes('Synthetic result')")
    checks.append('Enter in the search input submits the head form.')
    go('/examples/frontend?version=base')
    assert js("return document.getElementById('search-query').labels.length===0")
    assert js("return document.getElementById('search-submit').tabIndex===-1")
    keys('#search-query','example\ue007')
    assert js("return document.getElementById('search-result').textContent===''")
    checks.append('Input-focused Enter produces no result on base; its click-only div is outside keyboard tab order and the input has no associated label.')
    for path in ['/','/assess','/setups','/case/2283','/case/2283/blind','/metrics','/trust','/examples','/examples/frontend?version=head','/case/2297/findings','/case/2297/targeted','/case/2283/experiment','/evaluation/findings','/evaluation/targeted','/evaluation/experiments']:
        for width in [1440,768,390]:
            api('POST','/window/rect',{'width':width,'height':900 if width==1280 else 812})
            go(path)
            assert js("return !document.querySelector('[name=activeSeconds],[name=externalSeconds],[name=started],#timer-status,#elapsed,#start,#pause')"),(path,width,'review timing still present')
            size=js('return {width:innerWidth,scroll:document.documentElement.scrollWidth}')
            if size['scroll']>size['width']:
                print(json.dumps(js("return [...document.querySelectorAll('body *')].filter(e=>e.scrollWidth>e.clientWidth+1).slice(0,15).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.clientWidth,scroll:e.scrollWidth,text:e.textContent.slice(0,90)}))")))
            assert size['scroll']<=size['width'],(path,width,size)
            captures={'/':'assessments','/assess':'new-assessment','/case/2283':'assessment'}
            if path in captures and width in [1440,390]:
                screenshot(captures[path]+('-desktop.png' if width==1440 else '-mobile.png'))
        checks.append(path+': no document-level horizontal overflow at 1440px, 768px and 390px viewports.')
    api('POST','/window/rect',{'width':1440,'height':900});go('/')
    assert js("return document.querySelectorAll('.sidebar nav > a').length===3 && !document.querySelector('.sidebar .nav-more').open")
    keys('.sidebar .nav-more > summary','\ue007')
    assert js("return document.querySelector('.sidebar .nav-more').open && document.querySelectorAll('.sidebar .nav-more a').length===4")
    checks.append('Three primary navigation links; secondary tools remain accessible through a keyboard-operated disclosure.')
    assert js("return !document.querySelector('main details.advanced').open")
    keys('main details.advanced > summary','\ue007')
    assert js("return document.querySelector('main details.advanced').open && document.querySelector('main details.advanced a[href=\"/evaluation/experiments\"]')!==null")
    checks.append('Evaluation tools stay collapsed on the assessment queue and remain keyboard-accessible.')
    go('/case/2283')
    assert js("return document.querySelector('main details.my-3') && !document.querySelector('main details.my-3').open")
    keys('main details.my-3 > summary','\ue007')
    assert js("return document.querySelector('main details.my-3').open && document.querySelector('main details.my-3 pre').getBoundingClientRect().height>0")
    checks.append('Source citations expand with the keyboard while decisions and evidence remain in the report.')
    go('/assess')
    assert js("return document.querySelector('select[name=profile]').value==='auto' && document.querySelector('input[name=owner]').checkValidity()===false")
    checks.append('Assessment form retains Automatic as default and requires a named owner before submission.')
    go('/assess?example=2283')
    assert js("return document.querySelector('input[name=repository]').value.includes('github.com') && document.querySelector('input[name=head]').value.length===40 && !document.querySelector('input[name=trustProfile]').checked")
    checks.append('Sample-prefill retains pinned commits and never preselects execution trust.')
    api('POST','/window/rect',{'width':390,'height':844});go('/')
    keys('.mobile-navigation summary','\ue007')
    assert js("return document.querySelector('.mobile-navigation').open && getComputedStyle(document.querySelector('.mobile-navigation nav')).display!=='none'")
    assert js("const bounds=document.querySelector('.mobile-navigation nav').getBoundingClientRect();return bounds.left>=0 && bounds.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth")
    checks.append('Mobile workspace navigation opens with a native keyboard-accessible details control.')
    go('/examples/frontend?version=head');keys('button[type=submit]','\ue007');screenshot('frontend-head-mobile.png')
    api('POST','/window/rect',{'width':1280,'height':900});go('/case/2297/findings');screenshot('finding-feedback-desktop.png')
    go('/case/2297/targeted');keys('input[name=name]','Synthetic browser inspection only');js("document.querySelector('select[name=priorExposure]').value='yes'")
    assert js("return !document.getElementById('material').hidden && !document.getElementById('start')")
    checks.append('Targeted reading material is immediately visible with no timer; browser inspection submits no human observation.')
    screenshot('targeted-reading-desktop.png')
    for width in [1280,375]:
        api('POST','/window/rect',{'width':width,'height':900 if width==1280 else 812})
        size=js('return {width:innerWidth,scroll:document.documentElement.scrollWidth}')
        assert size['scroll']<=size['width'],('revealed targeted material',width,size)
    checks.append('Revealed targeted code and linked evidence also fit desktop and 375px viewports without document-level overflow.')
    comparison_fixture=pathlib.Path('/tmp/reviewproof-comparison-ui.html')
    subprocess.run(['node','--input-type=module','-e',"""
import {readFileSync,writeFileSync} from 'node:fs';
import {renderTargetedComparison} from './src/targeted-experiment.ts';
import {renderHtml} from './src/render.ts';
const r=JSON.parse(readFileSync('data/cases/2297/report.json','utf8'));
writeFileSync('/tmp/reviewproof-offline-ui.html',renderHtml(r,path=>path,5));
r.case={...r.case,id:'synthetic-browser',requirementId:'SYNTHETIC BROWSER FIXTURE'};
const review={schemaVersion:1,id:'synthetic-browser',caseId:r.case.id,reportHash:'a'.repeat(64),submittedAt:'Synthetic fixture; no human submission',reviewer:'Synthetic browser fixture only',identity:'self-declared',humanAttested:true,priorExposure:true,selectedHunkIds:r.route.readingList.map(x=>x.hunkId),notes:'Synthetic locked notes for browser validation only.',unresolvedQuestions:'Synthetic question.',fullReadNeeded:true};
writeFileSync('/tmp/reviewproof-comparison-ui.html',renderTargetedComparison(r,review,'synthetic-browser-nonce'));
"""],cwd=root,check=True)
    api('POST','/url',{'url':comparison_fixture.as_uri()})
    assert js("return document.querySelector('.locked').textContent.includes('Synthetic locked notes')")
    assert js("return !document.getElementById('material').hidden")
    for width in [1280,375]:
        api('POST','/window/rect',{'width':width,'height':900 if width==1280 else 812})
        size=js('return {width:innerWidth,scroll:document.documentElement.scrollWidth}')
        assert size['scroll']<=size['width'],('synthetic comparison fixture',width,size)
    screenshot('targeted-comparison-mobile.png')
    checks.append('Separate synthetic comparison UI preserves locked notes, shows the full diff without a timer, and fits desktop/mobile; no real record is created.')
    api('POST','/url',{'url':pathlib.Path('/tmp/reviewproof-offline-ui.html').as_uri()})
    assert js("return document.querySelector('h1').textContent.includes('Assessment') && !document.querySelector('form') && !document.querySelector('.sidebar')")
    assert api('POST','/execute/async',{'script':"const done=arguments[arguments.length-1];document.fonts.ready.then(()=>done(document.fonts.check('400 16px Geist')&&document.fonts.check('600 32px \\\"Bricolage Grotesque\\\"')));",'args':[]})
    checks.append('Offline report opens directly from a file with embedded loaded fonts, readable assessment content and no live sign-off form.')
    logs=api('POST','/log',{'type':'browser'})
    errors=[log for log in logs if log['level']=='SEVERE' and 'favicon.ico' not in log['message']]
    assert not errors,errors
    from datetime import datetime,timezone
    record={'status':'passed','domainFixturesSynthetic':True,'scope':'Synthetic domain/comparison fixtures and read-only UI inspection of supplied sample 2297','checkedAt':datetime.now(timezone.utc).isoformat(),'browser':session['capabilities'].get('browserVersion'),'checks':checks,'humanRecordsSubmitted':False,'limitations':['Automated Chromium checks, not a screen-reader session, usability study, full accessibility audit or real human evaluation.','Frontend output, comparison test values and security fixtures are synthetic; original evaluation metrics remain separate.']}
    (out/'browser-checks.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'checks':len(checks),'browser':record['browser'],'humanRecordsSubmitted':False}))
except Exception:
    screenshot('failed-step.png')
    raise
finally:
    api('DELETE','')
