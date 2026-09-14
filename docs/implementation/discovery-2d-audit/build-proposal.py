"""Build a REVIEW artifact only. Never writes the runtime discovery catalog."""
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
rows = []
for row in csv.DictReader((HERE / 'scene-inventory.csv').open()):
    rows.append({'id': int(row['sceneId']), 'type': int(row['sceneType']),
                 'section': row['sectionFromVisualAssetFolder'],
                 'media': json.loads(row['mediaEvidence']),
                 'actions': json.loads(row['authoredActions'])})
by_id = {r['id']: r for r in rows}
dimensions = json.loads((HERE / 'original-media-dimensions.json').read_text())
units = []
# Frozen audit input: runtime catalog v2 no longer contains the v1 source groups.
for group in json.loads((HERE / 'catalog-v1-panorama-groups.json').read_text())['groups']:
    section, ids = group['section'], group['sceneIds']
    units.append({'id': f'view-{ids[0]}', 'section': section, 'sceneIds': ids,
                  'assets': sorted({c['fileName'] for sid in ids for c in by_id[sid]['media'] if c['kind']=='PanoCast'}),
                  'kind': 'panorama', 'evidence': 'Existing reviewed panorama membership; catalog v1.'})
assert len(units) == 226
primary = defaultdict(list)
for row in rows:
    if row['type'] != 3 or row['id'] in (0,100000,100999): continue
    full = []
    for cast in row['media']:
        if cast['kind'] != 'MovieSpecialCast': continue
        d = dimensions.get(cast['fileName'], {})
        scale = cast.get('scale', 1)
        p = cast.get('location', {'x':0, 'y':0})
        if d.get('width',0)*scale >= 640 and d.get('height',0)*scale >= 400 and p['x']<=0 and p['y']<=0:
            full.append(cast)
    still = [c for c in full if c['fileName'].lower().endswith('stl')]
    held = [c for c in full if c.get('actionAtEnd') in (0,-1)]
    narrative = [c for c in full if c['fileName'].lower().endswith(('vid','mov'))]
    selected = still or held or narrative
    if selected:
        key = tuple(sorted({c['fileName'] for c in selected}))
        primary[key].append(row['id'])
for assets, ids in primary.items():
    # Never equate a shared asset rendered with another crop or frame selection.
    for asset in assets:
        presentations = {json.dumps({k:c.get(k) for k in
                         ['startFrame','endFrame','scale','location']},sort_keys=True)
                         for sid in ids for c in by_id[sid]['media']
                         if c.get('fileName') == asset}
        assert len(presentations)==1, ('Different presentations require review', asset, ids)
    sections = {by_id[x]['section'] for x in ids}
    assert len(sections)==1 and 'unassigned' not in sections
    units.append({'id': f'content-{ids[0]}','section':sections.pop(),'sceneIds':ids,
                  'assets':list(assets),'kind':'2d','evidence':'Original dimensions and authored placement fill the stage; same primary asset, crop/placement, scale and frame range across scene/state records; repeated controls are item states under the reviewed policy. Apply explicit family overrides below. Active content must actually be presented.'})

def merge(anchors, name, evidence):
    global units
    matches=[u for u in units if set(u['sceneIds']) & set(anchors)]
    assert matches, (name, anchors)
    sections={u['section'] for u in matches}; assert len(sections)==1
    combined={'id':name,'section':sections.pop(),'sceneIds':sorted({x for u in matches for x in u['sceneIds']}),
              'assets':sorted({x for u in matches for x in u['assets']}),'kind':'reviewed-family','evidence':evidence}
    units=[u for u in units if u not in matches]+[combined]

def alias(anchor, extra, evidence):
    matches=[u for u in units if anchor in u['sceneIds']];assert len(matches)==1
    existing={x for u in units for x in u['sceneIds']}
    assert not (set(extra)&existing), extra
    matches[0]['sceneIds']=sorted(set(matches[0]['sceneIds']+extra))
    matches[0]['evidence']+=' '+evidence

