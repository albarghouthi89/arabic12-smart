# -*- coding: utf-8 -*-
import sys, os, json, hashlib, html
sys.path.insert(0,'/home/claude/build')
from catalog import WS, MM
import pikepdf
from pikepdf import Pdf, Name, Dictionary, Stream, Array
from playwright.sync_api import sync_playwright

SITE='/home/claude/live/LIVE-SITE'
OUT=SITE+'/library/files/lesson'
TMP='/home/claude/build/tmp'
os.makedirs(OUT,exist_ok=True); os.makedirs(TMP,exist_ok=True)
SCHOOL="المدرسة الفلسطينية في قطر"; COUNTRY="دولة قطر"
TEACHER="الأستاذ عبدالله البرغوثي"; ROLE="معلم اللغة العربية — الصف الثاني عشر العلمي"
YEAR="2026 – 2027"
PW,PH=595.28,841.89; LH=66.0; S=0.905

def lh_html(kind,title):
    n=len(title); fs=9.3 if n<=34 else (8.2 if n<=50 else 7.4)
    label={'ws':'ورقة عمل','mm':'خريطة ذهنية','all-ws':'أوراق العمل','all-mm':'الخرائط الذهنية'}[kind]
    return f'''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>
    @page{{size:210mm 23.3mm;margin:0}}
    *{{box-sizing:border-box;margin:0;padding:0}}
    html,body{{width:210mm;height:23.3mm;background:#fff;font-family:"Noto Sans Arabic","Noto Kufi Arabic",sans-serif;color:#1f2347;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    .band{{position:relative;height:23.3mm;padding:3.2mm 9mm 0;display:grid;grid-template-columns:1.05fr 1.3fr .95fr;align-items:start;gap:4mm}}
    .band:after{{content:"";position:absolute;inset-inline:9mm;bottom:2.2mm;height:.9mm;border-radius:1mm;background:linear-gradient(90deg,#d99a2b,#423bd6)}}
    .sch{{display:flex;align-items:center;gap:2.2mm}}
    .mark{{width:9.6mm;height:9.6mm;border-radius:3mm;background:#423bd6;display:flex;align-items:center;justify-content:center;flex:none}}
    .mark svg{{width:7.6mm;height:7.6mm}}
    .sch b{{display:block;white-space:nowrap;font-size:10.2pt;font-weight:800;color:#423bd6;line-height:1.25}}
    .sch span{{display:block;font-size:7.6pt;color:#6b6f8f;font-weight:500;margin-top:.4mm}}
    .mid{{text-align:center;padding-top:.6mm}}
    .chip{{display:inline-block;background:#fdf3de;color:#8a5a06;border:.25mm solid #e9c581;border-radius:6mm;padding:.5mm 3.6mm;font-size:7.8pt;font-weight:800}}
    .ttl{{font-size:9.3pt;font-weight:800;margin-top:1.3mm;line-height:1.35;color:#1f2347}}
    .tch{{text-align:left}}
    .tch b{{display:block;font-size:10.6pt;font-weight:800;color:#1f2347;line-height:1.25}}
    .tch span{{display:block;font-size:7.2pt;color:#6b6f8f;font-weight:500;margin-top:.4mm}}
    .tch i{{display:block;font-style:normal;font-size:7.2pt;color:#8a5a06;font-weight:700;margin-top:.3mm}}
    </style><body><div class="band">
    <div class="sch"><div class="mark"><svg viewBox="0 0 32 32" fill="none"><path d="M5 24 L12 16 L18 20 L26 8" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="8" r="3.3" fill="#d99a2b"/></svg></div>
      <div><b>{SCHOOL}</b><span>{COUNTRY} · العام الدراسي {YEAR}</span></div></div>
    <div class="mid"><span class="chip">{label}</span><div class="ttl" style="font-size:{fs}pt">{html.escape(title)}</div></div>
    <div class="tch"><b style="white-space:nowrap">{TEACHER}</b><span>{ROLE}</span><i>الفصل الدراسي الأول</i></div>
    </div></body></html>'''

_lh_cache={}
def make_letterheads(pw, specs):
    page=pw.new_page()
    for key,(kind,title) in specs.items():
        page.set_content(lh_html(kind,title)); page.wait_for_timeout(60)
        f=f'{TMP}/lh_{hashlib.md5(key.encode()).hexdigest()}.pdf'
        page.pdf(path=f,width='210mm',height='23.3mm',print_background=True,margin=dict(top='0',bottom='0',left='0',right='0'))
        _lh_cache[key]=f
    page.close()

