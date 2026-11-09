/* First-person service shares the café wallet and only advances while open and visible. */
window.BobaService=(()=>{
  'use strict';
  const roomApi=window.BobaRoom, pourTime=3.5,lidTime=.9,ovenTime=2.8,arrivalTime=3;
  const desserts={mochi:'Strawberry mochi',taiyaki:'Custard taiyaki',roll:'Matcha roll'};
  const stages=['empty','pouring','filled','sealing','ready'];
  let app,dialog,room,state,frameId,last,saveDue,readout='',notice='',noticeUntil=0;
  const by=s=>dialog.querySelector(s),pick=a=>a[Math.floor(Math.random()*a.length)];
  const drink=id=>app.drinks.find(d=>d.id===id), orders=()=>state.orders;
  const order=id=>orders().find(o=>o.id===id), tracked=()=>order(state.selected);
  const held=()=>state.hand&&order(state.hand.id);
  const active=()=>!!(dialog?.open && state && !state.paused && !document.hidden);
  const within=(n,max)=>Number.isFinite(n)&&n>=0&&n<=max;
  const cup=()=>({stage:'empty',flavor:null,top:null,left:0});
  const fresh=()=>({version:2,paused:false,serial:0,arrival:3,selected:null,orders:[],pose:roomApi.spawn(),hand:null,job:null});
  function valid(s){
    if(!app||!s||![1,2].includes(s.version)||typeof s.paused!=='boolean'||!Number.isSafeInteger(s.serial)||s.serial<0||
       !within(s.arrival,3)||!Array.isArray(s.orders)||s.orders.length>3)return false;
    const ids=new Set(),seats=new Set();
    for(const o of s.orders){
      if(!o||!Number.isSafeInteger(o.id)||o.id<1||o.id>s.serial||ids.has(o.id)||!app.names.includes(o.name)||
        !app.coats.some(c=>c.id===o.coat)||!drink(o.drink)||(o.top!==null&&!app.tops.includes(o.top))||
        (o.dessert!==null&&!Object.hasOwn(desserts,o.dessert))||!within(o.limit,120)||o.limit<1||!within(o.left,o.limit)||
        !(s.version===1?['none','waiting','baking','done']:['none','waiting','baking','done','given']).includes(o.side)||!within(o.bake,ovenTime))return false;
      const c=o.cup;
      if(!c||!stages.includes(c.stage)||(c.flavor!==null&&!drink(c.flavor))||(c.top!==null&&!app.tops.includes(c.top))||
        !within(c.left,pourTime)||(c.stage!=='empty'&&!c.flavor))return false;
      if(s.version===2){
        if(!Number.isInteger(o.seat)||o.seat<0||o.seat>2||seats.has(o.seat)||typeof o.taken!=='boolean'||
           !['unused','hand','shelf','given'].includes(o.cupAt))return false;
        seats.add(o.seat);
      }
      ids.add(o.id);
    }
    if(s.version===1)return s.selected===null?ids.size===0:ids.has(s.selected);
    const selected=s.orders.find(o=>o.id===s.selected);
    if((s.selected!==null&&!selected?.taken)||!roomApi.bounded(s.pose))return false;
    const h=s.hand,job=s.job,heldOrder=h&&s.orders.find(o=>o.id===h.id);
    if(h!==null && (!heldOrder?.taken || !['cup','dessert'].includes(h.kind) ||
       (h.kind==='cup'?heldOrder.cupAt!=='hand':heldOrder.side!=='done')))return false;
    if(s.orders.some(o=>o.cupAt==='hand' && (h?.kind!=='cup'||o.id!==h.id)))return false;
    if(job!==null){
      const o=job&&s.orders.find(o=>o.id===job.id);
      if(!o?.taken || !(job.kind==='pour'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='pouring'||
        job.kind==='lid'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='sealing'||
        job.kind==='dessert'&&!h&&o.side==='baking'))return false;
    }
    return true;
  }
  function migrate(s){
    if(s.version===2)return s;
    s.orders.forEach((o,index)=>Object.assign(o,{seat:index,taken:true,cupAt:o.cup.stage==='empty'?'unused':'shelf'}));
    return Object.assign(s,{version:2,pose:roomApi.spawn(),job:null,hand:null});
  }
  function arrive(){
    const drinks=app.drinks.filter(d=>app.state.unlocked.includes(d.id)),tops=app.tops.filter(t=>app.state.unlocked.includes(t));
    const different=drinks.filter(d=>!orders().some(o=>o.drink===d.id));
    const recipe=!state.serial?drinks[0]:pick(different.length?different:drinks);
    const id=++state.serial,seat=[0,1,2].find(n=>!orders().some(o=>o.seat===n));
    const dessert=app.state.level>=3&&(id%2===0||!orders().length)?pick(Object.keys(desserts)):null;
    const limit=(app.state.level===1?55:48)+(dessert?12:0);
    const cats=app.coats.filter(c=>!c.rare||(app.state.level>=3&&Math.random()<.15));
    orders().push({id,seat,taken:false,name:pick(app.names.filter(n=>!orders().some(o=>o.name===n))),coat:pick(cats).id,
      drink:recipe.id,top:tops.length && id%3!==0?pick(tops):null,dessert,limit,left:limit,
      side:dessert?'waiting':'none',bake:0,cup:cup(),cupAt:'unused'});
    state.arrival=arrivalTime;
  }
  function remove(id){
    state.orders=orders().filter(o=>o.id!==id);
    if(state.selected===id)state.selected=orders().find(o=>o.taken)?.id??null;
    if(state.hand?.id===id)state.hand=null;
    if(state.job?.id===id)state.job=null;
    state.arrival=Math.min(state.arrival,orders().length?1.8:1.1);
  }
  function say(text){notice=text;noticeUntil=performance.now()+3200;}
  function advance(dt){
    let changed=false;
    for(const o of [...orders()]){
      o.left=Math.max(0,o.left-dt);
      if(!o.left){remove(o.id);app.state.combo=0;say(o.name+' headed home.');changed=true;}
    }
    const job=state.job;
    if(job){
      const o=order(job.id),dessert=job.kind==='dessert';
      const left=Math.max(0,(dessert?o.bake:o.cup.left)-dt);
      if(dessert)o.bake=left;else o.cup.left=left;
      if(!left){
        if(dessert){o.side='done';state.hand={id:o.id,kind:'dessert'};}
        else o.cup.stage=job.kind==='pour'?'filled':'ready';
        state.job=null;changed=true;
        say(dessert?'Dessert boxed.':job.kind==='pour'?'Your cup is filled.':'Lid sealed.');
      }
    }
    if(orders().length<3){
      state.arrival=Math.max(0,state.arrival-dt);
      if(!state.arrival){arrive();changed=true;}
    }
    return changed;
  }
  function quest(){
    if(state.job){
      const o=order(state.job.id);
      return state.job.kind==='pour'?['tea'+o.seat,'Filling the cup']:state.job.kind==='lid'?['lid','Pressing the lid']:['dessert','Preparing '+desserts[o.dessert]];
    }
    const h=held(),o=h||tracked();
    if(h && state.hand.kind==='dessert')return ['cat'+h.seat,'Deliver '+desserts[h.dessert]+' to '+h.name];
    if(h){
      if(['empty','pouring'].includes(h.cup.stage))return ['tea'+h.seat,'Brew '+drink(h.drink).name];
      if(h.cup.stage==='filled'&&h.cup.top!==h.top)return ['top','Scoop '+app.ingredients[h.top].name];
      if(h.cup.stage!=='ready')return ['lid','Seal the cup'];
      return ['cat'+h.seat,'Give '+h.name+' the sealed drink'];
    }
    if(o && o.cupAt!=='given')return ['rack',o.cupAt==='shelf'?'Pick up '+o.name+'’s saved cup':'Pick up a cup for '+o.name];
    if(o?.dessert && o.side!=='given')return ['dessert','Prepare '+desserts[o.dessert]];
    const guest=orders().find(a=>!a.taken);
    return guest?['cat'+guest.seat,'Ask '+guest.name+' for their order']:[null,'The next guest is on the way'];
  }
  function stationName(id){
    if(!id)return '';
    if(id.startsWith('cat'))return orders().find(o=>'cat'+o.seat===id)?.name||'Guest';
    if(id.startsWith('tea'))return 'Brewer '+(Number(id.slice(3))+1);
    return {rack:'Cup shelf',top:'Boba bowl',lid:'Lid press',dessert:'Bakery'}[id];
  }
  const exists=id=>id.startsWith('cat')?orders().some(o=>'cat'+o.seat===id):id!=='dessert'||app.state.level>=3;
  function action(at){
    if(!at)return '';
    if(state.job)return '';
    const h=held(),o=tracked();
    if(at.startsWith('cat')){
      const guest=orders().find(a=>'cat'+a.seat===at);
      if(!guest)return '';
      if(!guest.taken)return 'Ask '+guest.name;
      if(h?.id===guest.id && (state.hand.kind==='dessert'||h.cup.stage==='ready'))return 'Hand to '+guest.name;
      return h?'':'Track '+guest.name+'’s order';
    }
    if(at==='rack'){
      if(h && state.hand.kind==='cup')return 'Set cup on shelf';
      if(!h&&o&&o.cupAt!=='given')return o.cupAt==='shelf'?'Pick up saved cup':'Pick up empty cup';
    }
    if(at==='dessert'&&!h&&o?.dessert&&!['none','given'].includes(o.side))return o.side==='done'?'Pick up dessert':'Make '+desserts[o.dessert];
    if(!h||state.hand.kind!=='cup')return '';
    if(at==='tea'+h.seat && ['empty','pouring'].includes(h.cup.stage))return h.cup.stage==='pouring'?'Continue brewing':'Start '+drink(h.drink).name;
    if(at==='top' && h.cup.stage==='filled' && h.top && !h.cup.top)return 'Scoop '+app.ingredients[h.top].name;
    if(at==='lid' && ['filled','sealing'].includes(h.cup.stage) && h.top===h.cup.top)return 'Press lid';
    return '';
  }
  function interact(){
    if(!active()||state.job)return;
    const at=roomApi.nearest(state.pose,exists);
    if(!action(at))return;
    const h=held(),o=tracked();
    if(at.startsWith('cat')){
      const g=orders().find(a=>'cat'+a.seat===at);
      if(!g.taken){g.taken=true;state.selected=g.id;say(g.name+'’s order is on the rail.');}
      else if(h?.id===g.id){
        if(state.hand.kind==='dessert')g.side='given';else g.cupAt='given';
        state.hand=null;
        if(g.cupAt==='given'&&(!g.dessert||g.side==='given')){
          remove(g.id);const pay=app.reward(g);say(g.name+' loved it! +$'+pay);
        }else{state.selected=g.id;say(g.name+' received the '+(g.cupAt==='given'?'drink.':'dessert.'));}
      }else{state.selected=g.id;say('Tracking '+g.name+'’s order.');}
    }else if(at==='rack'){
      if(h){h.cupAt='shelf';state.hand=null;say('Cup parked on '+h.name+'’s shelf.');}
      else{o.cupAt='hand';state.hand={kind:'cup',id:o.id};}
    }else if(at==='dessert'){
      if(o.side==='done')state.hand={kind:'dessert',id:o.id};
      else{if(o.side==='waiting')o.bake=ovenTime;o.side='baking';state.job={id:o.id,kind:'dessert'};}
    }else if(at==='top')h.cup.top=h.top;
    else if(at==='lid'){if(h.cup.stage!=='sealing')h.cup.left=lidTime;h.cup.stage='sealing';state.job={id:h.id,kind:'lid'};}
    else{if(h.cup.stage!=='pouring')h.cup.left=pourTime;h.cup.flavor=h.drink;h.cup.stage='pouring';state.job={id:h.id,kind:'pour'};}
    app.save();render();
  }
  function color(id){return id==='classic'?'#c88a60':id==='jasminemt'?'#a4bd80':id==='bsmilk'?'#ac7055':app.ingredients[drink(id).ings[0]].c;}
  function objects(){
    const items={rack:{label:'Cup shelf'},top:{label:'Boba bowl'},lid:{label:'Lid press',running:state.job?.kind==='lid'}};
    if(app.state.level>=3)items.dessert={label:'Bakery',running:state.job?.kind==='dessert'};
    for(let n=0;n<3;n++){
      const o=orders().find(a=>a.seat===n),recipe=o?.taken?drink(o.drink):null;
      items['tea'+n]={label:recipe?recipe.name:'Brewer '+(n+1),color:recipe?color(recipe.id):['#ce9974','#9fba87','#ba8068'][n],running:state.job?.kind==='pour'&&state.job.id===o?.id};
      if(o)items['cat'+n]={label:o.name,coat:o.coat,taken:o.taken};
    }
    return items;
  }
  function ticket(o){
    return '<button type="button" class="bs-ticket" data-service="track" data-id="'+o.id+'" aria-pressed="'+(state.selected===o.id)+'"><span><b>#'+String(o.id).padStart(2,'0')+' · '+o.name+'</b><i data-time="'+o.id+'"></i></span><strong>'+drink(o.drink).name+'</strong><small>'+(o.top?app.ingredients[o.top].name:'No topping')+(o.dessert?' + '+desserts[o.dessert]:'')+'</small><i class="bs-meter"><i data-patience="'+o.id+'"></i></i></button>';
  }
  function render(){
    const previous=document.activeElement?.dataset.id,taken=orders().filter(o=>o.taken);
    by('.bs-tickets').innerHTML=taken.length?taken.map(ticket).join(''):'<span class="bw-rail-empty">Walk up to a cat and ask for an order.</span>';
    if(previous)by('[data-service="track"][data-id="'+Number(previous)+'"]')?.focus({preventScroll:true});
    by('.bs-money').textContent='$'+Math.floor(app.state.money);by('.bs-level').textContent='Level '+app.state.level;
    by('.bs-pause').textContent=state.paused?'▶ Resume':'Ⅱ Pause';by('.bs-pause').setAttribute('aria-pressed',String(state.paused));
    by('.bs-work').inert=state.paused;by('.bs-paused').hidden=!state.paused;
    const h=held(),hand=by('.bw-hand');
    hand.hidden=!h;
    if(h){const dessert=state.hand.kind==='dessert';
      hand.className='bw-hand '+(dessert?'bw-h-dessert':h.cup.stage==='ready'?'bw-h-cup bw-sealed':'bw-h-cup')+(h.cup.top?' bw-topped':'');
      hand.style.setProperty('--brew',h.cup.flavor?color(h.cup.flavor):'#e3cbb943');hand.querySelector('b').textContent=h.name+' · '+(dessert?desserts[h.dessert]:h.cup.stage==='ready'?'Sealed cup':h.cup.flavor?drink(h.cup.flavor).name:'Empty cup');}
    room.paint(objects());readout='';markers();
  }
  function markers(){
    const at=roomApi.nearest(state.pose,exists),[to,title]=quest(),dir=roomApi.direction(state.pose,to),cmd=action(at);
    const job=state.job,working=job&&order(job.id),left=job&&(job.kind==='dessert'?working.bake:working.cup.left);
    let location='';
    if(dir)location=Math.abs(dir.angle)>.48?(Math.abs(dir.angle)>2.45?'Turn around':dir.angle>0?'Turn right':'Turn left'):
      dir.distance>1.62?'Walk forward':'Within reach';
    const status=performance.now()<noticeUntil?notice:'';
    const key=[at,to,title,cmd,location,dir?.distance.toFixed(1),job&&Math.ceil(left*10),status,state.paused].join('|');
    if(readout!==key){
      readout=key;const button=by('.bw-use');
      button.textContent=job?'Working…':cmd||'Interact';button.disabled=!cmd||!!job||state.paused;
      button.dataset.near=at||'';by('.bw-step').textContent=title;
      by('.bw-way').textContent=job?'Stay at the machine · '+left.toFixed(1)+'s':(dir?location+' · '+dir.distance.toFixed(1)+' m':'');
      by('.bw-job').hidden=!job;
      if(job){const duration=job.kind==='dessert'?ovenTime:job.kind==='lid'?lidTime:pourTime;by('.bw-job i').style.width=(100*(1-left/duration))+'%';}
      by('.bs-msg').textContent=status;
    }
    const p=state.pose, map=by('.bw-map'),dot=by('.bw-player'),goal=by('.bw-dest');
    dot.style.left=((p.x+4.65)/9.3*100)+'%';dot.style.top=((p.z+3.35)/6.7*100)+'%';dot.style.transform='translate(-50%,-50%) rotate('+p.yaw+'rad)';
    const dst=roomApi.spot(to);goal.hidden=!dst;
    if(dst){goal.style.left=((dst.x+4.65)/9.3*100)+'%';goal.style.top=((dst.z+3.35)/6.7*100)+'%';}
    map.setAttribute('aria-label','Floor map'+(to?', destination '+stationName(to):''));
  }
  function heartbeat(now){
    if(!dialog.open)return;
    const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
    if(active()){
      room.frame(dt);
      if(advance(dt)){app.save();render();}
      markers();
      for(const o of orders()){
        const meter=by('[data-patience="'+o.id+'"]'),time=by('[data-time="'+o.id+'"]');
        if(meter)meter.style.transform='scaleX('+o.left/o.limit+')';if(time)time.textContent=Math.ceil(o.left)+'s';
      }
      if(now>=saveDue){app.save();saveDue=now+1000;const w=document.getElementById('saveWarning');by('.bs-save-warning').textContent=w.hidden?'':w.textContent;}
    }
    frameId=requestAnimationFrame(heartbeat);
  }
  function pause(){state.paused=!state.paused;room.clear();last=performance.now();app.save();render();}
  function open(){
    if(dialog.open)return;app.enter();state=app.state.cafeService;
    state=app.state.cafeService=valid(state)?migrate(state):fresh();if(!orders().length&&!state.paused)arrive();
    dialog.showModal();room.clear();room.resize();room.frame(0);notice='';noticeUntil=0;render();app.save();by('.bw-view').focus({preventScroll:true});
    last=performance.now();saveDue=last+1000;cancelAnimationFrame(frameId);frameId=requestAnimationFrame(heartbeat);
  }
  function init(config){
    app=config;dialog=document.getElementById('bobaService');
    dialog.innerHTML='<header class="bs-head"><div class="bs-brand"><span aria-hidden="true">☾</span><div><small>Midnight Paws</small><h1>Boba café</h1></div></div><div class="bs-head-actions"><div class="bs-stats"><b class="bs-money"></b><span class="bs-level"></span></div><button class="bs-pause" data-service="pause" type="button"></button><button class="bs-exit" data-service="close" type="button">Menu</button></div></header>'+
    '<main class="bs-work"><div class="bw-view" tabindex="0" aria-label="First-person café. Use W A S D to walk, drag or use left and right arrows to look, and E to interact."></div><section class="bw-rail"><h2>Order rail</h2><div class="bs-tickets"></div></section><div class="bw-map" role="img"><i class="bw-player"></i><i class="bw-dest"></i></div><i class="bw-reticle" aria-hidden="true"></i>'+
    '<div class="bw-hand" hidden><div class="bw-held-art"><i></i><i></i></div><b></b></div><div class="bw-controls"><div class="bw-joystick" aria-label="Movement stick"><i></i></div><div class="bw-guide"><strong class="bw-step"></strong><small class="bw-way"></small><i class="bw-job" hidden><i></i></i><small class="bs-msg" role="status"></small></div><button class="bw-use" type="button" data-service="use"></button></div>'+
    '<div class="bw-legend"><span class="bw-desktop-keys">WASD walk · Drag / ← → look · E interact</span><span class="bw-mobile-keys">Move with the stick · Drag to look</span><span class="bw-turns"><button type="button" data-service="left" aria-label="Turn left">↶</button><button type="button" data-service="right" aria-label="Turn right">↷</button></span></div></main>'+
    '<aside class="bs-paused" hidden><div><span>☾</span><h2>Café paused</h2><p>Your cats and machines will wait.</p><button type="button" data-service="pause">Resume shift</button></div></aside><div class="bs-save-warning" role="alert"></div>';
    room=roomApi.create(by('.bw-view'),{state:()=>state,running:active,portrait:app.portrait,joystick:by('.bw-joystick')});
    let touchUseAt=-Infinity;
    by('.bw-use').addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch'||e.currentTarget.disabled)return;
      e.preventDefault();touchUseAt=performance.now();interact();
    });
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('[data-service]');if(!b||b.disabled)return;
      const id=b.dataset.service;
      if(id==='pause')pause();else if(id==='close'){app.save();dialog.close();}
      else if(active()){
        if(id==='use'){if(!e.detail||performance.now()-touchUseAt>650)interact();}
        else if(id==='track'&&order(Number(b.dataset.id))?.taken){state.selected=Number(b.dataset.id);app.save();render();}
        else if(id==='left'||id==='right'){room.turn(id==='left'?-Math.PI/8:Math.PI/8);room.frame(0);markers();}
      }
    });
    window.addEventListener('keydown',e=>{
      if(!dialog.open||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,[contenteditable=true]'))return;
      if(e.code==='KeyE'){e.preventDefault();interact();}else if(e.code==='KeyP'){e.preventDefault();pause();}
    });
    dialog.addEventListener('cancel',e=>{e.preventDefault();pause();});
    dialog.addEventListener('close',()=>{cancelAnimationFrame(frameId);room.clear();app.save();app.exit();});
    document.addEventListener('visibilitychange',()=>{if(dialog.open){room.clear();last=performance.now();if(document.hidden)app.save();}});
    window.addEventListener('pagehide',()=>{if(dialog.open)app.save();});
  }
  return {init,open,valid};
})();
