"""Planeja consultas limitadas a termos equivalentes e áreas dentro do município."""
from collections import defaultdict
from contextlib import closing
import hashlib
import json
import math
import sqlite3

from .models import normalized
from .network import SourceError
from .osm_index import point_in_geometry


VARIANTS = [
    ({"barbearia","barbearias","barbeiro","barbeiros","barbershop"},["barbershop","barbeiro"]),
    ({"dentista","dentistas","odontologia","clinica odontologica"},["dentista","clínica odontológica"]),
    ({"veterinario","veterinarios","clinica veterinaria"},["veterinário","clínica veterinária"]),
    ({"contador","contadores","contabilidade"},["contador","escritório de contabilidade"]),
    ({"academia","academias"},["academia","centro fitness"]),
    ({"imobiliaria","imobiliarias"},["imobiliária","agência imobiliária"]),
]


def distance(left,right):
    lat=(left[0]+right[0])/2
    return math.hypot((left[0]-right[0])*111,(left[1]-right[1])*111*math.cos(math.radians(lat)))


def area_anchors(location,index_path):
    center=(float(location['lat']),float(location['lon']))
    geometry=location['geojson'];points=[]
    if index_path and index_path.is_file():
        try:
            south,north,west,east=map(float,location['boundingbox'])
            with closing(sqlite3.connect(index_path.resolve().as_uri()+'?mode=ro',uri=True)) as db:
                rows=db.execute('select lat,lon from points where lat between ? and ? and lon between ? and ? limit 2500',(south,north,west,east))
                points=[(lat,lon) for lat,lon in rows if point_in_geometry(lon,lat,geometry)]
        except (sqlite3.Error,OSError,KeyError,TypeError,ValueError,SourceError):
            points=[]
    clusters=defaultdict(list)
    lat_step=2/111
    lon_step=2/(111*max(0.2,math.cos(math.radians(center[0]))))
    for lat,lon in points:
        clusters[(round((lat-center[0])/lat_step),round((lon-center[1])/lon_step))].append((lat,lon))
    choices=[]
    for cluster in sorted(clusters.values(),key=len,reverse=True):
        average=(sum(p[0] for p in cluster)/len(cluster),sum(p[1] for p in cluster)/len(cluster))
        choices.append(min(cluster,key=lambda point:distance(point,average)))
    # Sem base local, utiliza pontos próximos do centro, sempre dentro do polígono.
    choices += [(center[0]+dy*lat_step,center[1]+dx*lon_step) for dy,dx in ((0,1),(1,0),(0,-1),(-1,0),(1,1),(-1,-1))]
    result=[]
    for point in choices:
        if point_in_geometry(point[1],point[0],geometry) and all(distance(point,other)>=1.5 for other in [center,*result]):
            result.append(point)
        if len(result)==6:break
    return result


def plan_queries(request,location,index_path,max_queries):
    center=(float(location['lat']),float(location['lon']))
    terms=[request.segment]
    for aliases,alternatives in VARIANTS:
        if normalized(request.segment) in aliases:
            terms += alternatives
            break
    unique=[]
    for term in terms:
        if normalized(term) not in {normalized(value) for value in unique}:unique.append(term)
    proposals=[(unique[0],center,'Centro da busca',15)]
    if request.search_mode=='expanded':
        if len(unique)>1:proposals.append((unique[1],center,'Variação do segmento',15))
        for index,point in enumerate(area_anchors(location,index_path)):
            proposals.append((unique[index%len(unique)],point,f'Área {index+1}',17))
        if len(unique)>2:proposals.append((unique[2],center,'Outra variação do segmento',15))
    result=[]
    for term,point,label,zoom in proposals[:max_queries]:
        coordinates=f'{point[0]:.6f},{point[1]:.6f}'
        identity=hashlib.sha256(json.dumps([term,coordinates,zoom],ensure_ascii=False).encode()).hexdigest()[:20]
        result.append({'id':identity,'term':term,'coordinates':coordinates,'label':label,'zoom':zoom,'status':'queued'})
    return result
