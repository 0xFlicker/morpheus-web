import json,subprocess,concurrent.futures
from pathlib import Path
HERE=Path(__file__).resolve().parent
WEB=HERE.parents[2]
m=json.load(open(WEB/'packages/morpheus/client/js/service/morpheus.map.json'))
files=sorted({x['data']['fileName'] for x in m if x['type'] in ['MovieSpecialCast','ControlledMovieCast'] and x['data'].get('fileName')})
root=WEB.parent/'morpheus-asset-converter'
def probe(f):
 p=root/f
 if not p.exists():return f,{'error':'original file absent'}
 r=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames','-of','json',str(p)],capture_output=True,text=True)
 if r.returncode:return f,{'error':'ffprobe failed'}
 streams=json.loads(r.stdout).get('streams',[])
 return f,streams[0] if streams else {'audioOnly':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:d=dict(pool.map(probe,files))
p=HERE/'original-media-dimensions.json';p.write_text(json.dumps(d,indent=2)+'\n')
print('probed',len(d),'errors',[(k,v) for k,v in d.items() if 'error'in v])

for canonical,original in [('scrbLGSTL','scrbLGSPC'),('scrbclseSTL','scrbclseSPC')]:
    original_path='GameDB/Deck3Aft/'+original
    _,info=probe(original_path)
    d['GameDB/Deck3Aft/'+canonical]={**info,'originalSource':original_path,
        'evidence':'scripts/canonical-map-migrations.cjs and recover-missing-stills.cjs'}
p.write_text(json.dumps(d,indent=2)+'\n')
