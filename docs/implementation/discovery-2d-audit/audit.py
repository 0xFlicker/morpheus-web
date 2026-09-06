# Audit-only screening. This does not generate or modify the runtime catalog.
import json,collections,csv,hashlib
from pathlib import Path
root = Path(__file__).resolve().parents[3]
source = root / 'packages/morpheus/client/js/service/morpheus.map.json'
records = json.loads(source.read_text())
scenes = {x['data']['sceneId']: x['data'] for x in records if x['type'] == 'Scene'}
casts = {x['data']['castId']: {'kind': x['type'], **x['data']}
         for x in records if x['type'] != 'Scene' and 'castId' in x['data']}
rs = []
for scene_id, scene in sorted(scenes.items()):
    resolved = [casts[c['ref']['castId']] for c in scene['casts'] if 'ref' in c]
    rs.append({'id': scene_id, 'type': scene['sceneType'],
               'media': [c for c in resolved if c['kind'] in
                         ['PanoCast', 'MovieSpecialCast', 'ControlledMovieCast']],
               'actions': [c for c in scene['casts'] if 'ref' not in c]})
sectionfolders={'Voodoo':'voodoo','Harem':'harem','h2oFront':'waterfront','carnival':'carnival','iceNchat':'ending',**{x:'ship' for x in ['Deck1','Deck2','Deck2Bth','CargoH','Deck3Aft','Deck3For','Deck4','Deck5','Elevator','sanitory','neuro']}}
def visual(c): return c['kind'] in ['MovieSpecialCast','ControlledMovieCast'] and not c.get('fileName','').lower().endswith(('tom','nar'))
def holds(c):return visual(c) and c['kind']=='MovieSpecialCast' and c.get('actionAtEnd') in [0,-1]
def base(r):return tuple(sorted(set(c['fileName'] for c in r['media'] if holds(c) and c.get('location')=={'x':0,'y':0})))
cs=[r for r in rs if r['type']==3 and r['id'] not in [0,100000,100999] and any(holds(c) for c in r['media'])]
families=collections.defaultdict(list)
for r in cs:
 if base(r):families[base(r)].append(r['id'])
for r in rs:
 dirs=set(c.get('fileName','').split('/')[1] for c in r['media'] if c.get('fileName','').startswith('GameDB/') and (visual(c) or c['kind']=='PanoCast'))
 sections=set(sectionfolders[d] for d in dirs if d in sectionfolders)
 r['section']=next(iter(sections)) if len(sections)==1 else 'unassigned'
 r['reasons']=[]
 if r['type']==1:r['proposal']='existing-panorama'
 elif r['id'] in [0,100000,100999] or r['type'] in [5,6,7]:r['proposal']='exclude-system-intro-credits'
 else:
  vs=[c for c in r['media'] if visual(c)]
  if any(holds(c) for c in vs):
   r['proposal']='propose-distinct-2d'
   if not base(r):r['reasons'].append('overlay-only; identify underlying content')
   elif len(families[base(r)])>1:r['reasons'].append('shared-base family; compare overlays, frames, controls and navigation before grouping')
   if any(c.get('actionAtEnd',0)>0 and c.get('initiallyEnabled') and not c.get('comparators') for c in vs):r['reasons'].append('unconditional advancing visual cast; verify stable content is actually presented')
   if any(a['type'] in [0,1] and a['gesture'] in [5,6] for a in r['actions']):r['reasons'].append('automatic scene action; verify router versus visible view')
   if any(c.get('fileName','').lower().endswith(('vid','mov','.mov')) for c in vs):r['reasons'].append('narrative clip; review inclusion policy')
   if any(c.get('comparators') for c in vs):r['reasons'].append('conditional visual content; scene-only observation may overclaim')
   if r['id'] in list(range(7020,7030))+list(range(7070,7080))+list(range(7090,7100)):r['reasons'].append('Island platform-state family; review distinct content versus mechanical state')
   if any('serum' in c.get('fileName','').lower() for c in vs):r['reasons'].append('closed/open container family; review distinct content versus state')
   if r['id'] in [123611,123613,311060,311061,321070,321072,331052,331053,332050,332052,341050,341052,351050,351052,790019,790029,862049,862051,880050,880051]:r['reasons'].append('paired content/state views; review separate versus grouped')
   if r['reasons']:r['proposal']='review-held-2d'
  elif any(c['kind']=='ControlledMovieCast' for c in vs):r['proposal']='review-controlled-animation'
  elif vs and all(c['fileName'].lower().endswith('trn') for c in vs):r['proposal']='exclude-authored-transition'
  elif not vs:r['proposal']='exclude-no-new-visual'
  else:r['proposal']='review-auto-content'
 r['baseAssets']=base(r)
counts=collections.defaultdict(collections.Counter)
for r in rs:counts[r['section']][r['proposal']]+=1
print(json.dumps(counts,indent=2))
out=root/'docs/implementation/discovery-2d-audit'
out.mkdir(exist_ok=True)
with open(out/'scene-inventory.csv','w') as f:
 w=csv.writer(f);w.writerow(['sceneId','sceneType','sectionFromVisualAssetFolder','proposal','reviewReasons','mediaEvidence','authoredActions'])
 for r in rs:
  w.writerow([r['id'],r['type'],r['section'],r['proposal'],'; '.join(r['reasons']),json.dumps(r['media'],separators=(',',':')),json.dumps(r['actions'],separators=(',',':'))])
with open(out/'review-families.md','w') as f:
 f.write('# Shared-base review index\n\nThese are search buckets, **not proposed aliases**. Shared assets do not establish equivalent content. These raw screening buckets are superseded by the user-reviewed family rules in README.md; exact scene membership still needs reconciliation. Empty-base scenes are deliberately not grouped. The CSV includes full cast frame, position, condition and action evidence.\n\n| Base asset(s) | Scene IDs |\n| --- | --- |\n')
 for k,v in families.items():
  if len(v)>1:f.write('| '+', '.join(k)+' | '+', '.join(map(str,v))+' |\n')

# Audit integrity only: all authored scene IDs covered exactly once, no guessing section prefixes.
assert len(rs)==1844 and len({r['id'] for r in rs})==1844
assert all(r['section']!='unassigned' for r in rs if r['proposal']=='propose-distinct-2d')
print('Audit inventory checks passed:',len(rs),'rows;',sum(r['proposal']=='propose-distinct-2d' for r in rs),'proposed independent 2D scenes')