def compose(src_path, pages, lh_key, out_path, title, subject):
    src=Pdf.open(src_path)
    dst=Pdf.new()
    lh=Pdf.open(_lh_cache[lh_key])
    lh_form=dst.copy_foreign(pikepdf.Page(lh.pages[0]).as_form_xobject())
    for pno in pages:
        sp=pikepdf.Page(src.pages[pno-1])
        form=dst.copy_foreign(sp.as_form_xobject())
        bb=[float(x) for x in sp.mediabox]; w=bb[2]-bb[0]; h=bb[3]-bb[1]
        s=min(S,(PW-20)/w,(PH-LH-8)/h)
        tx=(PW-w*s)/2; ty=8
        pg=dst.add_blank_page(page_size=(PW,PH))
        pg.Resources=Dictionary(XObject=Dictionary(Fm1=form,Lh=lh_form))
        c=f'q {s:.4f} 0 0 {s:.4f} {tx:.3f} {ty:.3f} cm /Fm1 Do Q q 1 0 0 1 0 {PH-LH+0.4:.2f} cm /Lh Do Q'
        pg.Contents=dst.make_stream(c.encode())
    dst.docinfo['/Title']=title; dst.docinfo['/Author']='عبدالله البرغوثي'
    dst.docinfo['/Subject']=subject; dst.docinfo['/Creator']='منصة تمكّن — اللغة العربية 12 علمي'
    dst.save(out_path,compress_streams=True,object_stream_mode=pikepdf.ObjectStreamMode.generate)

def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
if __name__=='__main__':
    # تقليص: الإبقاء فقط على ملفات الدروس الموجودة في المنصة/الخطة الفصلية (lesson != None)
    import shutil; shutil.rmtree(OUT,ignore_errors=True); os.makedirs(OUT,exist_ok=True)
    WS[:]=[w for w in WS if w[3]]; MM[:]=[m for m in MM if m[4]]
    specs={}
    for id_,pgs,t,l,d in WS: specs[id_]=('ws',t)
    for id_,p,t,d,l in MM: specs[id_]=('mm',t)
    specs['all-ws']=('all-ws','أوراق العمل المتقدّمة — الكلمة والجملة والبلاغة والتعبير')
    specs['all-mm']=('all-mm','خرائط المراجعة الذهنية — الفصل الأول')
    with sync_playwright() as pw:
        b=pw.chromium.launch(); make_letterheads(b.contents if False else pw.chromium.launch(), specs) if False else None
        browser=pw.chromium.launch()
        class W: pass
        # make_letterheads expects an object with new_page
        make_letterheads(browser, specs); browser.close()
    reg=[]
    for id_,pgs,t,l,d in WS:
        f=f'{OUT}/worksheet-{id_[3:]}-v1.pdf'
        compose('/tmp/in/ws.pdf',pgs,id_,f,f'ورقة عمل: {t}',f'{d} — اللغة العربية 12 علمي')
        reg.append(dict(id=id_,kind='worksheet',title=t,lesson=l,domain=d,file='library/files/lesson/'+os.path.basename(f),pages=len(pgs),size=os.path.getsize(f),sha=sha(f)))
    for id_,p,t,d,l in MM:
        f=f'{OUT}/mindmap-{id_[3:]}-v1.pdf'
        compose('/tmp/in/mm.pdf',[p],id_,f,f'خريطة ذهنية: {t}',f'{d} — اللغة العربية 12 علمي')
        reg.append(dict(id=id_,kind='mindmap',title=t,lesson=l,domain=d,file='library/files/lesson/'+os.path.basename(f),pages=1,size=os.path.getsize(f),sha=sha(f)))
    allws=[p for _,pgs,_,_,_ in WS for p in pgs]
    f=f'{OUT}/worksheets-all-v1.pdf'
    compose('/tmp/in/ws.pdf',allws,'all-ws',f,'أوراق العمل المتقدمة — الفصل الأول','الكلمة والجملة والبلاغة والتعبير')
    reg.append(dict(id='all-ws',kind='bundle-worksheet',title='كل أوراق العمل',file='library/files/lesson/'+os.path.basename(f),pages=len(allws),size=os.path.getsize(f),sha=sha(f)))
    f=f'{OUT}/mindmaps-all-v1.pdf'
    compose('/tmp/in/mm.pdf',[p for _,p,_,_,_ in MM],'all-mm',f,'خرائط المراجعة الذهنية — الفصل الأول','اللغة العربية 12 علمي')
    reg.append(dict(id='all-mm',kind='bundle-mindmap',title='كل الخرائط الذهنية',file='library/files/lesson/'+os.path.basename(f),pages=len(MM),size=os.path.getsize(f),sha=sha(f)))
    json.dump(reg,open('/home/claude/build/registry.json','w'),ensure_ascii=False,indent=1)
    print(len(reg),'files', sum(r['size'] for r in reg)//1024,'KB')
