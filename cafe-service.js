/* First-person service shares the café wallet and only advances while open and visible. */
window.BobaService=(()=>{
  'use strict';
  const roomApi=window.BobaRoom, pourTime=3.5,lidTime=.9,ovenTime=2.8,cleanTime=1.7,arrivalTime=3;
  const desserts={bao:'Steamed veggie bao',toast:'Sesame toast',onigiri:'Grilled onigiri',mochi:'Strawberry mochi',taiyaki:'Custard taiyaki',roll:'Matcha roll'};
  const roles={
    cashier:{name:'Miso',title:'Order taker',description:'Writes the front guest’s ticket.',coat:'orange',cost:12,kinds:['take']},
    cleaner:{name:'Peach',title:'Cleaner',description:'Clears used trays at the pickup pass.',coat:'calico',cost:16,kinds:['wipe']},
    barista:{name:'Nori',title:'Barista',description:'Brews, tops and seals drinks on the shelf.',coat:'black',cost:28,kinds:['brew','top','seal']},
    cook:{name:'Bao',title:'Cook',description:'Prepares hot snacks and desserts.',coat:'brown',cost:24,kinds:['cook']},
    server:{name:'Yuzu',title:'Server',description:'Carries finished items to the right guest.',coat:'white',cost:32,kinds:['serveCup','serveFood']}
  };
  const stages=['empty','pouring','filled','sealing','ready'];
  const brewers=[{label:'Tea classics',color:'#ce9974'},{label:'Jasmine & green',color:'#9fba87'},{label:'Milk blends',color:'#ba8068'}];
  const arrivals=new WeakSet();
  let app,dialog,room,state,frameId,last,saveDue,readout='',notice='',noticeUntil=0,crewOpen=false,briefing=false;
  const by=s=>dialog.querySelector(s),pick=a=>a[Math.floor(Math.random()*a.length)];
  const drink=id=>app.drinks.find(d=>d.id===id), orders=()=>state.orders;
  const order=id=>orders().find(o=>o.id===id), tracked=()=>order(state.selected);
  const held=()=>state.hand&&order(state.hand.id);
  const active=()=>!!(dialog?.open && state && !state.paused && !briefing && !crewOpen && state.shift.started && !state.shift.complete && !document.hidden);
  const within=(n,max)=>Number.isFinite(n)&&n>=0&&n<=max;
  const cup=()=>({stage:'empty',flavor:null,top:null,left:0});
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  const newShift=n=>({number:n,quota:Math.min(8,n+2),served:0,missed:0,earned:0,timely:0,complete:false,greeted:false,started:false});
  const newStaff=()=>Object.fromEntries(Object.keys(roles).map(k=>[k,{level:0,done:0,onDuty:true,task:null}]));
  const fresh=()=>({version:3,paused:false,serial:0,arrival:3,selected:null,orders:[],pose:roomApi.spawn(),hand:null,job:null,
    shift:newShift(1),dirty:[false,false,false],staff:newStaff(),career:{shifts:0,served:0,missed:0,cleaned:0}});
  const line=()=>orders().filter(o=>!o.taken);
  const tickets=()=>orders().filter(o=>o.taken);
  const seated=n=>orders().find(o=>o.taken&&o.seat===n);
  const freeSeat=()=>state.dirty.findIndex((dirty,n)=>!dirty&&!seated(n));
  const dirtyTray=()=>state.dirty.findIndex((dirty,n)=>dirty&&state.staff.cleaner.task?.seat!==n);
  const waitLimit=()=>Math.max(20,33-state.shift.number);
  const serviceLimit=o=>Math.max(45,60-state.shift.number)+(o.dessert?12:0);
  const mood=o=>o.left/o.limit<.25?'angry':o.left/o.limit<.55?'restless':'calm';
  function brewer(o){
    const ingredients=drink(o.drink).ings||[];
    if(ingredients.some(id=>['jasmine','green','matcha'].includes(id)))return 'tea1';
    if(ingredients.some(id=>['black','oolong','thai'].includes(id))||o.drink==='classic')return 'tea0';
    return 'tea2';
  }
  function sameBrewer(otherId,o){const other=order(otherId);return other&&other!==o&&brewer(other)===brewer(o);}
  function valid(s){
    if(!app||!s||![1,2,3].includes(s.version)||typeof s.paused!=='boolean'||!count(s.serial)||
       !within(s.arrival,3)||!Array.isArray(s.orders)||s.orders.length>(s.version===3?6:3))return false;
    const ids=new Set(),seats=new Set();
    for(const o of s.orders){
      if(!o||!Number.isSafeInteger(o.id)||o.id<1||o.id>s.serial||ids.has(o.id)||!app.names.includes(o.name)||
        !app.coats.some(c=>c.id===o.coat)||!drink(o.drink)||(o.top!==null&&!app.tops.includes(o.top))||
        (o.greetingQuality!==undefined&&!within(o.greetingQuality,1))||
        (o.dessert!==null&&!Object.hasOwn(desserts,o.dessert))||!within(o.limit,120)||o.limit<1||!within(o.left,o.limit)||
        !(s.version===1?['none','waiting','baking','done']:['none','waiting','baking','done','given']).includes(o.side)||!within(o.bake,ovenTime))return false;
      const c=o.cup;
      if(!c||!stages.includes(c.stage)||(c.flavor!==null&&!drink(c.flavor))||(c.top!==null&&!app.tops.includes(c.top))||
        !within(c.left,pourTime)||(c.stage!=='empty'&&!c.flavor))return false;
      if(s.version>=2){
        if(typeof o.taken!=='boolean'||!['unused','hand','shelf','given'].includes(o.cupAt))return false;
        if(s.version===3&&!o.taken){if(o.seat!==null)return false;}
        else{if(!Number.isInteger(o.seat)||o.seat<0||o.seat>2||seats.has(o.seat))return false;seats.add(o.seat);}
      }
      ids.add(o.id);
    }
    if(s.version===1)return s.selected===null?ids.size===0:ids.has(s.selected);
    const selected=s.orders.find(o=>o.id===s.selected);
    if((s.selected!==null&&!selected?.taken)||!roomApi.bounded(s.pose))return false;
    if(s.version===3){
      const f=s.shift,staff=s.staff,career=s.career;
      if(!f||!count(f.number)||f.number<1||f.quota!==Math.min(8,f.number+2)||!count(f.served)||!count(f.missed)||
         f.greeted!==undefined&&typeof f.greeted!=='boolean'||f.started!==undefined&&typeof f.started!=='boolean'||
         f.started===false&&(f.served>0||f.missed>0||f.complete||s.orders.length>0)||f.timely!==undefined&&(!count(f.timely)||f.timely>f.served)||
         !count(f.earned)||f.served+s.orders.length>f.quota||f.complete!==(f.served===f.quota)||
         !Array.isArray(s.dirty)||s.dirty.length!==3||s.dirty.some((d,i)=>typeof d!=='boolean'||d&&seats.has(i))||
         !staff||!career||!['shifts','served','missed','cleaned'].every(k=>count(career[k])))return false;
      for(const [role,def] of Object.entries(roles)){
        const w=staff[role];
        if(!w||!Number.isInteger(w.level)||!within(w.level,3)||!count(w.done)||typeof w.onDuty!=='boolean')return false;
        const t=w.task;
        if(t!==null&&(!t||!w.level||!def.kinds.includes(t.kind)||!within(t.left,12)||
          (t.kind==='wipe'?t.id!==0||!Number.isInteger(t.seat)||!s.dirty[t.seat]:!ids.has(t.id))))return false;
        if(!t)continue;
        if(!w.onDuty)return false;
        if(t.kind==='wipe')continue;
        const guest=s.orders.find(o=>o.id===t.id);
        if(t.kind==='take'){
          if(t.seat!==null||guest!==s.orders.find(o=>!o.taken))return false;
        }else if(!guest.taken||t.seat!==guest.seat)return false;
        if(role==='barista'&&(guest.cupAt!=='shelf'||guest.cup.stage!=={brew:'pouring',top:'filled',seal:'sealing'}[t.kind]))return false;
        if(t.kind==='cook'&&guest.side!=='baking'||t.kind==='serveFood'&&guest.side!=='done'||
           t.kind==='serveCup'&&(guest.cupAt!=='shelf'||guest.cup.stage!=='ready'))return false;
      }
    }
    const h=s.hand,job=s.job,heldOrder=h&&s.orders.find(o=>o.id===h.id);
    if(h!==null && (!heldOrder?.taken || !['cup','dessert'].includes(h.kind) ||
       (h.kind==='cup'?heldOrder.cupAt!=='hand':heldOrder.side!=='done')))return false;
    if(s.orders.some(o=>o.cupAt==='hand' && (h?.kind!=='cup'||o.id!==h.id)))return false;
    if(job!==null){
      if(s.version===3&&job?.kind==='clean')return !h&&Number.isInteger(job.seat)&&s.dirty[job.seat]===true&&within(job.left,cleanTime);
      const o=job&&s.orders.find(o=>o.id===job.id);
      if(!o?.taken || !(job.kind==='pour'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='pouring'||
        job.kind==='lid'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='sealing'||
        job.kind==='dessert'&&!h&&o.side==='baking'))return false;
    }
    return true;
  }
  function migrate(s){
    if(s.version===3){
      if(s.shift.greeted===undefined)s.shift.greeted=s.shift.served>0||s.orders.length>1||s.orders.some(o=>o.taken);
      if(s.shift.started===undefined)s.shift.started=true;
      if(s.shift.timely===undefined)s.shift.timely=0;
      return s;
    }
    if(s.version===1){
      s.orders.forEach((o,index)=>Object.assign(o,{seat:index,taken:true,cupAt:o.cup.stage==='empty'?'unused':'shelf'}));
      Object.assign(s,{pose:roomApi.spawn(),job:null,hand:null});
    }
    for(const o of s.orders)if(!o.taken)o.seat=null;
    const v=fresh();v.shift.started=true;v.shift.greeted=s.orders.length>1||s.orders.some(o=>o.taken);
    return Object.assign(s,{version:3,shift:v.shift,staff:v.staff,dirty:v.dirty,career:v.career});
  }
  function arrive(){
    const drinks=app.drinks.filter(d=>app.state.unlocked.includes(d.id)),tops=app.tops.filter(t=>app.state.unlocked.includes(t));
    const different=drinks.filter(d=>!orders().some(o=>o.drink===d.id));
    const recipe=!state.serial?drinks[0]:pick(different.length?different:drinks);
    const id=++state.serial;
    const dessert=id%2===0?pick(app.state.level>=3?Object.keys(desserts):['bao','toast','onigiri']):null;
    const limit=waitLimit();
    const cats=app.coats.filter(c=>!c.rare||(app.state.level>=3&&Math.random()<.15));
    orders().push({id,seat:null,taken:false,name:pick(app.names.filter(n=>!orders().some(o=>o.name===n))),coat:pick(cats).id,
      drink:recipe.id,top:tops.length && id%3!==0?pick(tops):null,dessert,limit,left:limit,
      side:dessert?'waiting':'none',bake:0,cup:cup(),cupAt:'unused'});
    arrivals.add(orders()[orders().length-1]);
    state.arrival=arrivalTime;
  }
  function remove(id){
    const o=order(id);
    if(o?.taken)state.dirty[o.seat]=true;
    for(const w of Object.values(state.staff))if(w.task?.id===id)w.task=null;
    state.orders=orders().filter(o=>o.id!==id);
    if(state.selected===id)state.selected=orders().find(o=>o.taken)?.id??null;
    if(state.hand?.id===id)state.hand=null;
    if(state.job?.id===id)state.job=null;
    state.arrival=Math.min(state.arrival,orders().length?1.8:1.1);
  }
  function take(o,track){
    const seat=freeSeat();
    if(!o||o!==line()[0]||seat<0)return false;
    o.greetingQuality=o.left/o.limit;o.limit=serviceLimit(o);o.left=o.limit;o.taken=true;o.seat=seat;
    if(!state.shift.greeted)state.shift.greeted=true;
    if(track||!tracked())state.selected=o.id;
    if(state.staff.cashier.task?.id===o.id)state.staff.cashier.task=null;
    return true;
  }
  function give(o,kind){
    if(kind==='dessert')o.side='given';else o.cupAt='given';
    if(o.cupAt!=='given'||(o.dessert&&o.side!=='given'))return false;
    const quality=Math.min(o.greetingQuality??1,o.left/o.limit);
    remove(o.id);state.shift.served++;state.career.served++;
    if(quality>=.45)state.shift.timely++;
    if(state.shift.served===state.shift.quota){
      state.shift.complete=true;state.career.shifts++;state.job=null;
      for(const worker of Object.values(state.staff))worker.task=null;
    }
    const pay=app.reward(o);state.shift.earned+=pay;
    say(o.name+(quality<.25?' left a small tip.':quality<.55?' collected their order.':' loved it!')+' +$'+pay);
    return true;
  }
  function wipe(seat){state.dirty[seat]=false;state.career.cleaned++;}
  function resetForRebirth(){
    if(!app?.state.cafeService)return;
    const old=app.state.cafeService,next=fresh();
    if(valid(old)&&old.version===3){
      next.career=old.career;next.staff=old.staff;
      for(const w of Object.values(next.staff))w.task=null;
    }
    app.state.cafeService=next;state=next;
  }
  function say(text){notice=text;noticeUntil=performance.now()+3200;}
  const assigned=(role,id,kind)=>{const t=state.staff[role].task;return t?.id===id&&(!kind||t.kind===kind);};
  function nextTask(role,w){
    const guests=orders().filter(o=>o.taken);
    const make=(kind,id,seat,seconds)=>({kind,id,seat,left:seconds/(1+.35*(w.level-1))});
    if(role==='cashier'){const g=line()[0];return g&&freeSeat()>=0?make('take',g.id,null,2.4):null;}
    if(role==='cleaner'){
      const seat=state.dirty.findIndex((d,n)=>d&&!(state.job?.kind==='clean'&&state.job.seat===n));
      return seat>=0?make('wipe',0,seat,2.5):null;
    }
    if(role==='barista'){
      for(const g of guests){
        if(!['shelf','unused'].includes(g.cupAt)||g.cup.stage==='ready')continue;
        const c=g.cup;
        if(c.stage==='empty'||c.stage==='pouring'){
          if(state.job?.kind==='pour'&&sameBrewer(state.job.id,g))continue;
          const remaining=c.stage==='pouring'?c.left:pourTime;
          g.cupAt='shelf';Object.assign(c,{stage:'pouring',flavor:g.drink,left:remaining});
          return make('brew',g.id,g.seat,remaining);
        }
        if(c.stage==='filled'&&c.top!==g.top)return make('top',g.id,g.seat,1.15);
        if(state.job?.kind!=='lid'){
          const remaining=c.stage==='sealing'?c.left:lidTime;
          c.stage='sealing';c.left=remaining;return make('seal',g.id,g.seat,remaining);
        }
      }
    }
    if(role==='cook'&&state.job?.kind!=='dessert'){
      const g=guests.find(o=>o.dessert&&['waiting','baking'].includes(o.side));
      if(g){if(g.side==='waiting')g.bake=ovenTime;g.side='baking';return make('cook',g.id,g.seat,g.bake);}
    }
    if(role==='server'){
      for(const g of guests){
        if(g.cupAt==='shelf'&&g.cup.stage==='ready')return make('serveCup',g.id,g.seat,2.1);
        if(g.side==='done'&&!(state.hand?.id===g.id&&state.hand.kind==='dessert'))return make('serveFood',g.id,g.seat,2.1);
      }
    }
    return null;
  }
  function workCrew(dt){
    let changed=false;
    for(const [role,w] of Object.entries(state.staff)){
      if(!w.level||!w.onDuty||state.shift.complete)continue;
      if(!w.task){w.task=nextTask(role,w);if(w.task)changed=true;continue;}
      const t=w.task,g=order(t.id);
      t.left=Math.max(0,t.left-dt);
      if(t.kind==='brew'||t.kind==='seal')g.cup.left=t.left;
      if(t.kind==='cook')g.bake=t.left;
      if(t.left)continue;
      w.task=null;changed=true;
      if(t.kind==='take'){if(take(g,false))w.done++;}
      else if(t.kind==='wipe'){if(state.dirty[t.seat]){wipe(t.seat);w.done++;}}
      else if(t.kind==='brew')g.cup.stage='filled';
      else if(t.kind==='top')g.cup.top=g.top;
      else if(t.kind==='seal'){g.cup.stage='ready';w.done++;}
      else if(t.kind==='cook'){g.side='done';w.done++;}
      else{w.done++;give(g,t.kind==='serveCup'?'cup':'dessert');}
    }
    return changed;
  }
  function startNext(){
    if(!state.shift.complete)return;
    state.shift=newShift(state.shift.number+1);state.paused=false;state.arrival=arrivalTime;
    state.selected=null;state.job=null;state.hand=null;state.dirty.fill(false);state.pose=roomApi.spawn();briefing=true;
    last=performance.now();room.clear();room.frame(0);app.save();render();by('[data-service="begin"]').focus({preventScroll:true});
  }
  function advance(dt){
    let changed=false;
    for(const o of [...orders()]){
      const was=mood(o);
      o.left=Math.max(0,o.left-dt*(o.taken||o===line()[0]?1:.65));
      if(!o.left){remove(o.id);state.shift.missed++;state.career.missed++;app.state.combo=0;say(o.name+' left '+(o.taken?'without their order.':'before ordering.'));changed=true;}
      else if(was!==mood(o))changed=true;
    }
    const job=state.job;
    if(job?.kind==='clean'){
      job.left=Math.max(0,job.left-dt);
      if(!job.left){wipe(job.seat);state.job=null;changed=true;say('Clean tray ready for the next guest.');}
    }else if(job){
      const o=order(job.id),dessert=job.kind==='dessert';
      const left=Math.max(0,(dessert?o.bake:o.cup.left)-dt);
      if(dessert)o.bake=left;else o.cup.left=left;
      if(!left){
        if(dessert){o.side='done';state.hand={id:o.id,kind:'dessert'};}
        else o.cup.stage=job.kind==='pour'?'filled':'ready';
        state.job=null;changed=true;
        say(dessert?'Food boxed.':job.kind==='pour'?'Your cup is filled.':'Lid sealed.');
      }
    }
    if(workCrew(dt))changed=true;
    const queueCap=state.shift.greeted?3:2;
    if(!state.shift.complete&&orders().length<state.shift.quota-state.shift.served&&line().length<queueCap){
      state.arrival=Math.max(0,state.arrival-dt);
      if(!state.arrival){arrive();changed=true;}
    }
    return changed;
  }
  function quest(){
    if(briefing)return [null,'Prepare for round '+state.shift.number];
    if(state.shift.complete)return [null,'Round complete'];
    if(state.job){
      if(state.job.kind==='clean')return ['pickup','Cleaning the pickup pass'];
      const o=order(state.job.id);
      return state.job.kind==='pour'?[brewer(o),'Filling the cup']:state.job.kind==='lid'?['lid','Pressing the lid']:['dessert','Preparing '+desserts[o.dessert]];
    }
    const h=held(),o=h||tracked();
    if(h && state.hand.kind==='dessert')return ['pickup','Bring '+h.name+'’s food to pickup'];
    if(h){
      if(['empty','pouring'].includes(h.cup.stage))return [brewer(h),'Brew '+drink(h.drink).name+' at '+stationName(brewer(h))];
      if(h.cup.stage==='filled'&&h.cup.top!==h.top)return ['top','Scoop '+app.ingredients[h.top].name];
      if(h.cup.stage!=='ready')return ['lid','Seal the cup'];
      return ['pickup','Bring '+h.name+'’s drink to pickup'];
    }
    if(o && o.cupAt!=='given'&&!assigned('barista',o.id)&&!assigned('server',o.id,'serveCup'))
      return ['rack',o.cupAt==='shelf'?'Pick up '+o.name+'’s saved cup':'Pick up a cup for '+o.name];
    if(o?.dessert && o.side!=='given'&&!assigned('cook',o.id)&&!assigned('server',o.id,'serveFood'))return ['dessert','Prepare '+desserts[o.dessert]];
    const guest=line()[0];
    if(guest&&freeSeat()>=0&&!assigned('cashier',guest.id))return ['line','Ask '+guest.name+' for their order'];
    if(dirtyTray()>=0)return ['pickup','Clear a tray at pickup'];
    if(o)return ['pickup','Your crew is helping '+o.name];
    return [null,guest?'Waiting for a clean tray':'The next guest is on the way'];
  }
  function stationName(id){
    if(!id)return '';
    if(id==='line')return 'Register';
    if(id==='pickup')return 'Pickup pass';
    if(id.startsWith('tea'))return brewers[Number(id.slice(3))].label;
    return {rack:'Cup shelf',top:'Boba bowl',lid:'Lid press',dessert:'Food oven'}[id];
  }
  const exists=id=>id==='line'?!!line().length:id==='pickup'?tickets().length>0||state.dirty.includes(true):true;
  function action(at){
    if(!at)return '';
    if(state.job)return '';
    const h=held(),o=tracked();
    if(at==='line'){const head=line()[0];return head&&freeSeat()>=0?'Ask '+head.name:'';}
    if(at==='pickup'){
      if(h&&(state.hand.kind==='dessert'||h.cup.stage==='ready'))return 'Serve '+h.name;
      if(!h&&dirtyTray()>=0)return 'Clear pickup tray';
      return '';
    }
    if(at==='rack'){
      if(h && state.hand.kind==='cup')return 'Set cup on shelf';
      if(!h&&o&&o.cupAt!=='given'&&!assigned('barista',o.id)&&!assigned('server',o.id,'serveCup'))return o.cupAt==='shelf'?'Pick up saved cup':'Pick up empty cup';
    }
    if(at==='dessert'&&!h&&o?.dessert&&!['none','given'].includes(o.side)&&!assigned('server',o.id,'serveFood')&&
       (o.side==='done'||!state.staff.cook.task))return o.side==='done'?'Pick up '+desserts[o.dessert]:'Make '+desserts[o.dessert];
    if(!h||state.hand.kind!=='cup')return '';
    const teamBrew=state.staff.barista.task;
    if(at===brewer(h) && ['empty','pouring'].includes(h.cup.stage)&&!(teamBrew?.kind==='brew'&&sameBrewer(teamBrew.id,h)))return h.cup.stage==='pouring'?'Continue brewing':'Start '+drink(h.drink).name;
    if(at==='top' && h.cup.stage==='filled' && h.top && !h.cup.top)return 'Scoop '+app.ingredients[h.top].name;
    if(at==='lid'&&state.staff.barista.task?.kind!=='seal' && ['filled','sealing'].includes(h.cup.stage) && h.top===h.cup.top)return 'Press lid';
    return '';
  }
  function interact(){
    if(!active()||state.job)return;
    const at=roomApi.nearest(state.pose,exists);
    if(!action(at))return;
    const h=held(),o=tracked();
    if(at==='line'){
      const front=line()[0];
      if(take(front,true))say(front.name+'’s ticket is on the rail.');
    }else if(at==='pickup'){
      if(!h)state.job={kind:'clean',seat:dirtyTray(),left:cleanTime};
      else{
        const kind=state.hand.kind;state.hand=null;
        if(!give(h,kind)){state.selected=h.id;say(h.name+' received the '+(kind==='cup'?'drink.':'food.'));}
      }
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
  function sprint(metres){
    const guest=held();
    if(!active()||state.job||state.hand?.kind!=='cup'||guest?.cup.stage!=='filled'||!Number.isFinite(metres)||metres<=0)return;
    // An open drink has about a 2% chance of spilling over a five-metre dash, regardless of frame rate.
    if(Math.random()>=-Math.expm1(-.004*metres))return;
    guest.cup=cup();say('Spilled! Refill '+guest.name+'’s cup at '+stationName(brewer(guest))+'.');app.save();render();
  }
  function color(id){return id==='classic'?'#c88a60':id==='jasminemt'?'#a4bd80':id==='bsmilk'?'#ac7055':app.ingredients[drink(id).ings[0]].c;}
  function objects(){
    const actor=o=>({id:o.id,name:o.name,coat:o.coat,mood:mood(o),arriving:arrivals.has(o)});
    const items={rack:{label:'Cup shelf'},top:{label:'Boba bowl'},lid:{label:'Lid press',running:state.job?.kind==='lid'||state.staff.barista.task?.kind==='seal'},
      dessert:{label:'Food oven',running:state.job?.kind==='dessert'||!!state.staff.cook.task},
      line:{label:'Register',guests:line().map(actor)},pickup:{label:'Pickup pass',dirty:state.dirty.includes(true),guests:tickets().map(actor)},crew:[]};
    const pouring=order(state.job?.kind==='pour'?state.job.id:null),staffPour=state.staff.barista.task,teamCup=order(staffPour?.kind==='brew'?staffPour.id:null);
    for(const [n,machine] of brewers.entries()){
      const id='tea'+n;
      const brewing=pouring&&brewer(pouring)===id?pouring:teamCup&&brewer(teamCup)===id?teamCup:null;
      items[id]={...machine,running:!!brewing,jobId:brewing?.id??null};
    }
    for(const [role,w] of Object.entries(state.staff))if(w.level&&w.onDuty){
      const t=w.task;
      const anchor={take:'line',wipe:'pickup',brew:t?.kind==='brew'?brewer(order(t.id)):'tea0',top:'top',seal:'lid',cook:'dessert',serveCup:'pickup',serveFood:'pickup'};
      items.crew.push({role,name:roles[role].name,coat:roles[role].coat,working:!!t,
        station:t?anchor[t.kind]:{cashier:'line',cleaner:'pickup',barista:'tea0',cook:'dessert',server:'rack'}[role]});
    }
    return items;
  }
  function ticket(o){
    return '<button type="button" class="bs-ticket" data-service="track" data-id="'+o.id+'" data-mood="'+mood(o)+'" aria-pressed="'+(state.selected===o.id)+'"><span><b>#'+String(o.id).padStart(2,'0')+' · '+o.name+'</b><i data-time="'+o.id+'"></i></span><strong>'+drink(o.drink).name+'</strong><small>'+(o.top?app.ingredients[o.top].name:'No topping')+(o.dessert?' + '+desserts[o.dessert]:'')+'</small><i class="bs-meter"><i data-patience="'+o.id+'"></i></i></button>';
  }
  function taskText(t){
    if(!t)return 'Waiting for work';
    const o=order(t.id),guest=o?.name||'guest';
    return {take:'Taking '+guest+'’s order',wipe:'Clearing a pickup tray',brew:'Brewing for '+guest,top:'Adding boba for '+guest,
      seal:'Sealing '+guest+'’s cup',cook:'Cooking '+(o?desserts[o.dessert]:'food'),serveCup:'Taking a drink to '+guest,serveFood:'Taking food to '+guest}[t.kind];
  }
  function staffCost(role){return roles[role].cost*(state.staff[role].level+1);}
  function crewPanel(){
    const focused=document.activeElement?.closest('.bw-crew-list button');
    const prior=focused&&{action:focused.dataset.service,role:focused.dataset.id};
    by('.bw-crew-wallet').textContent='$'+Math.floor(app.state.money)+' available';
    by('.bw-crew-list').innerHTML=Object.entries(roles).map(([role,def])=>{
      const w=state.staff[role],price=staffCost(role),enabled=w.level<3&&app.state.money>=price;
      const status=w.level?(w.onDuty?taskText(w.task):'Off duty')+' · '+w.done+' completed':def.description;
      return '<article><div><b>'+def.name+' · '+def.title+'</b><small>'+status+'</small></div><div class="bw-crew-actions">'+
        (w.level?'<button type="button" data-service="duty" data-id="'+role+'">'+(w.onDuty?'Off duty':'Go on duty')+'</button>':'')+
        '<button type="button" data-service="hire" data-id="'+role+'" '+(enabled?'':'disabled')+'>'+
        (w.level===3?'Level 3':w.level?'Train Lv '+(w.level+1)+' · $'+price:'Hire · $'+price)+'</button></div></article>';
    }).join('');
    if(prior){
      const next=by('[data-service="'+prior.action+'"][data-id="'+prior.role+'"]:not(:disabled)')||
        by('[data-service="duty"][data-id="'+prior.role+'"]');
      next?.focus({preventScroll:true});
    }
  }
  function toggleCrew(show){
    crewOpen=show;room.clear();last=performance.now();render();
    if(show){room.releaseLook();by('[data-service="crewclose"]').focus({preventScroll:true});}
    else if(active())playLook();
    else (briefing?by('[data-service="begin"]'):state.shift.complete?by('[data-service="next"]'):by('.bs-paused [data-service="pause"]')).focus({preventScroll:true});
  }
  function purchase(role){
    if(!crewOpen||!Object.hasOwn(roles,role))return;
    const w=state.staff[role],price=staffCost(role);
    if(w.level>=3||app.state.money<price)return;
    app.state.money-=price;w.level++;app.save();render();
  }
  function duty(role){
    if(!crewOpen||!Object.hasOwn(roles,role))return;
    const w=state.staff[role];if(!w.level)return;
    w.onDuty=!w.onDuty;if(!w.onDuty)w.task=null;app.save();render();
  }
  function render(){
    const previous=document.activeElement?.dataset.id,taken=tickets();
    by('.bs-tickets').innerHTML=taken.map(ticket).join('');
    if(previous)by('[data-service="track"][data-id="'+Number(previous)+'"]')?.focus({preventScroll:true});
    by('.bs-money').textContent='$'+Math.floor(app.state.money);by('.bs-level').textContent='Lv '+app.state.level;
    by('.bw-xp i').style.width=(Math.min(1,app.state.xp/(60+30*(app.state.level-1)))*100)+'%';
    by('.bs-pause').textContent=state.paused?'▶ Resume':'Ⅱ Pause';by('.bs-pause').setAttribute('aria-pressed',String(state.paused));
    const f=state.shift;
    by('.bw-shift-count').textContent='Round '+f.number+' · '+f.served+'/'+f.quota+' served';
    const workers=Object.entries(state.staff).filter(([,w])=>w.task);
    by('.bw-on-floor').textContent=workers.length?roles[workers[0][0]].name+' · '+taskText(workers[0][1].task):'';
    by('.bs-pause').disabled=briefing||crewOpen||f.complete;
    by('.bs-work').inert=briefing||state.paused||crewOpen||f.complete;by('.bs-paused').hidden=briefing||!state.paused||crewOpen||f.complete;
    by('.bw-crewboard').hidden=!crewOpen;by('.bw-receipt').hidden=!f.complete||crewOpen;
    const brief=by('.bw-briefing');brief.hidden=!briefing||crewOpen;
    if(briefing){
      by('.bw-round-title').textContent='Round '+f.number;
      by('.bw-round-goal').textContent='Serve '+f.quota+' cats';
      const info=by('.bw-round-saved');info.hidden=!f.started;
      info.textContent=f.started?'Saved round · '+f.served+'/'+f.quota+' served'+(taken.length?' · '+taken.length+' open '+(taken.length===1?'ticket':'tickets'):''):'';
      by('[data-service="begin"]').textContent=f.started?'Resume round':'Start round';
    }
    if(crewOpen)crewPanel();
    if(f.complete){
      room.releaseLook();by('.bw-receipt h2').textContent='Round '+f.number+' complete!';
      by('.bw-receipt p').textContent=f.served+' guests served · $'+f.earned+' earned';
      const ratings=[[true,'Service goal met'],[f.missed===0,'No guests left early'],[f.timely===f.quota,'Every guest greeted and served promptly']];
      const stars=ratings.filter(([earned])=>earned).length,badge=by('.bw-round-stars');badge.textContent='★'.repeat(stars)+'☆'.repeat(3-stars);badge.setAttribute('aria-label',stars+' of 3 stars');
      by('.bw-round-ratings').innerHTML=ratings.map(([earned,label])=>'<li data-earned="'+earned+'" aria-label="'+(earned?'Earned: ':'Missed: ')+label+'">'+label+'</li>').join('');
    }
    const h=held(),hand=by('.bw-hand');
    hand.hidden=!h;
    if(h){const dessert=state.hand.kind==='dessert';
      hand.className='bw-hand '+(dessert?'bw-h-dessert':h.cup.stage==='ready'?'bw-h-cup bw-sealed':'bw-h-cup')+(h.cup.top?' bw-topped':'');
      const contents=dessert?desserts[h.dessert]:h.cup.stage==='ready'?'Sealed cup':h.cup.stage==='filled'?'Open cup · '+drink(h.cup.flavor).name:h.cup.flavor?drink(h.cup.flavor).name:'Empty cup';
      hand.style.setProperty('--brew',h.cup.flavor?color(h.cup.flavor):'#e3cbb943');hand.querySelector('b').textContent=h.name+' · '+contents;}
    room.paint(objects());if(!active())room.frame(0);readout='';markers();patienceDisplay();
  }
  function markers(){
    const at=roomApi.nearest(state.pose,exists),[to,title]=quest(),dir=roomApi.direction(state.pose,to),cmd=action(at);
    const job=state.job,working=job&&order(job.id),left=job&&(job.kind==='clean'?job.left:job.kind==='dessert'?working.bake:working.cup.left);
    let location='';
    if(dir)location=Math.abs(dir.angle)>.48?(Math.abs(dir.angle)>2.45?'Turn around':dir.angle>0?'Turn right':'Turn left'):
      dir.distance>1.62?'Walk forward':'Within reach';
    const status=performance.now()<noticeUntil?notice:'';
    const key=[at,to,title,cmd,location,dir?.distance.toFixed(1),job&&Math.ceil(left*10),status,state.paused].join('|');
    if(readout!==key){
      readout=key;const button=by('.bw-use');
      button.textContent=job?'Working…':cmd||'Interact';button.disabled=!cmd||!!job||state.paused;
      button.dataset.near=at||'';by('.bw-step').textContent=title;
      by('.bw-way').textContent=job?(job.kind==='clean'?'Wiping · ':'Stay at the machine · ')+left.toFixed(1)+'s':(dir?location+' · '+dir.distance.toFixed(1)+' m':'');
      by('.bw-job').hidden=!job;
      if(job){const duration=job.kind==='clean'?cleanTime:job.kind==='dessert'?ovenTime:job.kind==='lid'?lidTime:pourTime;by('.bw-job i').style.width=(100*(1-left/duration))+'%';}
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
      patienceDisplay();
      if(now>=saveDue){app.save();saveDue=now+1000;const w=document.getElementById('saveWarning');by('.bs-save-warning').textContent=w.hidden?'':w.textContent;}
    }
    frameId=requestAnimationFrame(heartbeat);
  }
  function patienceDisplay(){
    const queue=line(),head=queue[0],lineLabel=by('.bw-line-count');
    const note=head?queue.length+' in line · '+(mood(head)==='calm'?'':mood(head)+' · ')+Math.ceil(head.left)+'s':'';
    if(lineLabel.textContent!==note){lineLabel.textContent=note;lineLabel.dataset.mood=head?mood(head):'';}
    for(const o of tickets()){
      const meter=by('[data-patience="'+o.id+'"]'),time=by('[data-time="'+o.id+'"]');
      if(meter)meter.style.transform='scaleX('+o.left/o.limit+')';
      const text=(mood(o)==='calm'?'':mood(o)+' · ')+Math.ceil(o.left)+'s';if(time&&time.textContent!==text)time.textContent=text;
    }
  }
  function playLook(){by('.bw-view').focus({preventScroll:true});room.captureLook();}
  function begin(){
    if(!briefing||crewOpen||state.shift.complete)return;
    briefing=false;state.paused=false;state.shift.started=true;
    if(!orders().length)arrive();
    room.clear();last=performance.now();saveDue=last+1000;render();app.save();playLook();
  }
  function pause(){
    if(briefing||crewOpen||state.shift.complete)return;
    state.paused=!state.paused;room.clear();last=performance.now();app.save();render();
    if(state.paused){room.releaseLook();by('.bs-paused [data-service="pause"]').focus({preventScroll:true});}else playLook();
  }
  function open(){
    if(dialog.open)return;app.enter();state=app.state.cafeService;
    state=app.state.cafeService=valid(state)?migrate(state):fresh();crewOpen=false;briefing=!state.shift.complete;
    const avatar=by('.bw-avatar'),original=document.querySelector('.hud .brand .avatar svg');
    if(original)avatar.replaceChildren(original.cloneNode(true));else avatar.innerHTML=app.portrait(app.state.me?.coat||app.coats[0].id);
    by('.bs-brand h1').textContent=(app.state.me?.name||'Chef')+'’s Café';
    dialog.showModal();room.clear();room.resize();room.frame(0);notice='';noticeUntil=0;render();app.save();
    (briefing?by('[data-service="begin"]'):by('[data-service="next"]')).focus({preventScroll:true});
    last=performance.now();saveDue=last+1000;cancelAnimationFrame(frameId);frameId=requestAnimationFrame(heartbeat);
  }
  function init(config){
    app=config;dialog=document.getElementById('bobaService');
    dialog.innerHTML='<header class="bs-head"><div class="bs-brand"><button class="bs-exit bw-home" data-service="close" type="button" aria-label="Main menu" title="Main menu"></button><i class="bw-avatar" aria-hidden="true"></i><h1>Chef’s Café</h1></div><div class="bs-head-actions"><div class="bw-currency" title="Tips"><b class="bs-money"></b></div><div class="bw-levelchip" title="Café level"><span class="bs-level"></span><i class="bw-xp"><i></i></i></div><button class="bs-exit bw-crew-button" data-service="crew" type="button">Crew</button><button class="bs-pause" data-service="pause" type="button"></button></div></header>'+
    '<main class="bs-work"><div class="bw-view" tabindex="0" aria-label="First-person café. Move the mouse to look, WASD to walk, Shift to sprint, E to interact, and Q to switch tickets. Escape pauses and shows the cursor."></div><section class="bw-rail" aria-label="Order rail"><div class="bw-shift-label"><b class="bw-shift-count"></b><small class="bw-line-count"></small></div><div class="bs-tickets"></div><small class="bw-on-floor"></small></section><div class="bw-map" role="img"><i class="bw-player"></i><i class="bw-dest"></i></div><i class="bw-reticle" aria-hidden="true"></i>'+
    '<div class="bw-hand" hidden><div class="bw-held-art"><i></i><i></i></div><b></b></div><div class="bw-controls"><div class="bw-joystick" aria-label="Movement stick"><i></i></div><div class="bw-guide"><strong class="bw-step"></strong><small class="bw-way"></small><i class="bw-job" hidden><i></i></i><small class="bs-msg" role="status"></small></div><button class="bw-use" type="button" data-service="use"></button></div>'+
    '<div class="bw-legend"><span class="bw-desktop-keys">WASD walk · Mouse look · Shift sprint · E use · Q tickets · C crew · Esc pause</span><span class="bw-mobile-keys">Stick to walk · Drag to look</span><span class="bw-turns"><button type="button" class="bw-sprint" aria-pressed="false">Sprint</button><button type="button" data-service="left" aria-label="Turn left">↶</button><button type="button" data-service="right" aria-label="Turn right">↷</button></span></div></main>'+
    '<aside class="bs-paused" hidden><div><span>☾</span><h2>Round paused</h2><p>Your cats and machines will wait.</p><button type="button" data-service="pause">Resume round</button></div></aside>'+
    '<aside class="bw-receipt" hidden><section role="status"><small>Midnight Paws Café</small><h2></h2><div class="bw-round-stars" role="img"></div><p></p><ul class="bw-round-ratings"></ul><button type="button" data-service="next">Next round</button></section></aside>'+
    '<aside class="bw-crewboard" hidden><section role="dialog" aria-label="Café crew"><header><div><h2>Café crew</h2><strong class="bw-crew-wallet"></strong></div><button type="button" data-service="crewclose">Back to café</button></header><div class="bw-crew-list"></div></section></aside><div class="bs-save-warning" role="alert"></div>';
    dialog.append(document.getElementById('bwRoundBrief').content.cloneNode(true));
    room=roomApi.create(by('.bw-view'),{state:()=>state,running:active,use:interact,portrait:app.portrait,joystick:by('.bw-joystick'),sprintButton:by('.bw-sprint'),
      onSprint:sprint,onUnlock(){if(active())pause();}});
    by('.bw-home').append(document.querySelector('#homeBtn svg').cloneNode(true));
    by('.bw-currency').prepend(document.querySelector('#moneyChip svg').cloneNode(true));
    let touchUseAt=-Infinity;
    by('.bw-use').addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch'||e.currentTarget.disabled)return;
      e.preventDefault();touchUseAt=performance.now();interact();
    });
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('[data-service]');if(!b||b.disabled)return;
      const id=b.dataset.service;
      if(id==='begin')begin();else if(id==='pause')pause();else if(id==='close'){room.releaseLook();app.save();dialog.close();}
      else if(id==='crew'||id==='crewclose')toggleCrew(id==='crew');
      else if(id==='hire')purchase(b.dataset.id);
      else if(id==='duty')duty(b.dataset.id);
      else if(id==='next'&&!crewOpen)startNext();
      else if(active()){
        if(id==='use'){if(!e.detail||performance.now()-touchUseAt>650)interact();}
        else if(id==='track'&&order(Number(b.dataset.id))?.taken){state.selected=Number(b.dataset.id);app.save();render();}
        else if(id==='left'||id==='right'){room.turn(id==='left'?-Math.PI/8:Math.PI/8);room.frame(0);markers();}
      }
    });
    window.addEventListener('keydown',e=>{
      if(!dialog.open||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,[contenteditable=true]'))return;
      if(e.code==='KeyE'){e.preventDefault();interact();}else if(e.code==='KeyP'){e.preventDefault();pause();}
      else if(e.code==='KeyC'){e.preventDefault();toggleCrew(!crewOpen);}
      else if(active()&&(e.code==='KeyQ'||/^Digit[1-3]$/.test(e.code))){
        e.preventDefault();const openTickets=tickets();if(!openTickets.length)return;
        const index=e.code==='KeyQ'?(openTickets.findIndex(o=>o.id===state.selected)+1)%openTickets.length:Number(e.code.slice(-1))-1;
        if(openTickets[index]){state.selected=openTickets[index].id;app.save();render();}
      }
    });
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(crewOpen)toggleCrew(false);else if(active())pause();});
    dialog.addEventListener('close',()=>{cancelAnimationFrame(frameId);room.releaseLook();room.clear();app.save();app.exit();});
    document.addEventListener('visibilitychange',()=>{if(dialog.open){room.clear();last=performance.now();if(document.hidden){if(!briefing&&!crewOpen&&!state.shift.complete&&!state.paused)pause();else app.save();}}});
    window.addEventListener('pagehide',()=>{if(dialog.open)app.save();});
  }
  return {init,open,valid,resetForRebirth};
})();