# User-approved scope: one view of each item/puzzle, no mandatory state permutations.
merge([7030,7040,7050,7060,7130,7237,7238,*range(7020,7030),*range(7070,7080),*range(7090,7100)],
      'island-platform-puzzle','User: no requirement to change lightning or visit every platform. Authored C1/C2/A/B/C/D/E network and flat platform depictions form one puzzle family.')
for pair in [[2090,2091],[2095,2096]]:
    merge(pair,f'cargo-deck-{pair[0]}','User excludes mandatory closed-hold view. Authored cargoE/ohcargE and cargoW/ohcargW are matching closed/open deck viewpoints; east and west stay distinct.')
merge([760050,790010,790019,790029], 'palace-bird-cage','User: cage viewed once; no pre/post-feather requirements. Cage, mechanical/live bird and completion presentation are one family.')
alias(790010,[790035], 'The authored third bird movie is followed by the return sequence; qualifies only on actual visible presentation, not a completion flag.')
# One visual area across control states; do not merge different engine areas.
merge([413045,413050], 'engine-injector','User: traverse the route, not every combination. inject1/inject2 are outbound/return presentations of the injector area.')
merge([421011,421550], 'solar-controls','Same solar panel in lit/dark operating states; reviewed no-state-permutation rule.')
for anchors,name in [
 ([123611,123613],'dining-cigar-box'),([302070,302072],'temperature-panel'),
 ([306050,306072],'influxor'),([308020,308050],'scarab-viewer'),
 ([311021,311023,311025,311028,311031,311034],'malherbe-journal'),
 ([311060,311061],'malherbe-serum'),([321050,321053],'thermon-trunk'),
 ([321070,321072],'thermon-serum'),([331030,*range(331031,331041)],'swan-scrapbook'),
 ([331052,331053],'swan-serum'),([341050,341052],'mexler-serum'),
 ([351050,351052],'galte-serum'),([362050,362052,362055,362058],'moon-diary'),
 ([808052,808054],'trailer-suitcase'),([862049,862051],'telephone'),
 ([880050,880051],'muffler-view'),
 ([252030,252035,252040],'gym-display'),
 ([382005,382006,382058],'kinetoscope'),([890050,890060],'frozen-explorer'),
 ([*range(890071,890080)],'expedition-journal'),
 ([807051,807053,807054],'mermaid-exhibit'),([807055,807057,807059,807060],'brain-exhibit'),
 ([807056,807061,807063],'electric-man-exhibit')]:
    merge(anchors,name,'User-reviewed once-per-item/functional-state rule. Authored linked views/pages are the same item; other independent items remain separate. Carnival exhibit boundaries additionally inspected visually.')
# The viewer's alternate films are the same once-viewed apparatus, not extra pages.
alias(382005,[382046,382049,382055], 'Authored viewer states select these films and return to the same room; once-per-exhibit rule.')
alias(391056,[391054], 'Authored ecki1a presentation ends at the same observation content screen.')
alias(391058,[391057], 'Authored ecki2a presentation ends at the same note content screen.')
# A portrait is an explicit narrower standalone-view exception to review.
units.append({'id':'billy-portrait','section':'carnival','sceneIds':[807071],
              'assets':['GameDB/carnival/807071STL'],'kind':'2d',
              'evidence':'REVIEW EXCEPTION: dedicated entered still-view scene, 300x400 at x=230. Not a full-width cast; recommend one portrait item rather than dropping authored content on an image-width technicality.'})
for sid,label in [(362065,'moon-apparition'),(534050,'neuro-swoon')]:
    unit_assets=[c['fileName'] for c in by_id[sid]['media'] if c['kind']=='MovieSpecialCast' and not c['fileName'].lower().endswith(('tom','nar','msc'))]
    units.append({'id':label,'section':'ship','sceneIds':[sid],'assets':unit_assets,'kind':'2d',
                  'evidence':'Distinct narrative presentation, not travel or a failed puzzle branch. Authored SPC movie and source-frame inspection.'})
