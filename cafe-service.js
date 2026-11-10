/* First-person service shares the café wallet and only advances while open and visible. */
window.BobaService=(()=>{
  'use strict';
  const roomApi=window.BobaRoom, pourTime=3.5,lidTime=1.3,topTime=.75,ovenTime=2.8,cleanTime=1.7,arrivalTime=3;
  const desserts={bao:'Steamed veggie bao',toast:'Sesame toast',onigiri:'Grilled onigiri',mochi:'Strawberry mochi',taiyaki:'Custard taiyaki',roll:'Matcha roll'};
  const roles={
    cashier:{name:'Miso',title:'Order taker',description:'Writes the front guest’s ticket.',coat:'orange',cost:12,kinds:['take']},
    cleaner:{name:'Peach',title:'Cleaner',description:'Clears used trays at the pickup pass.',coat:'calico',cost:16,kinds:['wipe']},
    barista:{name:'Nori',title:'Barista',description:'Loads the brewer and seals finished drinks.',coat:'black',cost:28,kinds:['brew','top','seal']},
    cook:{name:'Bao',title:'Toppings specialist',description:'Adds requested toppings to parked and crew cups.',coat:'brown',cost:24,kinds:['cook','top']},
    server:{name:'Yuzu',title:'Server',description:'Carries finished items to the right guest.',coat:'white',cost:32,kinds:['serveCup','serveFood']}
  };
  const stages=['empty','pouring','filled','topping','sealing','ready'];
  const bays=['tea0','tea1'],equipment=[...bays,'top','lid'];
  const machineNames={tea0:'Brewer A',tea1:'Brewer B',top:'Topping bowl',lid:'Lid press'};
  const operation={tea0:'pouring',tea1:'pouring',top:'topping',lid:'sealing'};
  const arrivals=new WeakSet();
  let app,dialog,room,state,frameId,last,saveDue,readout='',notice='',noticeUntil=0,crewOpen=false,briefing=false,chooser=null,contact=null;
  const by=s=>dialog.querySelector(s),pick=a=>a[Math.floor(Math.random()*a.length)];
  const drink=id=>app.drinks.find(d=>d.id===id), orders=()=>state.orders;
  const order=id=>orders().find(o=>o.id===id), tracked=()=>order(state.selected);
  const held=()=>state.hand&&order(state.hand.id);
  const active=()=>!!(dialog?.open && state && !state.paused && !briefing && !crewOpen && state.shift.started && !state.shift.complete && !document.hidden);
  const within=(n,max)=>Number.isFinite(n)&&n>=0&&n<=max;
  const cup=()=>({stage:'empty',flavor:null,top:null,left:0,duration:0,auto:false,actor:null,dose:null});
  const occupant=id=>tickets().find(o=>o.cupAt===id);
  const freeBay=()=>bays.find(id=>!occupant(id));
  const running=o=>!!o&&equipment.includes(o.cupAt)&&o.cup.stage===operation[o.cupAt];
  const canMove=()=>active()&&!chooser;
  const counterFor=id=>bays.includes(id)?'tea':id;
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  const newShift=n=>({number:n,quota:Math.min(8,n+2),served:0,missed:0,earned:0,timely:0,complete:false,greeted:false,started:false});
  const newStaff=()=>Object.fromEntries(Object.keys(roles).map(k=>[k,{level:0,done:0,onDuty:true,task:null}]));
  const fresh=()=>({version:4,paused:false,serial:0,arrival:3,selected:null,orders:[],pose:roomApi.spawn(),hand:null,job:null,
    shift:newShift(1),dirty:[false,false,false],staff:newStaff(),career:{shifts:0,served:0,missed:0,cleaned:0}});
  const line=()=>orders().filter(o=>!o.taken);
  const tickets=()=>orders().filter(o=>o.taken);
  const seated=n=>orders().find(o=>o.taken&&o.seat===n);
  const freeSeat=()=>state.dirty.findIndex((dirty,n)=>!dirty&&!seated(n));
  const dirtyTray=()=>state.dirty.findIndex((dirty,n)=>dirty&&state.staff.cleaner.task?.seat!==n);
  const waitLimit=()=>Math.max(20,33-state.shift.number);
  const serviceLimit=()=>Math.max(45,60-state.shift.number);
  const mood=o=>o.left/o.limit<.25?'angry':o.left/o.limit<.55?'restless':'calm';
  function valid(s){
    if(!app||!s||![1,2,3,4].includes(s.version)||typeof s.paused!=='boolean'||!count(s.serial)||
       !within(s.arrival,3)||!Array.isArray(s.orders)||s.orders.length>(s.version>=3?6:3))return false;
    const ids=new Set(),seats=new Set(),occupied=new Set();
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
        if(typeof o.taken!=='boolean'||!['unused','hand','shelf','given',...(s.version===4?[...equipment,'waitTea','waitLid']:[])].includes(o.cupAt))return false;
        if(s.version===4){
          if(o.dessert!==null||o.side!=='none'||o.bake!==0||o.cupAt==='given'||!within(c.duration,pourTime)||
             typeof c.auto!=='boolean'||(c.actor!==null&&!['barista','cook'].includes(c.actor))||(c.dose!=null&&!app.tops.includes(c.dose))||c.left>c.duration)return false;
          if(!o.taken&&(o.cupAt!=='unused'||c.stage!=='empty'))return false;
          if(equipment.includes(o.cupAt)){
            if(!o.taken||occupied.has(o.cupAt))return false;
            occupied.add(o.cupAt);
            const done=o.cupAt==='lid'?'ready':'filled';
            if(c.stage!==operation[o.cupAt]&&c.stage!==done)return false;
            if(c.stage===operation[o.cupAt]&&(!c.duration||!c.left))return false;
          }else if(o.cupAt==='waitTea'||o.cupAt==='waitLid'){
            if(!o.taken||c.stage!==(o.cupAt==='waitTea'?'pouring':'sealing'))return false;
          }else if(['pouring','topping','sealing'].includes(c.stage))return false;
        }
        if(s.version>=3&&!o.taken){if(o.seat!==null)return false;}
        else{if(!Number.isInteger(o.seat)||o.seat<0||o.seat>2||seats.has(o.seat))return false;seats.add(o.seat);}
      }
      ids.add(o.id);
    }
    if(s.version===1)return s.selected===null?ids.size===0:ids.has(s.selected);
    const selected=s.orders.find(o=>o.id===s.selected);
    if((s.selected!==null&&!selected?.taken)||!roomApi.bounded(s.pose))return false;
    if(s.version>=3){
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
        if(s.version===4){
          if(t.kind==='cook'||t.kind==='serveFood')return false;
          if(['brew','seal','top'].includes(t.kind)&&(!running(guest)||guest.cup.actor!==role))return false;
          if(t.kind==='serveCup'&&(guest.cup.stage!=='ready'||!['shelf','lid'].includes(guest.cupAt)))return false;
          continue;
        }
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
      if(s.version>=3&&job?.kind==='clean')return !h&&Number.isInteger(job.seat)&&s.dirty[job.seat]===true&&within(job.left,cleanTime);
      if(s.version===4)return false;
      const o=job&&s.orders.find(o=>o.id===job.id);
      if(!o?.taken || !(job.kind==='pour'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='pouring'||
        job.kind==='lid'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='sealing'||
        job.kind==='dessert'&&!h&&o.side==='baking'))return false;
    }
    return true;
  }
  function migrate(s){
    if(s.version===4)return s;
    if(s.version<3){
      if(s.version===1){
        s.orders.forEach((o,index)=>Object.assign(o,{seat:index,taken:true,cupAt:o.cup.stage==='empty'?'unused':'shelf'}));
        Object.assign(s,{pose:roomApi.spawn(),job:null,hand:null});
      }
      for(const o of s.orders)if(!o.taken)o.seat=null;
      const freshState=fresh();
      Object.assign(s,{shift:freshState.shift,staff:freshState.staff,dirty:freshState.dirty,career:freshState.career});
      s.shift.started=true;
    }
    s.shift.greeted??=s.shift.served>0||s.orders.length>1||s.orders.some(o=>o.taken);
    s.shift.started??=true;s.shift.timely??=0;
    state=s;
    const delivered=[];
    for(const o of s.orders){
      const c=o.cup,staff=s.staff.barista.task;
      const wasCrew=staff?.id===o.id;
      Object.assign(c,{duration:0,auto:wasCrew,actor:null,dose:null});
      if(c.stage==='pouring'||c.stage==='sealing'){
        const sealing=c.stage==='sealing',at=sealing?(!occupant('lid')&&'lid'):freeBay();
        c.duration=sealing?Math.max(lidTime,c.left):pourTime;
        c.left=Math.min(c.left,c.duration);
        if(!c.left){c.stage=sealing?'ready':'filled';o.cupAt='shelf';}
        else{o.cupAt=at||(sealing?'waitLid':'waitTea');if(wasCrew)c.actor='barista';}
        if(s.hand?.id===o.id)s.hand=null;
      }else c.left=0;
      if(o.cupAt==='given')delivered.push(o);
      o.dessert=null;o.side='none';o.bake=0;
    }
    if(s.hand?.kind==='dessert')s.hand=null;
    if(s.job?.kind!=='clean')s.job=null;
    for(const [role,w] of Object.entries(s.staff)){
      const t=w.task;if(!t)continue;
      const g=order(t.id);
      if(t.kind==='take'||t.kind==='wipe'||t.kind==='serveCup'&&g?.cupAt==='shelf')continue;
      if(role==='barista'&&g){
        if(t.kind==='top'&&t.left>0&&!occupant('top')){
          g.cupAt='top';Object.assign(g.cup,{stage:'topping',actor:role,auto:true,dose:g.top,left:t.left,duration:Math.max(t.left,topTime)});
          continue;
        }
        if(running(g)&&g.cup.actor===role){t.left=g.cup.left;continue;}
      }
      w.task=null;
    }
    s.version=4;
    for(const o of delivered)give(o);
    return s;
  }
  function arrive(){
    const drinks=app.drinks.filter(d=>app.state.unlocked.includes(d.id)),tops=app.tops.filter(t=>app.state.unlocked.includes(t));
    const different=drinks.filter(d=>!orders().some(o=>o.drink===d.id));
    const recipe=!state.serial?drinks[0]:pick(different.length?different:drinks);
    const id=++state.serial;
    const limit=waitLimit();
    const cats=app.coats.filter(c=>!c.rare||(app.state.level>=3&&Math.random()<.15));
    orders().push({id,seat:null,taken:false,name:pick(app.names.filter(n=>!orders().some(o=>o.name===n))),coat:pick(cats).id,
      drink:recipe.id,top:tops.length && id%3!==0?pick(tops):null,dessert:null,limit,left:limit,
      side:'none',bake:0,cup:cup(),cupAt:'unused'});
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
    if(chooser?.id===id)closeChooser(false);
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
  function give(o){
    if(!o||order(o.id)!==o)return false;
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
    if(valid(old)&&old.version>=3){
      next.career=old.career;next.staff=old.staff;
      for(const w of Object.values(next.staff))w.task=null;
    }
    app.state.cafeService=next;state=next;
  }
  function say(text){notice=text;noticeUntil=performance.now()+3200;}
  const assigned=(role,id,kind)=>{const t=state.staff[role].task;return t?.id===id&&(!kind||t.kind===kind);};
  function dock(o,at,recipe,worker=null){
    const duration=(bays.includes(at)?pourTime:at==='top'?topTime:lidTime)/(worker?1+.25*(state.staff[worker].level-1):1);
    o.cupAt=at;Object.assign(o.cup,{stage:operation[at],left:duration,duration,auto:!!worker,actor:worker});
    o.cup.dose=at==='top'?recipe:null;
    if(bays.includes(at)){o.cup.flavor=recipe;o.cup.top=null;}
    if(state.hand?.id===o.id)state.hand=null;
    if(worker)return {kind:bays.includes(at)?'brew':at==='top'?'top':'seal',id:o.id,seat:o.seat,left:duration};
  }
  function nextTask(role,w){
    const guests=tickets();
    const make=(kind,id,seat,seconds)=>({kind,id,seat,left:seconds/(1+.35*(w.level-1))});
    if(role==='cashier'){const g=line()[0];return g&&freeSeat()>=0?make('take',g.id,null,2.4):null;}
    if(role==='cleaner'){
      const seat=state.dirty.findIndex((d,n)=>d&&!(state.job?.kind==='clean'&&state.job.seat===n));
      return seat>=0?make('wipe',0,seat,2.5):null;
    }
    if(role==='barista'||role==='cook'){
      // A parked cup is an invitation for help. Manually docked cups remain for their player.
      const available=guests.filter(g=>g.cupAt==='unused'||g.cupAt==='shelf'||(g.cup.auto&&equipment.includes(g.cupAt)&&!running(g)));
      for(const g of available){
        const c=g.cup;
        if(c.stage==='filled'&&c.flavor===g.drink&&g.top!==c.top&&!occupant('top')){
          if(role==='cook'||!state.staff.cook.level||!state.staff.cook.onDuty)return dock(g,'top',g.top,role);
        }
        if(role==='barista'&&c.stage==='filled'&&c.flavor===g.drink&&g.top===c.top&&!occupant('lid'))return dock(g,'lid',null,role);
      }
      if(role==='barista'&&freeBay()){
        const g=available.find(g=>g.cup.stage==='empty'||g.cup.stage==='filled'&&g.cup.flavor!==g.drink);
        if(g)return dock(g,freeBay(),g.drink,role);
      }
    }
    if(role==='server'){
      const g=guests.find(g=>g.cup.stage==='ready'&&(g.cupAt==='shelf'||g.cupAt==='lid'&&g.cup.auto));
      if(g)return make('serveCup',g.id,g.seat,2.1);
    }
    return null;
  }
  function advanceMachines(dt){
    let changed=false;
    for(const o of tickets()){
      if(o.cupAt==='waitTea'||o.cupAt==='waitLid'){
        const at=o.cupAt==='waitTea'?freeBay():!occupant('lid')&&'lid';
        if(at){o.cupAt=at;changed=true;}
      }
      if(!running(o))continue;
      const c=o.cup;c.left=Math.max(0,c.left-dt);
      const worker=c.actor&&state.staff[c.actor];
      if(worker?.task?.id===o.id)worker.task.left=c.left;
      if(c.left>0)continue;
      if(o.cupAt==='top')c.top=c.dose??o.top;
      c.dose=null;
      c.stage=o.cupAt==='lid'?'ready':'filled';
      if(worker){
        if(worker.task?.id===o.id)worker.task=null;
        if(o.cupAt==='lid'||c.actor==='cook')worker.done++;
      }
      c.actor=null;changed=true;
    }
    return changed;
  }
  function workCrew(dt){
    let changed=false;
    for(const [role,w] of Object.entries(state.staff)){
      if(!w.level||!w.onDuty||state.shift.complete)continue;
      if(!w.task){w.task=nextTask(role,w);if(w.task)changed=true;continue;}
      const t=w.task;
      if(['brew','top','seal'].includes(t.kind))continue;
      t.left=Math.max(0,t.left-dt);
      if(t.left)continue;
      const g=order(t.id);w.task=null;changed=true;
      if(t.kind==='take'){if(take(g,false))w.done++;}
      else if(t.kind==='wipe'){if(state.dirty[t.seat]){wipe(t.seat);w.done++;}}
      else if(t.kind==='serveCup'&&g){w.done++;give(g);}
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
    }
    if(advanceMachines(dt))changed=true;
    if(workCrew(dt))changed=true;
    const queueCap=state.shift.greeted?3:2;
    if(!state.shift.complete&&orders().length<state.shift.quota-state.shift.served&&line().length<queueCap){
      state.arrival=Math.max(0,state.arrival-dt);
      if(!state.arrival){arrive();changed=true;}
    }
    return changed;
  }
  function atRack(){
    const eligible=o=>o&&['unused','shelf'].includes(o.cupAt)&&!assigned('server',o.id);
    return eligible(tracked())?tracked():tickets().find(eligible);
  }
  function collectable(id){
    const possible=tickets().filter(o=>counterFor(o.cupAt)===id&&equipment.includes(o.cupAt)&&!running(o)&&!assigned('server',o.id));
    return possible.find(o=>o.id===state.selected)||possible[0];
  }
  function quest(){
    if(briefing)return [null,'Prepare for round '+state.shift.number];
    if(state.shift.complete)return [null,'Round complete'];
    if(state.job)return ['pickup','Cleaning the pickup pass'];
    const h=held(),o=h||tracked();
    if(h){
      if(h.cup.stage==='empty'||h.cup.flavor!==h.drink||h.cup.stage==='ready'&&h.cup.top!==h.top)return ['tea','Choose '+drink(h.drink).name+' at the tea brewer'];
      if(h.cup.stage==='filled'&&h.cup.top!==h.top)return ['top',h.top?'Choose '+app.ingredients[h.top].name:'Clear the topping'];
      if(h.cup.stage!=='ready')return ['lid','Put the cup in the lid press'];
      return ['pickup','Bring '+h.name+'’s drink to pickup'];
    }
    if(o&&equipment.includes(o.cupAt)&&!running(o)&&!assigned('server',o.id))return [counterFor(o.cupAt),'Collect '+o.name+'’s cup'];
    if(o&&['unused','shelf'].includes(o.cupAt)&&!assigned('server',o.id))return ['rack','Pick up a cup for '+o.name];
    const guest=line()[0];
    if(guest&&freeSeat()>=0&&!assigned('cashier',guest.id))return ['line','Ask '+guest.name+' for their order'];
    const other=atRack();if(other)return ['rack','Pick up a cup for '+other.name];
    if(dirtyTray()>=0)return ['pickup','Clear a tray at pickup'];
    if(o&&running(o))return [counterFor(o.cupAt),machineNames[o.cupAt]+' is working for '+o.name];
    if(o)return ['pickup','Your crew is helping '+o.name];
    return [null,guest?'Waiting for a clean tray':'The next guest is on the way'];
  }
  function stationName(id){
    return {line:'Register',rack:'Cup shelf',tea:'Tea brewer',top:'Topping bowl',lid:'Lid press',pickup:'Pickup pass'}[id]||'';
  }
  const exists=id=>id==='line'?!!line().length:id==='pickup'?tickets().length>0||state.dirty.includes(true):true;
  function action(at){
    if(!at||state.job||chooser)return '';
    const h=held();
    if(at==='line'){const head=line()[0];return head&&freeSeat()>=0?'Ask '+head.name:'';}
    if(at==='pickup'){
      if(h?.cup.stage==='ready'&&h.cup.flavor===h.drink&&h.cup.top===h.top)return 'Serve '+h.name;
      if(!h&&dirtyTray()>=0)return 'Clear pickup tray';
    }
    if(at==='rack'){
      if(h)return 'Park cup';
      const g=atRack();if(g)return g.cupAt==='shelf'?'Pick up '+g.name+'’s cup':'Get cup for '+g.name;
    }
    if(!h){const g=collectable(at);return g?'Collect '+g.name+'’s cup':'';}
    if(at==='tea'&&freeBay()&&(h.cup.stage==='empty'||h.cup.stage==='filled'||h.cup.stage==='ready'&&(h.cup.top!==h.top||h.cup.flavor!==h.drink)))return h.cup.stage==='empty'?'Choose tea':'Refill cup';
    if(at==='top'&&!occupant('top')&&h.cup.stage==='filled'&&h.cup.flavor===h.drink&&h.top!==h.cup.top)return h.top?(optionsFor('top',h).length>1?'Choose topping':'Add '+app.ingredients[h.top].name):'Clear topping';
    if(at==='lid'&&!occupant('lid')&&h.cup.stage==='filled'&&h.cup.flavor===h.drink&&h.cup.top===h.top)return 'Press lid';
    return '';
  }
  function pulse(at,label){
    contact={at,label,age:0};room.pulse?.(at);
  }
  function optionsFor(station,guest){
    if(station==='tea')return app.drinks.filter(d=>app.state.unlocked.includes(d.id)||d.id===guest.drink);
    if(!guest.top)return [{id:'none',name:'No topping'}];
    return app.tops.filter(id=>app.state.unlocked.includes(id)||id===guest.top).map(id=>({id,name:app.ingredients[id].name}));
  }
  function focusChoice(){
    (by('.bw-recipe-options [data-requested="true"]')||by('.bw-recipe-options button'))?.focus({preventScroll:true});
  }
  function openChooser(o,station){
    const menu=optionsFor(station,o);if(!menu.length)return;
    const requested=station==='tea'?o.drink:o.top;
    chooser={id:o.id,station,page:Math.max(0,Math.floor(menu.findIndex(d=>d.id===requested)/9))};
    room.clear();room.releaseLook();render();focusChoice();
  }
  function closeChooser(capture=true){
    if(!chooser)return;chooser=null;
    if(capture){render();if(active())playLook();}
  }
  function showChoices(){
    const panel=by('.bw-recipe-panel');panel.hidden=!chooser;
    if(!chooser)return;
    const g=order(chooser.id),tea=chooser.station==='tea',requested=tea?g.drink:g.top;
    const menu=optionsFor(chooser.station,g),pages=Math.ceil(menu.length/9),start=chooser.page*9;
    by('.bw-recipe-card h2').textContent=tea?'Choose a tea':'Choose a topping';
    by('.bw-recipe-ticket').textContent=g.name+' ordered '+(tea?drink(g.drink).name:app.ingredients[g.top]?.name||'no topping')+
      (tea&&g.cup.stage!=='empty'?' · Replaces the tea in this cup.':!tea&&g.cup.top?' · Replaces the current topping.':'');
    const stamp=[g.id,chooser.station,start,menu.map(d=>d.id)].join('|');
    if(panel.dataset.menu!==stamp){
      panel.dataset.menu=stamp;
      by('.bw-recipe-options').innerHTML=menu.slice(start,start+9).map((d,i)=>'<button type="button" data-service="recipe" data-id="'+d.id+'" data-requested="'+(requested===d.id)+'"><kbd>'+(i+1)+'</kbd><span>'+d.name+'</span></button>').join('');
    }
    const nav=by('.bw-recipe-pages');nav.hidden=pages<2;
    nav.querySelector('span').textContent=(chooser.page+1)+' / '+pages;
    by('[data-service="prevtea"]').disabled=chooser.page===0;by('[data-service="nexttea"]').disabled=chooser.page+1>=pages;
    by('[data-service="nexttea"]').textContent=tea?'More teas':'More toppings';
  }
  function changePage(step){
    if(!chooser)return;
    const total=optionsFor(chooser.station,order(chooser.id)).length;
    chooser.page=Math.max(0,Math.min(Math.ceil(total/9)-1,chooser.page+step));
    showChoices();focusChoice();
  }
  function choose(id){
    const h=held();if(!chooser||!h||h.id!==chooser.id)return;
    const {station}=chooser,bay=station==='tea'?freeBay():!occupant('top')&&'top';
    if(!optionsFor(station,h).some(d=>d.id===id))return;
    if(!bay){say('Station busy. Collect the finished cup first.');closeChooser();return;}
    dock(h,bay,id==='none'?null:id);pulse(station,station==='tea'?'Cup loaded':'Scooping');
    say(machineNames[bay]+(station==='tea'?' is brewing for ':' is scooping for ')+h.name+'.');
    app.save();closeChooser();
  }
  function interact(){
    if(!canMove()||state.job)return;
    const at=roomApi.nearest(state.pose,exists);if(!action(at))return;
    const h=held();
    if(at==='line'){
      const front=line()[0];if(take(front,true)){pulse(at,'Ticket written');say(front.name+'’s ticket is on the rail.');}
    }else if(at==='pickup'){
      if(!h){state.job={kind:'clean',seat:dirtyTray(),left:cleanTime};pulse(at,'Wiping tray');}
      else{state.hand=null;give(h);pulse(at,'Drink served');}
    }else if(at==='rack'){
      if(h){h.cupAt='shelf';h.cup.auto=false;state.hand=null;pulse(at,'Cup parked');}
      else{const g=atRack();g.cupAt='hand';g.cup.auto=false;state.hand={kind:'cup',id:g.id};state.selected=g.id;pulse(at,'Cup picked up');}
    }else if(!h){
      const g=collectable(at);
      if(!g)return;g.cupAt='hand';g.cup.auto=false;g.cup.actor=null;state.hand={kind:'cup',id:g.id};state.selected=g.id;pulse(at,'Cup collected');
    }else if(at==='tea'||at==='top'&&optionsFor('top',h).length>1){openChooser(h,at);return;}
    else{dock(h,at,at==='top'?h.top:null);pulse(at,at==='top'?'Scooping':'Lid loaded');}
    app.save();render();
  }
  function sprint(metres){
    const guest=held();
    if(!active()||state.job||state.hand?.kind!=='cup'||guest?.cup.stage!=='filled'||!Number.isFinite(metres)||metres<=0)return;
    // An open drink has about a 2% chance of spilling over a five-metre dash, regardless of frame rate.
    if(Math.random()>=-Math.expm1(-.004*metres))return;
    guest.cup=cup();say('Spilled! Refill '+guest.name+'’s cup at '+stationName('tea')+'.');app.save();render();
  }
  function color(id){return id==='classic'?'#c88a60':id==='jasminemt'?'#a4bd80':id==='bsmilk'?'#ac7055':app.ingredients[drink(id).ings[0]].c;}
  function objects(){
    const actor=o=>({id:o.id,name:o.name,coat:o.coat,mood:mood(o),arriving:arrivals.has(o)});
    function machine(id){
      const o=occupant(id);
      return {label:machineNames[id],running:running(o),ready:!!o&&!running(o),jobId:o?.id??null,owner:o?.name||'',flavor:o?.cup.flavor??null,
        color:o?.cup.flavor?color(o.cup.flavor):'#c99566',left:o?.cup.left||0,total:o?.cup.duration||0,
        progress:o?(o.cup.duration?1-o.cup.left/o.cup.duration:1):0,detail:o?o.name:''};
    }
    const items={rack:{label:'Cup shelf'},tea:{label:'Tea brewer',bays:bays.map(id=>occupant(id)?machine(id):null)},top:machine('top'),lid:machine('lid'),
      line:{label:'Register',guests:line().map(actor)},pickup:{label:'Pickup pass',dirty:state.dirty.includes(true),guests:tickets().map(actor)},crew:[]};
    for(const [role,w] of Object.entries(state.staff))if(w.level&&w.onDuty){
      const t=w.task,anchor={take:'line',wipe:'pickup',brew:'tea',top:'top',seal:'lid',serveCup:'pickup'};
      items.crew.push({role,name:roles[role].name,coat:roles[role].coat,working:!!t,
        station:t?anchor[t.kind]:{cashier:'line',cleaner:'pickup',barista:'tea',cook:'top',server:'pickup'}[role]});
    }
    return items;
  }
  function ticket(o){
    return '<button type="button" class="bs-ticket" data-service="track" data-id="'+o.id+'" data-mood="'+mood(o)+'" aria-pressed="'+(state.selected===o.id)+'"><span><b>#'+String(o.id).padStart(2,'0')+' · '+o.name+'</b><i data-time="'+o.id+'"></i></span><strong>'+drink(o.drink).name+'</strong><small>'+(o.top?app.ingredients[o.top].name:'No topping')+'</small><i class="bs-meter"><i data-patience="'+o.id+'"></i></i></button>';
  }
  function taskText(t){
    if(!t)return 'Waiting for work';
    const o=order(t.id),guest=o?.name||'guest';
    return {take:'Taking '+guest+'’s order',wipe:'Clearing a pickup tray',brew:'Brewing for '+guest,top:'Adding boba for '+guest,
      seal:'Sealing '+guest+'’s cup',serveCup:'Taking a drink to '+guest}[t.kind];
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
    if(chooser)closeChooser(false);crewOpen=show;room.clear();last=performance.now();render();
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
  function drawMachineTimers(){
    const rail=by('.bw-machine-timers');
    const machines=equipment.filter(id=>occupant(id));
    const stamp=machines.map(id=>id+'-'+occupant(id).id).join('|');
    if(rail.dataset.jobs!==stamp){
      rail.dataset.jobs=stamp;
      rail.innerHTML=machines.map(id=>{
        const o=occupant(id);
        return '<div class="bw-machine-timer" data-machine="'+id+'" data-owner="'+o.id+'"><strong>'+machineNames[id]+' · '+o.name+'</strong><small></small><meter min="0" max="1" aria-label="'+machineNames[id]+' progress"></meter></div>';
      }).join('');
    }
    for(const row of rail.children){
      const o=order(Number(row.dataset.owner));if(!o)continue;
      const c=o.cup,isRunning=running(o),text=isRunning?c.left.toFixed(1)+'s':'Ready';
      row.dataset.ready=String(!isRunning);
      const label=row.querySelector('small');if(label.textContent!==text)label.textContent=text;
      row.querySelector('meter').value=isRunning&&c.duration?1-c.left/c.duration:1;
    }
    const beat=by('.bw-action-pulse');beat.hidden=!contact;
    if(contact){const text=contact.label+' · '+Math.max(0,.45-contact.age).toFixed(1)+'s';if(beat.textContent!==text)beat.textContent=text;beat.style.setProperty('--pulse',String(Math.min(1,contact.age/.45)));}
    const working=Object.entries(state.staff).find(([,w])=>w.task);
    const staff=working?roles[working[0]].name+' · '+taskText(working[1].task)+' · '+working[1].task.left.toFixed(1)+'s':'';
    if(by('.bw-on-floor').textContent!==staff)by('.bw-on-floor').textContent=staff;
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
    by('.bs-pause').disabled=briefing||crewOpen||f.complete;
    by('.bs-work').inert=briefing||state.paused||crewOpen||!!chooser||f.complete;by('.bs-paused').hidden=briefing||!state.paused||crewOpen||f.complete;
    by('.bw-crewboard').hidden=!crewOpen;by('.bw-receipt').hidden=!f.complete||crewOpen;
    const brief=by('.bw-briefing');brief.hidden=!briefing||crewOpen;
    if(briefing){
      by('.bw-round-title').textContent='Round '+f.number;
      by('.bw-round-goal').textContent='Serve '+f.quota+' cats';
      const info=by('.bw-round-saved');info.hidden=!f.started;
      info.textContent=f.started?'Saved round · '+f.served+'/'+f.quota+' served'+(taken.length?' · '+taken.length+' open '+(taken.length===1?'ticket':'tickets'):''):'';
      by('[data-service="begin"]').textContent=f.started?'Resume round':'Start round';
    }
    showChoices();drawMachineTimers();
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
    if(h){
      hand.className='bw-hand '+(h.cup.stage==='ready'?'bw-h-cup bw-sealed':'bw-h-cup')+(h.cup.top?' bw-topped':'');
      const contents=h.cup.stage==='ready'?'Sealed cup':h.cup.stage==='filled'?'Open cup · '+drink(h.cup.flavor).name:h.cup.flavor?drink(h.cup.flavor).name:'Empty cup';
      hand.style.setProperty('--brew',h.cup.flavor?color(h.cup.flavor):'#e3cbb943');hand.querySelector('b').textContent=h.name+' · '+contents;}
    room.paint(objects());if(!active())room.frame(0);readout='';markers();patienceDisplay();
  }
  function machineHint(at){
    const h=held();
    if(!h||action(at)||!['tea','top','lid'].includes(at))return '';
    if(at==='tea'&&!freeBay()||at!=='tea'&&occupant(at)){
      return 'Busy · park your cup on the shelf to collect another';
    }
    return '';
  }
  function markers(){
    const at=roomApi.nearest(state.pose,exists),[to,title]=quest(),dir=roomApi.direction(state.pose,to),cmd=action(at);
    const job=state.job,left=job?.left;
    let location='';
    if(dir)location=Math.abs(dir.angle)>.48?(Math.abs(dir.angle)>2.45?'Turn around':dir.angle>0?'Turn right':'Turn left'):
      dir.distance>1.62?'Walk forward':'Within reach';
    const status=performance.now()<noticeUntil?notice:machineHint(at);
    const key=[at,to,title,cmd,location,dir?.distance.toFixed(1),job&&Math.ceil(left*10),status,state.paused].join('|');
    if(readout!==key){
      readout=key;const button=by('.bw-use');
      button.textContent=job?'Working…':cmd||'Interact';button.disabled=!cmd||!!job||state.paused;
      button.dataset.near=at||'';by('.bw-step').textContent=title;
      by('.bw-way').textContent=job?'Wiping · '+left.toFixed(1)+'s':(dir?location+' · '+dir.distance.toFixed(1)+' m':'');
      by('.bw-job').hidden=!job;
      if(job){const duration=cleanTime;by('.bw-job i').style.width=(100*(1-left/duration))+'%';}
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
      if(contact){contact.age+=dt;if(contact.age>=.45)contact=null;}
      room.frame(dt);
      if(advance(dt)){app.save();render();}
      markers();
      patienceDisplay();drawMachineTimers();
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
    if(chooser)closeChooser(false);
    state.paused=!state.paused;room.clear();last=performance.now();app.save();render();
    if(state.paused){room.releaseLook();by('.bs-paused [data-service="pause"]').focus({preventScroll:true});}else playLook();
  }
  function open(){
    if(dialog.open)return;app.enter();chooser=null;contact=null;state=app.state.cafeService;
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
    '<main class="bs-work"><div class="bw-view" tabindex="0" aria-label="First-person café. Move the mouse to look, WASD to walk, Shift to sprint, E to interact, and Q to switch tickets. Escape pauses and shows the cursor."></div><section class="bw-rail" aria-label="Order rail"><div class="bw-shift-label"><b class="bw-shift-count"></b><small class="bw-line-count"></small></div><div class="bs-tickets"></div><div class="bw-machine-timers" aria-label="Workstation timers"></div><small class="bw-on-floor"></small></section><div class="bw-map" role="img"><i class="bw-player"></i><i class="bw-dest"></i></div><i class="bw-reticle" aria-hidden="true"></i>'+
    '<div class="bw-hand" hidden><div class="bw-held-art"><i></i><i></i></div><b></b></div><div class="bw-controls"><div class="bw-joystick" aria-label="Movement stick"><i></i></div><div class="bw-guide"><strong class="bw-step"></strong><small class="bw-action-pulse" hidden></small><small class="bw-way"></small><i class="bw-job" hidden><i></i></i><small class="bs-msg" role="status"></small></div><button class="bw-use" type="button" data-service="use"></button></div>'+
    '<div class="bw-legend"><span class="bw-desktop-keys">WASD walk · Mouse look · Shift sprint · E use · Q tickets · C crew · Esc pause</span><span class="bw-mobile-keys">Stick to walk · Drag to look</span><span class="bw-turns"><button type="button" class="bw-sprint" aria-pressed="false">Sprint</button><button type="button" data-service="left" aria-label="Turn left">↶</button><button type="button" data-service="right" aria-label="Turn right">↷</button></span></div></main>'+
    '<aside class="bw-recipe-panel" hidden><section class="bw-recipe-card" role="dialog" aria-modal="true" aria-labelledby="bwRecipeHeading"><header><h2 id="bwRecipeHeading">Choose a tea</h2><button type="button" class="bw-recipe-close" data-service="recipeclose" aria-label="Close recipe menu">Close</button></header><p class="bw-recipe-ticket"></p><div class="bw-recipe-options"></div><nav class="bw-recipe-pages" aria-label="Recipe pages"><button type="button" data-service="prevtea">Previous</button><span></span><button type="button" data-service="nexttea">More teas</button></nav></section></aside>'+
    '<aside class="bs-paused" hidden><div><span>☾</span><h2>Round paused</h2><p>Your cats and machines will wait.</p><button type="button" data-service="pause">Resume round</button></div></aside>'+
    '<aside class="bw-receipt" hidden><section role="status"><small>Midnight Paws Café</small><h2></h2><div class="bw-round-stars" role="img"></div><p></p><ul class="bw-round-ratings"></ul><button type="button" data-service="next">Next round</button></section></aside>'+
    '<aside class="bw-crewboard" hidden><section role="dialog" aria-label="Café crew"><header><div><h2>Café crew</h2><strong class="bw-crew-wallet"></strong></div><button type="button" data-service="crewclose">Back to café</button></header><div class="bw-crew-list"></div></section></aside><div class="bs-save-warning" role="alert"></div>';
    dialog.append(document.getElementById('bwRoundBrief').content.cloneNode(true));
    room=roomApi.create(by('.bw-view'),{state:()=>state,running:canMove,use:interact,portrait:app.portrait,joystick:by('.bw-joystick'),sprintButton:by('.bw-sprint'),
      onSprint:sprint,onUnlock(){if(canMove())pause();}});
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
      if(chooser){
        if(id==='recipe')choose(b.dataset.id);
        else if(id==='recipeclose')closeChooser();
        else if(id==='prevtea'||id==='nexttea')changePage(id==='prevtea'?-1:1);
        return;
      }
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
      if(chooser){
        const choices=[...by('.bw-recipe-options').querySelectorAll('button')];
        const number=/^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if(number){e.preventDefault();const option=choices[Number(number[1])-1];if(option)choose(option.dataset.id);}
        else if(['BracketLeft','BracketRight','PageDown','PageUp'].includes(e.code)){e.preventDefault();changePage(['BracketLeft','PageUp'].includes(e.code)?-1:1);}
        else if(e.key==='Tab'){
          const controls=[...by('.bw-recipe-card').querySelectorAll('button:not(:disabled)')].filter(b=>!b.closest('[hidden]'));
          if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}
          else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}
        }
        else if(e.code==='ArrowDown'||e.code==='ArrowUp'){e.preventDefault();const i=choices.indexOf(document.activeElement),step=e.code==='ArrowDown'?1:-1;choices[(i+step+choices.length)%choices.length]?.focus();}
        return;
      }
      if(e.code==='KeyE'){e.preventDefault();interact();}else if(e.code==='KeyP'){e.preventDefault();pause();}
      else if(e.code==='KeyC'){e.preventDefault();toggleCrew(!crewOpen);}
      else if(active()&&(e.code==='KeyQ'||/^Digit[1-3]$/.test(e.code))){
        e.preventDefault();const openTickets=tickets();if(!openTickets.length)return;
        const index=e.code==='KeyQ'?(openTickets.findIndex(o=>o.id===state.selected)+1)%openTickets.length:Number(e.code.slice(-1))-1;
        if(openTickets[index]){state.selected=openTickets[index].id;app.save();render();}
      }
    });
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(chooser)closeChooser();else if(crewOpen)toggleCrew(false);else if(active())pause();});
    dialog.addEventListener('close',()=>{chooser=null;contact=null;cancelAnimationFrame(frameId);room.releaseLook();room.clear();app.save();app.exit();});
    document.addEventListener('visibilitychange',()=>{if(dialog.open){room.clear();last=performance.now();if(document.hidden){if(!briefing&&!crewOpen&&!state.shift.complete&&!state.paused)pause();else app.save();}}});
    window.addEventListener('pagehide',()=>{if(dialog.open)app.save();});
  }
  return {init,open,valid,resetForRebirth};
})();
