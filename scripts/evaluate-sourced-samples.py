"""Evaluate frozen, redacted excerpts against an explicitly chosen demo API.

No provider credentials are read here. Benign controls run separately in rules
mode through the same engine and are never combined into a real-world accuracy.
"""
import argparse
import datetime
import hashlib
import json
import statistics
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8000')
parser.add_argument('--out', default='output/evaluation/sourced-local')
args = parser.parse_args()
out = ROOT / args.out
out.mkdir(parents=True, exist_ok=True)
corpus_path = ROOT / 'docs/sourced-samples.json'
corpus = json.loads(corpus_path.read_text())
rows = []
for sample in corpus['samples']:
    payload = {'text': sample['text'], 'lang': sample['lang']}
    request = urllib.request.Request(args.base_url.rstrip('/') + '/analyze',
        data=json.dumps(payload).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            result = json.load(response)
        (out / (sample['id'] + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        expected = sample['expected_entities']
        observed = {e['kind'] + ':' + e['value_hash'] for e in result['entities']}
        matched = sum(e['kind'] + ':' + hashlib.sha256(e['canonical'].encode()).hexdigest() in observed for e in expected)
        row = {'id': sample['id'], 'title': sample['title'], 'expected_type': sample['expected_type'],
            'actual_type': result['scam_type'], 'type_match': result['scam_type'] == sample['expected_type'],
            'verdict': result['verdict'], 'score': result['score'], 'warning': result['score'] >= 30,
            'mode': result['mode'], 'duration_ms': result['duration_ms'],
            'expected_entities': len(expected), 'matched_entities': matched,
            'unexpected_entities': max(0, len(observed) - matched),
            'agent': result['agent'], 'result_file': sample['id'] + '.json'}
    except Exception as error:
        # Avoid exporting response bodies or keys when a hosted request fails.
        row = {'id': sample['id'], 'error': type(error).__name__,
               'http_status': getattr(error, 'code', None)}
    rows.append(row)
    (out / 'progress.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: row.get(k) for k in ('id', 'actual_type', 'verdict', 'score', 'mode', 'error') if k in row}), flush=True)

script = """import {analyze} from './lib/engine.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const rows=[];for(const sample of JSON.parse(input)){
const r=await analyze({text:sample.text,lang:sample.lang},{});
rows.push({id:sample.id,verdict:r.verdict,score:r.score,warning:r.score>=30,mode:r.mode});}
process.stdout.write(JSON.stringify(rows));"""
run = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT,
    input=json.dumps(corpus['synthetic_benign_controls']), text=True, capture_output=True, check=True)
controls = json.loads(run.stdout)
completed = [r for r in rows if 'error' not in r]
summary = {
    'evaluated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'base_url': args.base_url, 'public_deployment': not args.base_url.startswith(('http://127.0.0.1', 'http://localhost')),
    'corpus_sha256': hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
    'source_reported_samples': len(rows), 'completed_samples': len(completed),
    'taxonomy_matches': sum(r['type_match'] for r in completed),
    'warnings_at_score_30': sum(r['warning'] for r in completed),
    'strong_verdicts_at_score_60': sum(r['score'] >= 60 for r in completed),
    'expected_indicator_count': sum(r['expected_entities'] for r in completed),
    'matched_indicator_count': sum(r['matched_entities'] for r in completed),
    'unexpected_indicator_count': sum(r['unexpected_entities'] for r in completed),
    'median_live_analysis_seconds': round(statistics.median(r['duration_ms'] for r in completed) / 1000, 2) if completed else None,
    'synthetic_benign_controls': controls,
    'benign_control_warning_count': sum(r['warning'] for r in controls),
    'samples': rows,
    'limits': [
        'Five selected historical excerpts with source-dependent labels; no population accuracy or recovery claim.',
        'English inputs include an English translation of a Hindi message; no independent real Hindi or Marathi scam evaluation.',
        'Contact redaction and excerpting remove risk evidence; only one usable URL host remains, so indicator recall has a denominator of one.',
        'Scam and warning thresholds are frozen at 60 and 30. The score is not a probability.',
        'Synthetic benign controls use rules mode and are reported separately from live source-reported texts.',
        'No screenshot OCR is evaluated in this run. Results are not a container, IdP or public deployment test.'
    ]
}
(out / 'report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ('samples','synthetic_benign_controls','limits')}, indent=2))