# Conditional shack selection cannot award all three interiors from one scene ID.
shack_router=[u for u in units if 710050 in u['sceneIds']];assert len(shack_router)==1
units.remove(shack_router[0])
for anchor,asset in [(708010,'shack1STL'),(708020,'shack2STL'),(708030,'shack3STL')]:
    u=next(u for u in units if anchor in u['sceneIds'])
    u['conditionalObservations']=[{'sceneId':710050,'visibleAsset':'GameDB/Voodoo/'+asset}]
    u['evidence']+=' Scene 710050 selects among interiors; only its actually presented matching cast qualifies.'
# Explicitly retain separately entered narrative finale, while credits remain completion only.
units.append({'id':'ending-sequence','section':'ending','sceneIds':[895050],'assets':['GameDB/iceNchat/endseqSPC'],'kind':'2d','evidence':'Authored narrative finale; credits are separate completion evidence and not discovery units.'})
units.sort(key=lambda x:(x['section'],min(x['sceneIds'])))
seen={}
for unit in units:
    for sid in unit['sceneIds']:
        assert sid not in seen,(sid,seen.get(sid),unit['id'])
        seen[sid]=unit['id']
review=[]
for row in rows:
    if row['id'] in seen:continue
    if row['id']==710050:reason='conditional-observation'; detail='One of three shack interiors; match visible cast, never award all.'
    elif row['type'] in (5,6,7) or row['id'] in (0,100000,100999):reason='excluded';detail='System/title/intro/credits; ending credit IDs remain completion evidence.'
    elif row['type']==1:raise AssertionError(('Unmapped panorama',row['id']))
    else:
        reason='excluded'
        files=[c['fileName'] for c in row['media'] if c['kind']=='MovieSpecialCast' and not c['fileName'].lower().endswith(('tom','nar','msc'))]
        if files and all(f.lower().endswith('trn') for f in files):
            detail='Authored travel transition with automatic destination; no independent content unit.'
        elif not files:
            detail='Audio/actions only; no new independently presented visual content.'
        elif row['id'] in [105022,105026,105029,105032,105038,105042,105045,105048]:
            detail='Flare-shot outcome/angle animation; user excludes requiring misses or each firing configuration.'
        elif row['id'] in [790015,790025,790036,790039,790049]:
            detail='Intermediate feather/bird or dream-return animation; no separate cage requirement.'
        else:
            detail='Authored motion/control/dissolve/open-close/return animation within already counted content, or a partial overlay. No additional discovery unit under the reviewed no-combination rule.'
    review.append({'sceneId':row['id'],'disposition':reason,'reason':detail})
result={'status':'proposed-recount-awaiting-review-not-runtime-catalog','mapDigest':'8504cc0dc7f18afe3f77c1b13c553a3bd040993158aef92fe4f848dfb54cc094',
        'sectionTotals':dict(Counter(u['section'] for u in units)),'total':len(units),'units':units,'otherScenes':review}
(HERE/'counting-proposal.json').write_text(json.dumps(result,indent=2)+'\n')
print(result['total'],result['sectionTotals'])
print('Authored scenes accounted for:',len(seen)+len(review)); assert len(seen)+len(review)==1844

with (HERE/'proposed-units.md').open('w') as f:
    f.write('# Proposed discovery units — review only\n\n518 units, including the recommended standalone portrait exception. See README.md for rules, totals and limitations. No runtime imports this list.\n')
    for section in ['ship','voodoo','harem','waterfront','carnival','ending']:
        f.write(f'\n## {section}\n\n| Unit | Qualifying scene IDs | Authored primary assets |\n| --- | --- | --- |\n')
        for u in units:
            if u['section'] == section:
                f.write('| '+u['id']+' | '+', '.join(map(str,u['sceneIds']))+' | '+', '.join(u['assets'])+' |\n')
