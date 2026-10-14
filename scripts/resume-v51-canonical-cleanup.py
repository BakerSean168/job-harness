#!/usr/bin/env python3
"""Retire obsolete Job Harness resume versions without losing application evidence.

Transactional production maintenance; run 'check' first, then 'commit' exactly once.
Usage:
    python3 scripts/resume-v51-canonical-cleanup.py check --db /data/job-harness.db
    python3 scripts/resume-v51-canonical-cleanup.py commit --db /data/job-harness.db --manifest /data/...
No application, submission intent, artifact referenced by an application,
historic revision of a retained profile, or campaign automation setting is discarded.
"""
import argparse
import datetime
import hashlib
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

KEEP = frozenset([
    'ai-frontend-v5-1', 'ai-fullstack-v5-1',
    'ai-agent-app-v5-1', 'ai-fullstack-agent-v5-1',
])
PROTECTED = frozenset([
    'ai-frontend', 'ai-fullstack', 'ai-agent-app',
    'ai-agent-dongxu', 'ai-agent-forgeflow',
])
EXPECTED_VERSION = 17
EXPECTED_PROFILE_COUNT = 30
CAMPAIGN_IDS = frozenset(['2026-grad-agent-fullstack-frontend', 'internship-ai-agent-fullstack'])
NEW_CAMPAIGN_PROFILES = [
    'ai-agent-app-v5-1','ai-fullstack-agent-v5-1',
    'ai-fullstack-v5-1','ai-frontend-v5-1',
]
EXTRA_HIGHLIGHTS = {
    'dailyuse': frozenset([
        'v5-mf-agent-stream', 'v5-mf-powersync', 'v5-mf-contracts', 'v5-mf-context',
    ]),
    'body-sense': frozenset([
        'v5-bs-temporal-model', 'v5-bs-langgraph',
        'v5-bs-guardrail', 'v5-bs-structured-output',
    ]),
}
MEANINGFUL_TABLES = [
    'application_submissions','submission_intents','email_application_packages',
    'site_resume_bindings','applications','job_outreach_events',
]
OTHER_IMMUTABLE_TABLES = ['application_events','resume_profile_refs']

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

def fetch_profiles(c):
    return {r['id']: dict(r) for r in c.execute('select * from resume_profiles')}

def inventory(c):
    out={}
    for name in ('resume_profiles','resume_revisions','resume_artifacts','applications',
                 'application_submissions','submission_intents','email_application_packages',
                 'campaigns','job_outreach_events','resume_profile_refs'):
        out[name]=c.execute('select count(*) from '+name).fetchone()[0]
    return out

def verify_project_refs(lib, profiles):
    skills={x['id'] for x in lib['skills']}
    education={x['id'] for x in lib['education']}
    certs={x['id'] for x in lib['certificates']}
    sums={x['id'] for x in lib['summaries']}
    work={x['id']:{b['id'] for b in x['bullets']} for x in lib['workExperiences']}
    project={x['id']:x for x in lib['projects']}
    for pid,row in profiles.items():
        p=json.loads(row['profile_json'])
        for key,refs in [('skillIds',skills),('educationIds',education),
                         ('certificateIds',certs),('summaryIds',sums)]:
            for id in p[key]:
                if id not in refs:raise RuntimeError(pid+' missing '+key+': '+id)
        for w in p['workSelections']:
            if w['experienceId'] not in work:raise RuntimeError(pid+' missing work')
            if not set(w['bulletIds'])<=work[w['experienceId']]:raise RuntimeError(pid+' missing bullet')
        for item in p['projectSelections']:
            r=project.get(item['projectId'])
            if not r:raise RuntimeError(pid+' missing project')
            if item['presentationId'] not in {x['id'] for x in r['presentations']}:
                raise RuntimeError(pid+' missing presentation '+item['presentationId'])
            if not set(item['highlightIds'])<={x['id'] for x in r['highlights']}:
                raise RuntimeError(pid+' missing highlight')
        for v in p['overrides']:
            if v['kind']=='skill' and v['skillId'] not in skills:raise RuntimeError(pid+' bad skill override')
            if v['kind']=='summary' and v['summaryId'] not in sums:raise RuntimeError(pid+' bad summary override')
            if v['kind']=='work-bullet' and v['bulletId'] not in work.get(v['experienceId'],set()):
                raise RuntimeError(pid+' bad work override')
            if v['kind']=='project-highlight' and v['highlightId'] not in {
                h['id'] for h in project[v['projectId']]['highlights']
            }:raise RuntimeError(pid+' bad highlight override')

