/* Isolated prototype interactions; no API, map SDK, or persistent storage.
 * Geometry is in the illustrative SVG's coordinates. Route projection below is
 * sampled solely to demonstrate linked highlighting, not operational matching.
 */
'use strict';
const linkedWeather = [
  {id:'wx-0',title:'동부권역 · 저층 난류',kind:'weather',shape:{type:'polygon',points:[[465,58],[771,92],[742,253],[502,236]]},altitude:[1500,4000]},
  {id:'wx-1',title:'동부권역 인근 · 낙뢰',kind:'weather',shape:{type:'circle',center:[730,246],radius:51},altitude:null},
  {id:'wx-2',title:'여수공항 · 강풍 경보',kind:'weather',shape:{type:'point',point:[653,336]},altitude:null}
];
const flightAnnotations = new Map([
  ['01',[{id:'note-example-1',title:'구례 산악 구간 확인',body:'구례 인근 산악 구간의 지형과 연결된 현장도를 함께 확인합니다.',kind:'user',shape:{type:'circle',center:[602,183],radius:43},altitude:null}]]
]);
const annotationTypes = {text:'글만',point:'지점',line:'선',polygon:'구역',circle:'원'};
const prepareTextDrafts=new Map();
let linkPinned=null,linkHover=null,linkKeyboard=null,linkContext='',annotationDraft=null,annotationSequence=1;
const annotations=()=>flightAnnotations.get(current().id)||[];
const allLinked=()=>[...linkedWeather,...annotations()];
const findLinked=id=>allLinked().find(item=>item.id===id);
const activeLinkedId=()=>linkHover||linkKeyboard||linkPinned;
const svgNode=(name,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));return el};
function routeCoordinates(){
  const numbers=current().geometry.match(/[0-9]+(?:\.[0-9]+)?/g).map(Number),points=[];
  for(let i=0;i<numbers.length;i+=2)points.push([numbers[i],numbers[i+1]]);
  if(current().geometry.endsWith('Z'))points.push([...points[0]]);
  return points;
}
function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
function distanceToSegment(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  return distance(p,[a[0]+t*dx,a[1]+t*dy]);
}
function insideShape(p,shape){
  if(!shape)return false;
  if(shape.type==='point')return distance(p,shape.point)<=6;
  if(shape.type==='circle')return distance(p,shape.center)<=shape.radius;
  if(shape.type==='line')return shape.points.slice(1).some((b,i)=>distanceToSegment(p,shape.points[i],b)<=3);
  let inside=false;
  for(let i=0,j=shape.points.length-1;i<shape.points.length;j=i++){
    const a=shape.points[i],b=shape.points[j];
    if(distanceToSegment(p,a,b)<.5)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function routeIntervals(shape){
  if(!shape)return [];
  const points=routeCoordinates(),lengths=points.slice(1).map((p,i)=>distance(points[i],p)),total=lengths.reduce((a,b)=>a+b,0),intervals=[];
  let walked=0,start=null,last=0;
  lengths.forEach((length,i)=>{
    const steps=Math.max(1,Math.ceil(length/.75));
    for(let j=0;j<=steps;j++){
      const t=j/steps,p=[points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t],station=(walked+length*t)/total;
      if(insideShape(p,shape)){if(start===null)start=station;last=station}
      else if(start!==null){intervals.push([start,last]);start=null}
    }
    walked+=length;
  });
  if(start!==null)intervals.push([start,last]);
  return intervals;
}
function annotationDescription(item){
  if(!item.shape)return '글로 작성한 주의사항';
  const onRoute=routeIntervals(item.shape).length>0;
  return annotationTypes[item.shape.type]+' · '+(onRoute?(item.altitude?item.altitude.map(n=>n.toLocaleString()).join('–')+' ft AMSL':'경로 위치 연결 · 고도 미지정'):'경로 밖 · 지도에만 표시');
}
function geometryElement(shape,className='link-geometry'){
  let el;
  if(shape.type==='circle')el=svgNode('circle',{cx:shape.center[0],cy:shape.center[1],r:shape.radius});
  else if(shape.type==='point')el=svgNode('circle',{cx:shape.point[0],cy:shape.point[1],r:9});
  else el=svgNode(shape.type==='polygon'?'polygon':'polyline',{points:shape.points.map(p=>p.join(',')).join(' ')});
  el.setAttribute('class',className+(shape.type==='line'?' open-shape':''));
  return el;
}
function shapeAnchor(shape){
  if(shape.type==='circle')return [shape.center[0],shape.center[1]-shape.radius];
  if(shape.type==='point')return shape.point;
  return shape.points[0];
}
function linkedNoteCards(editable=false){
  if(!annotations().length)return '';
  return '<div class="linked-shape-list">'+annotations().map(item=>{
    const card=item.shape?'<button class="linked-card" data-link-id="'+item.id+'" aria-pressed="false"><strong>'+esc(item.title)+'</strong>'+(item.body?'<span class="linked-note-detail">'+esc(item.body)+'</span>':'')+'<small>사용자 작성 · '+esc(annotationDescription(item))+'</small></button>':'<div class="linked-card"><strong>'+esc(item.title)+'</strong><small>'+esc(item.body)+'</small></div>';
    return editable?'<div class="annotation-list-row">'+card+'<button class="btn square quiet" data-annotation-edit="'+item.id+'" aria-label="'+esc(item.title)+' 편집">'+icon('edit')+'</button></div>':card;
  }).join('')+'</div>';
}
function installMapLinks(map){
  const svg=map.querySelector(':scope > svg');if(!svg)return;
  if(!svg.dataset.defaultView)svg.dataset.defaultView=svg.getAttribute('viewBox');
  svg.setAttribute('role','group');
  svg.querySelector('.link-overlays')?.remove();
  const group=svgNode('g',{class:'link-overlays'});
  const showNotes=svg.getAttribute('aria-label').includes('와 ');
  const items=showNotes?allLinked():linkedWeather;
  items.filter(item=>item.shape).forEach((item,index)=>{
    const g=svgNode('g',{class:'map-link '+(item.kind==='user'?'user-link':'weather-link'),'data-link-id':item.id,tabindex:0,role:'button','aria-label':(item.kind==='user'?'사용자 작성: ':'기상: ')+item.title,'aria-pressed':'false'});
    if(item.shape.type==='line'){const hit=geometryElement(item.shape,'link-hit');g.append(hit)}
    g.append(geometryElement(item.shape));
    const [x,y]=shapeAnchor(item.shape),tag=svgNode('g',{class:'shape-tag'});
    const label=item.kind==='user'?'사용자 '+(index-linkedWeather.length+1):'기상 선택';
    tag.append(svgNode('rect',{x:x-5,y:y-26,width:75,height:22,rx:3}));
    const text=svgNode('text',{x:x+2,y:y-11});text.textContent=label;tag.append(text);g.append(tag);group.append(g);
  });
  svg.append(group);
  if(!map.querySelector('.link-summary')){
    const summary=document.createElement('div');summary.className='link-summary';summary.hidden=true;
    summary.innerHTML='<div><strong></strong><span></span></div><button class="btn" data-clear-link>선택 해제</button>';
    map.append(summary);
  }
}
function installProfileLinks(profileEl){
  const svg=profileEl.querySelector('svg');if(!svg)return;
  svg.setAttribute('role','group');svg.querySelector('.profile-links')?.remove();
  const compact=svg.viewBox.baseVal.width<600;
  const axis=compact?{left:52,right:493,top:31,bottom:164,step:38}:{left:55,right:825,top:36,bottom:194,step:43};
  const group=svgNode('g',{class:'profile-links'});
  allLinked().forEach(item=>{
    const intervals=routeIntervals(item.shape);if(!intervals.length)return;
    const g=svgNode('g',{class:'profile-target '+(item.kind==='weather'?'weather-profile ':'')+(!item.altitude?'position-only':''),'data-link-id':item.id,tabindex:0,role:'button','aria-label':item.title+' · '+(item.altitude?'고도 범위 연결':'고도 미지정, 위치만 연결'),'aria-pressed':'false'});
    intervals.forEach(([start,end])=>{
      const x=axis.left+start*(axis.right-axis.left),width=Math.max(5,(end-start)*(axis.right-axis.left));
      const yFor=alt=>Math.max(axis.top,Math.min(axis.bottom,axis.top+(6000-alt)*axis.step/1500));
      const y=item.altitude?yFor(item.altitude[1]):axis.top;
      const height=item.altitude?Math.max(3,yFor(item.altitude[0])-y):axis.bottom-axis.top;
      g.append(svgNode('rect',{class:'profile-band',x,y,width,height}));
      g.append(svgNode('path',{class:'profile-tick',d:'M'+x+' '+(axis.bottom-1)+'h'+width}));
      g.append(svgNode('rect',{class:'profile-hit',x:x-3,y:axis.bottom-14,width:width+6,height:18}));
    });
    group.append(g);
  });
  svg.append(group);
  if(!profileEl.querySelector('.profile-link-status')){
    const status=document.createElement('div');status.className='profile-link-status';status.hidden=true;profileEl.append(status);
  }
}
function syncLinkedSelection(){
  const active=activeLinkedId(),item=findLinked(active);
  document.querySelectorAll('[data-link-id]').forEach(el=>{
    const matches=el.dataset.linkId===active;el.classList.toggle('linked-active',matches);
    el.setAttribute('aria-pressed',String(el.dataset.linkId===linkPinned));
  });
  document.querySelectorAll('[data-link-container]').forEach(el=>el.classList.toggle('linked-active',el.dataset.linkContainer===active));
  document.querySelectorAll('.link-summary').forEach(summary=>{
    summary.hidden=!item;if(!item)return;
    summary.querySelector('strong').textContent=(linkPinned===active?'선택 고정 · ':'미리보기 · ')+item.title;
    const matches=routeIntervals(item.shape);
    summary.querySelector('span').textContent=item.kind==='user'?annotationDescription(item):(matches.length?'관련 경로 구간 강조':'현재 경로와 겹치지 않음 · 지도에 표시');
    summary.querySelector('button').hidden=!linkPinned;
  });
  document.querySelectorAll('.profile-link-status').forEach(el=>{
    const matched=item&&routeIntervals(item.shape).length>0;el.hidden=!item;
    el.textContent=!item?'':!matched?'현재 경로와 겹치지 않음':item.altitude?'선택 고도 '+item.altitude.join('–')+' ft AMSL':'위치만 연결 · 고도 미지정';
  });
}
function pinLinked(id,fromMap=false){
  linkPinned=linkPinned===id?null:id;linkHover=null;linkKeyboard=null;syncLinkedSelection();
  framePinnedLocation();
  if(fromMap&&linkPinned){
    const card=document.querySelector('button.linked-card[data-link-id="'+id+'"], .linked-title[data-link-id="'+id+'"], .compact-warning[data-link-id="'+id+'"]');
    const scroll=[card?.closest('.side-section'),card?.closest('.present-notes')].find(el=>el&&el.scrollHeight>el.clientHeight+1);
    if(scroll&&scroll.scrollHeight>scroll.clientHeight){
      const r=card.getBoundingClientRect(),s=scroll.getBoundingClientRect();
      if(r.top<s.top||r.bottom>s.bottom)scroll.scrollTop+=r.top-s.top-12;
    }
  }
}
function framePinnedLocation(){
  const shape=findLinked(linkPinned)?.shape;
  document.querySelectorAll('.map > svg[data-default-view]').forEach(svg=>{
    svg.setAttribute('viewBox',svg.dataset.defaultView);
    if(!shape)return;
    const points=shape.type==='circle'?[[shape.center[0]-shape.radius,shape.center[1]-shape.radius],[shape.center[0]+shape.radius,shape.center[1]+shape.radius]]:shape.type==='point'?[[shape.point[0]-20,shape.point[1]-20],[shape.point[0]+20,shape.point[1]+20]]:shape.points;
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),v=svg.viewBox.baseVal;
    const minX=Math.min(...xs)-24,maxX=Math.max(...xs)+24,minY=Math.min(...ys)-24,maxY=Math.max(...ys)+24;
    const ratio=svg.clientWidth/svg.clientHeight;
    const visibleW=Math.min(v.width,v.height*ratio),visibleH=Math.min(v.height,v.width/ratio);
    const cx=v.x+v.width/2,cy=v.y+v.height/2;
    if(minX>=cx-visibleW/2&&maxX<=cx+visibleW/2&&minY>=cy-visibleH/2&&maxY<=cy+visibleH/2)return;
    const left=Math.min(v.x,minX),top=Math.min(v.y,minY),right=Math.max(v.x+v.width,maxX),bottom=Math.max(v.y+v.height,maxY);
    const width=Math.max(right-left,(bottom-top)*ratio),height=width/ratio;
    svg.setAttribute('viewBox',[(left+right)/2-width/2,(top+bottom)/2-height/2,width,height].join(' '));
  });
}
function decorateLinked(){
  const context=(location.hash.slice(1).split('/')[0]||'home')+':'+current().id;
  if(context!==linkContext){linkPinned=null;linkHover=null;linkKeyboard=null;linkContext=context}
  if(linkPinned&&!findLinked(linkPinned))linkPinned=null;
  document.querySelectorAll('.alert-item').forEach(el=>{
    const heading=el.querySelector('h3');if(!heading)return;
    const text=heading.textContent,id=text.includes('낙뢰')?'wx-1':text.includes('강풍')?'wx-2':text.includes('난류')?'wx-0':null;
    if(!id)return;el.dataset.linkContainer=id;el.dataset.previewId=id;
    if(!heading.querySelector('[data-link-id]'))heading.innerHTML='<button class="linked-title" data-link-id="'+id+'" aria-pressed="false">'+esc(text)+'</button>';
  });
  document.querySelectorAll('.compact-warning').forEach(el=>{
    el.dataset.linkId='wx-0';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','권역 진입 구간 저층 난류 위치 보기');
  });
  document.querySelectorAll('.map').forEach(installMapLinks);
  document.querySelectorAll('.profile').forEach(installProfileLinks);
  const prepare=document.getElementById('prepare-note');
  if(prepare)prepare.dataset.annotationFlight=current().id;
  if(prepare&&!document.querySelector('.prepare-annotations')){
    const block=document.createElement('div');block.className='editor-block prepare-annotations';
    block.innerHTML='<div class="spread"><span class="block-label">지도에 표시하는 주의사항</span><button class="btn" data-add-annotation>'+icon('plus')+' 추가</button></div>'+linkedNoteCards(true)+'<p class="link-instructions">도형과 글을 함께 저장하면 지도·단면도·발표 화면에서 연결됩니다.</p>';
    prepare.closest('.editor-block').after(block);
  }
  syncLinkedSelection();
}

function draftPoints(shape){
  if(!shape)return [];
  if(shape.type==='point')return [[...shape.point]];
  if(shape.type==='circle')return [[...shape.center],[shape.center[0]+shape.radius,shape.center[1]]];
  return shape.points.map(p=>[...p]);
}
function openAnnotationEditor(id=null){
  const existing=annotations().find(item=>item.id===id);
  annotationDraft={
    id:existing?.id||null,type:existing?.shape?.type||(existing?'text':'circle'),
    shape:existing?.shape?structuredClone(existing.shape):null,
    points:draftPoints(existing?.shape),complete:!!existing,cursor:[500,220],keyboard:false
  };
  const tools=['text','point','line','polygon','circle'].map(type=>'<button type="button" class="btn" data-draw-type="'+type+'" aria-pressed="'+(annotationDraft.type===type)+'">'+annotationTypes[type]+'</button>').join('');
  openDialog(existing?'지도 주의사항 편집':'지도 주의사항 추가',
    '<div class="annotation-editor"><div><div class="annotation-tools" role="group" aria-label="그릴 도형">'+tools+'</div><div class="annotation-canvas" id="annotation-canvas">'+mapSvg(true)+'</div><div class="annotation-bottom"><div class="row"><button type="button" class="btn" data-draw-command="undo">한 점 취소</button><button type="button" class="btn" data-draw-command="clear">다시 그리기</button></div><button type="button" class="btn" data-draw-command="finish">도형 완료</button></div><p class="annotation-legend" id="draw-instructions"></p><p class="annotation-legend">지도에 초점을 두고 방향키로 이동 · Enter로 지점 추가</p></div>'
    +'<form id="annotation-form" class="annotation-form"><label class="field">주의사항 제목<input id="annotation-title" name="title" required maxlength="100" placeholder="예: 착륙지 주변 장애물 확인" value="'+esc(existing?.title||'')+'"></label><label class="field">설명<textarea name="body" maxlength="3000" placeholder="이 위치에서 공유할 내용을 작성하세요.">'+esc(existing?.body||'')+'</textarea></label>'
    +'<div><div class="small" style="margin-bottom:4px">고도 범위 · 선택 입력 / ft AMSL</div><div class="annotation-altitude"><label class="field">하한<input type="number" name="altMin" min="0" max="60000" step="1" placeholder="미지정" value="'+(existing?.altitude?.[0]??'')+'"></label><label class="field">상한<input type="number" name="altMax" min="0" max="60000" step="1" placeholder="미지정" value="'+(existing?.altitude?.[1]??'')+'"></label></div></div>'
    +'<div class="annotation-result" id="annotation-result" aria-live="polite"></div><p class="annotation-error" id="annotation-error" role="alert"></p><button class="btn primary" type="submit">주의사항 저장</button>'
    +(existing?'<button class="btn" type="button" data-delete-annotation="'+existing.id+'">이 주의사항 삭제</button>':'')
    +'<p class="small muted">현재 시안 탭에만 저장됩니다. 새로고침하면 초기화됩니다.</p></form></div>');
  document.getElementById('modal').classList.add('annotation-dialog');
  const svg=document.querySelector('#annotation-canvas > svg');
  svg.setAttribute('tabindex','0');svg.setAttribute('role','group');
  svg.setAttribute('aria-label','주의사항 도형 그리기. 클릭 또는 터치로 점을 추가합니다. 키보드 방향키로 이동하고 Enter로 추가할 수 있습니다.');
  svg.setAttribute('aria-describedby','draw-instructions');
  updateDraftDrawing();
}
function provisionalShape(){
  const d=annotationDraft;if(!d||d.type==='text')return null;
  if(d.complete)return d.shape;
  if(d.type==='circle'&&d.points.length)return {type:'circle',center:d.points[0],radius:distance(d.points[0],d.cursor)};
  if(d.type==='point')return d.points.length?{type:'point',point:d.points[0]}:null;
  return d.points.length?{type:d.type==='polygon'&&d.points.length>=3?'polygon':'line',points:[...d.points,...(d.points.length?[d.cursor]:[])]}:null;
}
function updateAnnotationResult(){
  const d=annotationDraft,el=document.getElementById('annotation-result');if(!d||!el)return;
  if(d.type==='text'){el.innerHTML='<strong>글로만 작성</strong><p>지도 도형 없이 주의사항 목록에 표시합니다.</p>';return}
  if(!d.complete||!d.shape){el.innerHTML='<strong>지도에 도형을 그려 주세요.</strong><p>완료하면 경로와의 연결 여부를 표시합니다.</p>';return}
  const matches=routeIntervals(d.shape),form=document.getElementById('annotation-form'),min=form.elements.altMin.value,max=form.elements.altMax.value;
  const altitude=min!==''&&max!==''?min+'–'+max+' ft AMSL':'고도 미지정 · 위치만 연결';
  el.innerHTML='<strong>'+(matches.length?'경로 '+matches.length+'개 구간과 연결':'경로 밖 · 지도에만 표시')+'</strong><p>'+(matches.length?esc(altitude):'현재 비행경로와 겹치지 않아 단면도에는 영역을 표시하지 않습니다.')+'</p>';
}
function updateDraftDrawing(){
  const d=annotationDraft,svg=document.querySelector('#annotation-canvas > svg');if(!d||!svg)return;
  svg.querySelector('.draft-overlay')?.remove();
  const group=svgNode('g',{class:'draft-overlay','aria-hidden':'true'}),shape=provisionalShape();
  if(shape)group.append(geometryElement(shape,'draft-shape'));
  d.points.forEach(p=>group.append(svgNode('circle',{class:'draft-point',cx:p[0],cy:p[1],r:5})));
  if(d.keyboard&&d.type!=='text')group.append(svgNode('path',{class:'draft-cursor',d:'M'+(d.cursor[0]-10)+' '+d.cursor[1]+'h20M'+d.cursor[0]+' '+(d.cursor[1]-10)+'v20'}));
  svg.append(group);
  const messages={text:'글만 작성합니다. 지도 도형은 저장하지 않습니다.',point:'지도에서 위치를 한 번 클릭하거나 터치하세요.',line:'선을 따라 지점을 찍은 뒤 ‘도형 완료’를 누르세요.',polygon:'구역의 꼭짓점을 3개 이상 찍은 뒤 ‘도형 완료’를 누르세요.',circle:'중심을 먼저 찍고, 가장자리를 한 번 더 찍어 원을 완성하세요.'};
  document.getElementById('draw-instructions').textContent=d.complete&&d.type!=='text'?'도형이 완료됐습니다. 다시 그리거나 주의사항을 저장하세요.':messages[d.type];
  document.querySelectorAll('[data-draw-type]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.drawType===d.type)));
  document.querySelector('[data-draw-command="finish"]').disabled=d.complete||!['line','polygon'].includes(d.type);
  document.querySelector('[data-draw-command="undo"]').disabled=!d.points.length;
  document.getElementById('annotation-error').textContent='';
  updateAnnotationResult();
}
function addDraftPoint(point){
  const d=annotationDraft;if(!d||d.type==='text'||d.complete)return;
  d.cursor=[...point];d.points.push([...point]);
  if(d.type==='point'){d.shape={type:'point',point:[...point]};d.complete=true}
  if(d.type==='circle'&&d.points.length===2){
    const radius=distance(d.points[0],d.points[1]);
    if(radius<3){d.points.pop();document.getElementById('annotation-error').textContent='원의 가장자리를 중심에서 조금 더 떨어진 곳에 찍어 주세요.';return}
    d.shape={type:'circle',center:[...d.points[0]],radius};d.complete=true;
  }
  updateDraftDrawing();
}
function pointerSvgPoint(event,svg){
  const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
  const result=point.matrixTransform(svg.getScreenCTM().inverse());
  return [result.x,result.y];
}
function finishDraft(){
  const d=annotationDraft,min=d.type==='polygon'?3:2;
  if(d.points.length<min){document.getElementById('annotation-error').textContent='지점을 '+min+'개 이상 찍어 주세요.';return}
  if(d.type==='polygon'){
    const twiceArea=Math.abs(d.points.reduce((sum,a,i)=>{const b=d.points[(i+1)%d.points.length];return sum+a[0]*b[1]-b[0]*a[1]},0));
    if(twiceArea<10){document.getElementById('annotation-error').textContent='일직선이 되지 않도록 구역의 꼭짓점을 찍어 주세요.';return}
  }
  d.shape={type:d.type,points:d.points.map(p=>[...p])};d.complete=true;updateDraftDrawing();
}

// Enhance the existing prototype while keeping A/B layouts and other screens shared.
const loungeBaseNotes=notes;
notes=function(){
  const editable=location.hash.startsWith('#flight/');
  return linkedNoteCards(editable)+loungeBaseNotes()+(editable?'<div class="linked-note-actions"><button class="btn" data-add-annotation>'+icon('plus')+' 지도 주의사항 추가</button></div>':'');
};
const loungeBaseRender=render;
render=function(){
  const oldPrepare=document.getElementById('prepare-note');
  if(oldPrepare?.dataset.annotationFlight)prepareTextDrafts.set(oldPrepare.dataset.annotationFlight,oldPrepare.value);
  loungeBaseRender();
  const prepare=document.getElementById('prepare-note');
  if(prepare&&prepareTextDrafts.has(current().id))prepare.value=prepareTextDrafts.get(current().id);
  decorateLinked();
};
const loungeBaseDialog=openDialog;
openDialog=function(title,body,footer=''){
  document.getElementById('modal').classList.remove('annotation-dialog');
  loungeBaseDialog(title,body,footer);decorateLinked();
};

document.addEventListener('pointerover',event=>{
  if(event.pointerType==='touch')return;
  const el=event.target.closest('[data-link-id],[data-preview-id]');if(!el)return;
  const id=el.dataset.linkId||el.dataset.previewId;
  const previous=event.relatedTarget instanceof Element?event.relatedTarget.closest('[data-link-id],[data-preview-id]'):null;
  if(previous&&(previous.dataset.linkId||previous.dataset.previewId)===id)return;
  linkHover=id;syncLinkedSelection();
});
document.addEventListener('pointerout',event=>{
  if(event.pointerType==='touch')return;
  const el=event.target.closest('[data-link-id],[data-preview-id]');if(!el)return;
  const next=event.relatedTarget instanceof Element?event.relatedTarget.closest('[data-link-id],[data-preview-id]'):null;
  linkHover=next?(next.dataset.linkId||next.dataset.previewId):null;syncLinkedSelection();
});
document.addEventListener('focusin',event=>{
  const el=event.target.closest('[data-link-id]');if(!el)return;
  linkKeyboard=el.dataset.linkId;syncLinkedSelection();
});
document.addEventListener('focusout',event=>{
  if(event.target.closest('[data-link-id]')){linkKeyboard=null;syncLinkedSelection()}
});
document.addEventListener('click',event=>{
  const clear=event.target.closest('[data-clear-link]');
  if(clear){linkPinned=null;linkHover=null;linkKeyboard=null;syncLinkedSelection();framePinnedLocation();return}
  const linked=event.target.closest('[data-link-id]');
  if(linked){pinLinked(linked.dataset.linkId,!!linked.closest('.map'));return}
  if(event.target.closest('[data-add-annotation]')){openAnnotationEditor();return}
  const edit=event.target.closest('[data-annotation-edit]');
  if(edit){openAnnotationEditor(edit.dataset.annotationEdit);return}
  const type=event.target.closest('[data-draw-type]');
  if(type&&annotationDraft){annotationDraft.type=type.dataset.drawType;annotationDraft.points=[];annotationDraft.shape=null;annotationDraft.complete=annotationDraft.type==='text';updateDraftDrawing();return}
  const command=event.target.closest('[data-draw-command]');
  if(command&&annotationDraft){
    if(command.dataset.drawCommand==='finish'){finishDraft();return}
    if(command.dataset.drawCommand==='clear')annotationDraft.points=[];
    else annotationDraft.points.pop();
    annotationDraft.shape=null;annotationDraft.complete=annotationDraft.type==='text';updateDraftDrawing();return;
  }
  const remove=event.target.closest('[data-delete-annotation]');
  if(remove){flightAnnotations.set(current().id,annotations().filter(item=>item.id!==remove.dataset.deleteAnnotation));closeDialog();render();notify('지도 주의사항을 삭제했습니다.');return}
  const canvas=event.target.closest('#annotation-canvas');
  if(canvas&&annotationDraft){annotationDraft.keyboard=false;addDraftPoint(pointerSvgPoint(event,canvas.querySelector('svg')))}
});
document.addEventListener('pointermove',event=>{
  const canvas=event.target.closest('#annotation-canvas');
  if(!canvas||!annotationDraft||annotationDraft.complete||event.pointerType==='touch')return;
  annotationDraft.keyboard=false;annotationDraft.cursor=pointerSvgPoint(event,canvas.querySelector('svg'));updateDraftDrawing();
});
document.addEventListener('keydown',event=>{
  const canvas=event.target.closest('#annotation-canvas');
  if(canvas&&annotationDraft){
    const moves={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]};
    if(moves[event.key]){
      event.preventDefault();const delta=moves[event.key],view=canvas.querySelector('svg').viewBox.baseVal;
      annotationDraft.cursor=[Math.max(view.x,Math.min(view.x+view.width,annotationDraft.cursor[0]+delta[0])),Math.max(view.y,Math.min(view.y+view.height,annotationDraft.cursor[1]+delta[1]))];
      annotationDraft.keyboard=true;updateDraftDrawing();return;
    }
    if(event.key==='Enter'){event.preventDefault();addDraftPoint(annotationDraft.cursor);return}
  }
  const linked=event.target.closest('[data-link-id]');
  if(linked&&linked.tagName.toLowerCase()!=='button'&&['Enter',' '].includes(event.key)){event.preventDefault();pinLinked(linked.dataset.linkId,!!linked.closest('.map'))}
  if(event.key==='Escape'&&!document.getElementById('modal').open){linkPinned=null;linkHover=null;linkKeyboard=null;syncLinkedSelection();framePinnedLocation()}
});
document.addEventListener('input',event=>{
  if(event.target.closest('#annotation-form')){document.getElementById('annotation-error').textContent='';updateAnnotationResult()}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='annotation-form')return;
  event.preventDefault();const d=annotationDraft,form=event.target,error=document.getElementById('annotation-error');
  if(!d)return;
  const title=form.elements.title.value.trim();
  if(!title){error.textContent='주의사항 제목을 입력해 주세요.';return}
  if(d.type!=='text'&&(!d.complete||!d.shape)){error.textContent='도형을 완료하거나 ‘글만’을 선택해 주세요.';return}
  const minText=form.elements.altMin.value,maxText=form.elements.altMax.value;
  let altitude=null;
  if(minText!==''||maxText!==''){
    const min=Number(minText),max=Number(maxText);
    if(minText===''||maxText===''||!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>60000||min>=max){error.textContent='고도 하한과 상한을 함께 입력하고, 상한을 더 높게 설정해 주세요.';return}
    altitude=[min,max];
  }
  const item={id:d.id||'note-'+current().id+'-'+(++annotationSequence),kind:'user',title,body:form.elements.body.value.trim(),shape:d.type==='text'?null:structuredClone(d.shape),altitude};
  const items=[...annotations()],index=items.findIndex(existing=>existing.id===item.id);
  if(index<0)items.push(item);else items[index]=item;
  flightAnnotations.set(current().id,items);closeDialog();render();linkPinned=item.shape?item.id:null;linkHover=null;linkKeyboard=null;syncLinkedSelection();framePinnedLocation();
  notify('주의사항과 지도 표시를 현재 시안에 저장했습니다.');
});
document.getElementById('modal').addEventListener('close',()=>{annotationDraft=null;document.getElementById('modal').classList.remove('annotation-dialog')});
render();
