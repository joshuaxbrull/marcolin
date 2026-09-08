"""Check every current directory address against the US Census geocoder.

This checks street-address coordinates, not whether a business is open or stocks frames.
Results never change the manager's directory automatically.
"""
import csv, io, json, math
from pathlib import Path
import requests

rows = json.loads(Path('harleydavidson/data/locations.json').read_text())
out = io.StringIO()
writer = csv.writer(out)
for loc in rows:
    writer.writerow([loc['id'], loc['address'], loc['city'], loc['state'], ''])
response = requests.post('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', data={'benchmark': 'Public_AR_Current'}, files={'addressFile': ('locations.csv', out.getvalue(), 'text/csv')}, timeout=180)
response.raise_for_status()
result = []
by_id = {str(row['id']): row for row in rows}
for fields in csv.reader(io.StringIO(response.text)):
    if not fields or fields[0] not in by_id:
        continue
    old = by_id[fields[0]]
    record = {'id': old['id'], 'name': old['name'], 'match': fields[2], 'originalCoordinates': [old['lng'], old['lat']]}
    if len(fields) >= 6 and fields[2] == 'Match':
        lng, lat = map(float, fields[5].split(','))
        distance = math.hypot((lat-old['lat'])*69, (lng-old['lng'])*69*math.cos(math.radians(lat)))
        record.update({'matchedAddress': fields[4], 'censusCoordinates': [lng,lat], 'differenceMiles': round(distance,3), 'needsPinReview': distance > .25})
    else:
        record['needsPinReview'] = True
    result.append(record)
Path('docs/address-audit.json').write_text(json.dumps({'checkedAt': '2026-09-08', 'source': 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch', 'records': result}, indent=2)+'\n')
print(f'Checked {len(result)} addresses; {sum(r["needsPinReview"] for r in result)} need manual pin review.')
for row in result:
    if row['needsPinReview']:
        print(row)