def prepare(c):
    original=fetch_profiles(c)
    if len(original)!=EXPECTED_PROFILE_COUNT or not KEEP|PROTECTED<=set(original):
        raise RuntimeError('Unexpected profile count or missing canonical/historical identities')
    remove=set(original)-KEEP-PROTECTED
    if len(remove)!=21:raise RuntimeError('Expected 21 unreferenced historical profiles')
    if set(row[0] for row in c.execute('select id from campaigns'))!=CAMPAIGN_IDS:
        raise RuntimeError('Unexpected Campaign IDs')
    original_library_row=c.execute("select * from resume_libraries where id='primary'").fetchone()
    if original_library_row is None or original_library_row['version']!=EXPECTED_VERSION:
        raise RuntimeError('Unexpected shared ResumeLibrary version')
    base=json.loads(original_library_row['document_json'])
    assert base['version']==EXPECTED_VERSION
    if any(original[k]['archived_at'] for k in KEEP):raise RuntimeError('Canonical profile archived')
    for k in PROTECTED:
        if original[k]['archived_at'] is not None:continue
        if original[k]['version']<1:raise RuntimeError('Invalid archival version')
    immutable=[r['id'] for r in c.execute(
        'select id from resume_revisions where profile_id in ('+','.join('?' for _ in remove)+')',
        sorted(remove))]
    if not immutable:raise RuntimeError('Expected historical revisions to delete')
    revision_ids=set(immutable)
    art_rows=[dict(x) for x in c.execute(
        'select id,revision_id,storage_uri,sha256,byte_size from resume_artifacts where revision_id in ('+
        ','.join('?' for _ in immutable)+')',
        immutable)]
    artifact_ids={x['id'] for x in art_rows}
    # Protect every real submission, unexecuted intent, email draft, and outreach
    # from losing their original 'used resume' provenance.
    for table in MEANINGFUL_TABLES:
        columns={r[1] for r in c.execute('pragma table_info('+table+')')}
        for col in ('resume_profile_id','profile_id','resume_revision_id','resume_artifact_id'):
            if col not in columns:continue
            expected={'resume_profile_id':remove,'profile_id':remove,
                      'resume_revision_id':revision_ids,'resume_artifact_id':artifact_ids}[col]
            if not expected:continue
            num=c.execute('select count(*) from '+table+' where '+col+' in ('+
                          ','.join('?' for _ in expected)+')',list(expected)).fetchone()[0]
            if num:raise RuntimeError('Would destroy referenced evidence: '+table+'.'+col+' '+str(num))
    active_rows=[dict(r) for r in c.execute('select id,status,resume_profile_ids_json,automation_json from campaigns')]
    for cr in active_rows:
        prior=json.loads(cr['resume_profile_ids_json'])
        if not prior or not set(prior)<=PROTECTED:raise RuntimeError('Unexpected campaign role list')
    result_lib=json.loads(original_library_row['document_json'])
    preserved={pid:original[pid] for pid in KEEP|PROTECTED}
    selected_skills=set()
    selected_summary=set()
    selected_bullets=defaultdict(set)
    selected_presentations=defaultdict(set)
    selected_highlights=defaultdict(set)
    for r in preserved.values():
        doc=json.loads(r['profile_json'])
        selected_skills.update(doc['skillIds'])
        selected_summary.update(doc['summaryIds'])
        for v in doc['overrides']:
            if v['kind']=='skill':selected_skills.add(v['skillId'])
            elif v['kind']=='summary':selected_summary.add(v['summaryId'])
            elif v['kind']=='work-bullet':selected_bullets[v['experienceId']].add(v['bulletId'])
            elif v['kind']=='project-highlight':selected_highlights[v['projectId']].add(v['highlightId'])
        for x in doc['workSelections']:
            selected_bullets[x['experienceId']].update(x['bulletIds'])
        for x in doc['projectSelections']:
            selected_presentations[x['projectId']].add(x['presentationId'])
            selected_highlights[x['projectId']].update(x['highlightIds'])

    seen_skills={x['id'] for x in result_lib['skills']}
    if not selected_skills<=seen_skills:raise RuntimeError('Missing selected skills in original')
    before={
        'skills':len(result_lib['skills']),'summaries':len(result_lib['summaries']),
        'presentations':sum(len(x['presentations']) for x in result_lib['projects']),
        'highlights':sum(len(x['highlights']) for x in result_lib['projects']),
    }
    result_lib['skills']=[x for x in result_lib['skills'] if x['id'] in selected_skills]
    result_lib['summaries']=[x for x in result_lib['summaries'] if x['id'] in selected_summary]
    for project in result_lib['projects']:
        id=project['id']
        if id in ('dailyuse','body-sense'):
            project['presentations']=[p for p in project['presentations']
                                      if p['id'] in selected_presentations[id]]
            high=selected_highlights[id] | EXTRA_HIGHLIGHTS[id]
            if not high<={x['id'] for x in project['highlights']}:
                raise RuntimeError('Missing curated alternative '+id)
            project['highlights']=[p for p in project['highlights'] if p['id'] in high]
        # Preserve all other project facts, including ForgeFlow archived evidence.
    for work in result_lib['workExperiences']:
        if work['id']=='krjx':
            # Remove exact same obsolete alternative already covered by collab-fs.
            work['bullets']=[b for b in work['bullets'] if b['id'] in selected_bullets[work['id']]]
    result_lib['version']=EXPECTED_VERSION+1
    result_lib['updatedAt']=stamp()
    verify_project_refs(result_lib,preserved)
    after={
        'skills':len(result_lib['skills']),'summaries':len(result_lib['summaries']),
        'presentations':sum(len(x['presentations']) for x in result_lib['projects']),
        'highlights':sum(len(x['highlights']) for x in result_lib['projects']),
    }
    if after['skills']>=before['skills'] or after['presentations']>=before['presentations']:
        raise RuntimeError('Expected dedup reduction')
    return {
        'original':original,'remove':sorted(remove),'protected':sorted(PROTECTED),
        'keep':sorted(KEEP),'library':result_lib,'old_library':base,
        'artifacts_to_delete':art_rows,'revisions_to_delete':immutable,
        'campaigns':active_rows,'before':before,'after':after,
        'baseline':inventory(c),
        'baseline_library_json':original_library_row['document_json'],
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('mode',choices=('check','commit'))
    ap.add_argument('--db',required=True)
    ap.add_argument('--manifest')
    args=ap.parse_args()
    con=sqlite3.connect(args.db,timeout=30,isolation_level=None)
    con.row_factory=sqlite3.Row
    con.execute('pragma foreign_keys=ON')
    try:
        if con.execute('pragma foreign_key_check').fetchone() is not None:
            raise RuntimeError('Pre-existing foreign key violation')
        con.execute('BEGIN IMMEDIATE')
        data=prepare(con)
        stats={'profile_ids_deleted':data['remove'],'profiles_archived':data['protected'],
               'profiles_kept':data['keep'],'deleted_revisions':len(data['revisions_to_delete']),
               'deleted_artifacts':len(data['artifacts_to_delete']),
               'candidate_before':data['before'],'candidate_after':data['after'],
               'campaigns_retargeted':[c['id'] for c in data['campaigns']],
               'rows_before':data['baseline']}
        if args.mode=='check':
            con.rollback()
            print('CHECK_OK '+json.dumps(stats,ensure_ascii=False,sort_keys=True))
            return
        now=stamp()
        manifest={'timestamp':now,'db':args.db,'stats':stats,
                  'deleted_artifacts':data['artifacts_to_delete'],
                  'sha256_before_library':hashlib.sha256(
                    data['baseline_library_json'].encode('utf8')).hexdigest()}
        # Remove artifacts first due to ON DELETE RESTRICT. Actual immutable
        # PDF bytes on disk are deleted only after the main DB transaction passes.
        con.executemany('delete from resume_artifacts where id=?',[
            (x['id'],) for x in data['artifacts_to_delete']])
        con.executemany('delete from resume_revisions where id=?',[
            (x,) for x in data['revisions_to_delete']])
        con.executemany('delete from resume_profiles where id=?',[
            (x,) for x in data['remove']])
        for id in PROTECTED:
            row=data['original'][id]
            if row['archived_at']:continue
            payload=json.loads(row['profile_json'])
            payload['archivedAt']=now
            payload['updatedAt']=now
            payload['version']+=1
            con.execute(
                'UPDATE resume_profiles SET version=?,profile_json=?,updated_at=?,archived_at=? WHERE id=?',
                (payload['version'],json.dumps(payload,ensure_ascii=False,separators=(',',':')),
                 now,now,id))
        for r in data['campaigns']:
            con.execute('UPDATE campaigns SET resume_profile_ids_json=?,updated_at=? WHERE id=?',
                        (json.dumps(NEW_CAMPAIGN_PROFILES,separators=(',',':')),now,r['id']))
        lib=data['library']
        lib['updatedAt']=now
        con.execute(
            'UPDATE resume_libraries SET version=?,document_json=?,updated_at=? WHERE id=?',
            (lib['version'],json.dumps(lib,ensure_ascii=False,separators=(',',':')),now,'primary'))
        active=[r['id'] for r in con.execute('select id from resume_profiles where archived_at is null')]
        if set(active)!=KEEP:raise RuntimeError('Unexpected active Profile set after cleanup')
        left=fetch_profiles(con)
        if set(left)!=KEEP|PROTECTED:raise RuntimeError('Unexpected remaining Profile set')
        if con.execute('pragma foreign_key_check').fetchone() is not None:
            raise RuntimeError('Foreign key integrity failed after cleanup')
        if con.execute('pragma integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('SQLite integrity failed')
        after=inventory(con)
        if after['resume_profiles']!=9:raise RuntimeError('Wrong Profile count')
        if after['resume_revisions']!=data['baseline']['resume_revisions']-len(data['revisions_to_delete']):
            raise RuntimeError('Unexpected revision count')
        if after['resume_artifacts']!=data['baseline']['resume_artifacts']-len(data['artifacts_to_delete']):
            raise RuntimeError('Unexpected artifact count')
        for k in ('applications','application_submissions','submission_intents',
                  'email_application_packages','job_outreach_events'):
            if after[k]!=data['baseline'][k]:raise RuntimeError('Historic job data changed '+k)
        manifest['rows_after']=after
        if args.manifest:
            p=Path(args.manifest)
            if p.exists():raise RuntimeError('Manifest already exists, refusing overwrite')
            p.parent.mkdir(parents=True,exist_ok=True)
            # Stage immutable information BEFORE commit; if commit fails
            # cleanup requires manual recovery and the manifest stays visible.
            p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
            p.chmod(0o600)
        con.commit()
        print('COMMITTED '+json.dumps({
            **stats,'rows_after':after,'manifest':args.manifest
        },ensure_ascii=False,sort_keys=True))
    except:
        if con.in_transaction:con.rollback()
        raise
    finally:
        con.close()
if __name__=='__main__':
    main()
