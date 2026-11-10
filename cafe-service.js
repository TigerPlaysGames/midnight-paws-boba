/* First-person service shares the café wallet and only advances while open and visible. */
window.BobaService=(()=>{
  'use strict';
  const roomApi=window.BobaRoom, pourTime=3.5,lidTime=1.3,topTime=.75,ovenTime=2.8,cleanTime=1.7,arrivalTime=3;
  const orderTime = 2;
  const crew = window.BobaWorkers;
  const jobForSlot = Object.fromEntries(crew.tracks.map(job=>[crew.jobs[job].slot,job]));
  const jobForMachine = {tea0:'brewer',tea1:'brewer',milk:'brewer',ice:'finisher',top:'finisher',lid:'finisher',shake:'finisher'};
  const helpersFor = {tea:['barista'],milk:['cleaner','barista'],ice:['cook','cleaner','barista'],
    top:['cook','barista'],lid:['cook','barista'],shake:['cook','barista']};
  const workerCard = slot => crew.cards.get(state.workers?.equipped[jobForSlot[slot]]);
  const timeWithCrew = (seconds, job) => seconds * (1-crew.bonus(state.workers,job)/100) * BobaCareer.timeFactor(state,job);
  const desserts={bao:'Steamed veggie bao',toast:'Sesame toast',onigiri:'Grilled onigiri',mochi:'Strawberry mochi',taiyaki:'Custard taiyaki',roll:'Matcha roll'};
  const roles={
    cashier:{kinds:['take']},
    cleaner:{kinds:['wipe','milk','ice']},
    barista:{kinds:['brew','milk','ice','top','seal','shake']},
    cook:{kinds:['cook','ice','top','seal','shake']},
    server:{kinds:['serveCup','serveFood']}
  };
  const bays=['tea0','tea1'],equipment=[...bays,'milk','ice','top','lid','shake'];
  const machineNames={tea0:'Brewer A',tea1:'Brewer B',milk:'Milk dispenser',ice:'Ice bin',top:'Topping bowl',lid:'Lid press',shake:'Shaker'};
  const operation={tea0:'pouring',tea1:'pouring',milk:'milking',ice:'icing',top:'topping',lid:'sealing',shake:'shaking'};
  const finishedStage={tea0:'filled',tea1:'filled',milk:'filled',ice:'filled',top:'filled',lid:'sealed',shake:'ready'};
  const durationByStation={tea0:pourTime,tea1:pourTime,milk:1.2,ice:.8,top:topTime,lid:lidTime,shake:2};
  const taskByStation={tea0:'brew',tea1:'brew',milk:'milk',ice:'ice',top:'top',lid:'seal',shake:'shake'};
  const stages=['empty','filled','sealed','ready',...new Set(Object.values(operation))];
  let app,dialog,room,home,state,frameId,last,saveDue,readout='',notice='',noticeUntil=0,crewOpen=false,drawMessage='',briefing=false,chooser=null,contact=null;
  const by=s=>dialog.querySelector(s),pick=a=>a[Math.floor(Math.random()*a.length)];
  const drink=id=>app.drinks.find(d=>d.id===id), orders=()=>state.orders;
  const order=id=>orders().find(o=>o.id===id), tracked=()=>order(state.selected);
  const held=()=>state.hand&&order(state.hand.id);
  const active=()=>!!(dialog?.open && state && !state.paused && !briefing && !crewOpen && state.shift.started && !state.shift.complete && !document.hidden);
  const within=(n,max)=>Number.isFinite(n)&&n>=0&&n<=max;
  const cup=()=>({stage:'empty',flavor:null,base:null,milk:false,ice:false,top:null,left:0,duration:0,auto:false,actor:null,dose:null});
  const occupant=id=>tickets().find(o=>o.cupAt===id);
  const freeBay=()=>bays.find(id=>!occupant(id));
  const running=o=>!!o&&equipment.includes(o.cupAt)&&o.cup.stage===operation[o.cupAt];
  const canMove=()=>active()&&!chooser;
  const counterFor=id=>bays.includes(id)?'tea':id;
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  const newShift=n=>({number:n,quota:Math.min(8,n+2),served:0,missed:0,earned:0,timely:0,complete:false,greeted:false,started:false});
  const newStaff=()=>Object.fromEntries(Object.keys(roles).map(k=>[k,{level:0,done:0,onDuty:true,task:null}]));
  const fresh=()=>({version:5,paused:false,serial:0,arrival:3,selected:null,orders:[],pose:roomApi.spawn(),hand:null,job:null,
    shift:newShift(1),staff:newStaff(),career:{shifts:0,served:0,missed:0,cleaned:0}});
  const line=()=>orders().filter(o=>!o.taken);
  function writingTicket() {
    const guest = orders().find(order => !order.taken);
    return guest?.orderLeft > 0 ? guest : null;
  }
  const tickets=()=>orders().filter(o=>o.taken).sort((a,b)=>a.id-b.id);
  const registerPoint=roomApi.guestSpot(false,0);
  const atRegister=o=>!!o?.walk&&o.walk.x===registerPoint.x&&o.walk.z===registerPoint.z;
  function restoreGuestPositions(){
    for(const group of [line(),tickets()])group.forEach((o,i)=>{o.walk??=roomApi.guestSpot(o.taken,i);});
  }
  function walkGuests(dt){
    for(const group of [line(),tickets()]){
      group.forEach((o,index)=>{
        const target=roomApi.guestSpot(o.taken,index),p=o.walk;
        const dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz),step=2.35*dt;
        if(distance<=step){p.x=target.x;p.z=target.z;}
        else {p.x+=dx/distance*step;p.z+=dz/distance*step;}
      });
    }
  }
  const seated=n=>orders().find(o=>o.taken&&o.seat===n);
  const freeSeat=()=>[0,1,2].find(n=>!seated(n))??-1;
  const needsMilk=o=>drink(o.drink).ings.includes('milk');
  const rightBase=o=>o.cup.base===drink(o.drink).base;
  const mixed=o=>rightBase(o)&&o.cup.milk===needsMilk(o)&&o.cup.ice===o.ice&&o.cup.top===o.top;
  const starterTops=['pearls','foam','nata'];
  const availableTops=()=>app.tops.filter(t=>starterTops.includes(t)||app.state.unlocked.includes(t));
  const waitLimit=()=>Math.max(20,33-state.shift.number);
  const serviceLimit=o=>Math.max(49,66-state.shift.number)+(needsMilk(o)?5:0)+(o.ice?3:0)+(o.top?3:0);
  const mood=o=>o.left/o.limit<.25?'angry':o.left/o.limit<.55?'restless':'calm';
  function valid(s){
    if(!app||!s||![1,2,3,4,5].includes(s.version)||typeof s.paused!=='boolean'||!count(s.serial)||
       !within(s.arrival,3)||!Array.isArray(s.orders)||s.orders.length>(s.version>=3?6:3))return false;
    const ids=new Set(),seats=new Set(),occupied=new Set();
    if (s.workers!==undefined && !crew.valid(s.workers)) return false;
    if(!BobaCareer.valid(s))return false;
    const modern=s.version===5,stations=modern?equipment:[...bays,'top','lid'];
    for(const o of s.orders){
      if(!o||!Number.isSafeInteger(o.id)||o.id<1||o.id>s.serial||ids.has(o.id)||!app.names.includes(o.name)||
        !app.coats.some(c=>c.id===o.coat)||!drink(o.drink)||(o.top!==null&&!app.tops.includes(o.top))||
        (o.greetingQuality!==undefined&&!within(o.greetingQuality,1))||
        (o.dessert!==null&&!Object.hasOwn(desserts,o.dessert))||!within(o.limit,120)||o.limit<1||!within(o.left,o.limit)||
        !(s.version===1?['none','waiting','baking','done']:['none','waiting','baking','done','given']).includes(o.side)||!within(o.bake,ovenTime))return false;
      const c=o.cup;
      if(o.walk!==undefined&&(!o.walk||!Number.isFinite(o.walk.x)||!Number.isFinite(o.walk.z)||Math.abs(o.walk.x)>12||Math.abs(o.walk.z)>12))return false;
      if(c?.rejected!==undefined&&typeof c.rejected!=='boolean')return false;
      if (o.orderLeft !== undefined && !within(o.orderLeft, orderTime)) return false;
      if(o.orderDuration!==undefined&&(!within(o.orderDuration,orderTime)||o.orderLeft===undefined||o.orderDuration<o.orderLeft))return false;
      if(!c||!stages.includes(c.stage)||(c.flavor!==null&&!drink(c.flavor))||(c.top!==null&&!app.tops.includes(c.top))||
        !within(c.left,pourTime)||(c.stage!=='empty'&&!c.flavor))return false;
      if(s.version>=2){
        if(typeof o.taken!=='boolean'||!['unused','hand','shelf','given',...(s.version>=4?[...stations,'waitTea','waitLid']:[])].includes(o.cupAt))return false;
        if(s.version>=4){
          if(o.dessert!==null||o.side!=='none'||o.bake!==0||o.cupAt==='given'||!within(c.duration,pourTime)||
             typeof c.auto!=='boolean'||(c.actor!==null&&!['barista','cook',...(modern?['cleaner']:[])].includes(c.actor))||(c.dose!=null&&!app.tops.includes(c.dose))||c.left>c.duration)return false;
          if(modern&&(typeof o.ice!=='boolean'||typeof c.milk!=='boolean'||typeof c.ice!=='boolean'||
             c.base!==(c.flavor?drink(c.flavor).base:null)))return false;
          if(!o.taken&&(o.cupAt!=='unused'||c.stage!=='empty'))return false;
          if(stations.includes(o.cupAt)){
            if(!o.taken||occupied.has(o.cupAt))return false;
            occupied.add(o.cupAt);
            const done=modern?finishedStage[o.cupAt]:o.cupAt==='lid'?'ready':'filled';
            if(c.stage!==operation[o.cupAt]&&c.stage!==done)return false;
            if(c.stage===operation[o.cupAt]&&(!c.duration||!c.left))return false;
          }else if(o.cupAt==='waitTea'||o.cupAt==='waitLid'){
            if(!o.taken||c.stage!==(o.cupAt==='waitTea'?'pouring':'sealing'))return false;
          }else if(Object.values(operation).includes(c.stage))return false;
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
         f.levelBonus!==undefined&&!count(f.levelBonus)||f.partialReceipt!==undefined&&typeof f.partialReceipt!=='boolean'||
         f.greeted!==undefined&&typeof f.greeted!=='boolean'||f.started!==undefined&&typeof f.started!=='boolean'||
         f.started===false&&(f.served>0||f.missed>0||f.complete||s.orders.length>0)||f.timely!==undefined&&(!count(f.timely)||f.timely>f.served)||
         !count(f.earned)||f.served+s.orders.length>f.quota||f.complete!==(f.served===f.quota)||
         (!modern&&(!Array.isArray(s.dirty)||s.dirty.length!==3||s.dirty.some((d,i)=>typeof d!=='boolean'||d&&seats.has(i))))||
         !staff||!career||!['shifts','served','missed','cleaned'].every(k=>count(career[k])))return false;
      for(const [role,def] of Object.entries(roles)){
        const w=staff[role];
        if(!w||!Number.isInteger(w.level)||!within(w.level,s.workers?5:3)||!count(w.done)||typeof w.onDuty!=='boolean')return false;
        if(s.workers) {
          const id=s.workers.equipped[jobForSlot[role]];
          if (!!id!==!!(w.level && w.onDuty) || (id && w.level!==s.workers.owned[id].level)) return false;
        }
        const t=w.task;
        if(t!==null&&(!t||!w.level||!def.kinds.includes(t.kind)||!within(t.left,12)||
          (t.kind==='wipe'?modern||t.id!==0||!Number.isInteger(t.seat)||!s.dirty[t.seat]:!ids.has(t.id))))return false;
        if(!t)continue;
        if(!w.onDuty)return false;
        if(t.kind==='wipe')continue;
        const guest=s.orders.find(o=>o.id===t.id);
        if(t.kind==='take'){
          if(t.seat!==null||guest!==s.orders.find(o=>!o.taken))return false;
        }else if(!guest.taken||t.seat!==guest.seat)return false;
        if(s.version>=4){
          if(t.kind==='cook'||t.kind==='serveFood')return false;
          if(Object.values(taskByStation).includes(t.kind)&&(!running(guest)||taskByStation[guest.cupAt]!==t.kind||guest.cup.actor!==role))return false;
          if(t.kind==='serveCup'&&(guest.cup.stage!=='ready'||!['shelf',modern?'shake':'lid'].includes(guest.cupAt)))return false;
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
      if(!modern&&s.version>=3&&job?.kind==='clean')return !h&&Number.isInteger(job.seat)&&s.dirty[job.seat]===true&&within(job.left,cleanTime);
      if(s.version>=4)return false;
      const o=job&&s.orders.find(o=>o.id===job.id);
      if(!o?.taken || !(job.kind==='pour'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='pouring'||
        job.kind==='lid'&&h?.id===o.id&&h.kind==='cup'&&o.cup.stage==='sealing'||
        job.kind==='dessert'&&!h&&o.side==='baking'))return false;
    }
    return true;
  }
  function migrateOldService(s){
    if(s.version<3){
      if(s.version===1){
        s.orders.forEach((o,index)=>Object.assign(o,{seat:index,taken:true,cupAt:o.cup.stage==='empty'?'unused':'shelf'}));
        Object.assign(s,{pose:roomApi.spawn(),job:null,hand:null});
      }
      for(const o of s.orders)if(!o.taken)o.seat=null;
      const freshState=fresh();
      Object.assign(s,{shift:freshState.shift,staff:freshState.staff,career:freshState.career});
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
  function migrate(s){
    if(s.version===5)return s;
    if(s.version<4)migrateOldService(s);
    for(const o of s.orders){
      const c=o.cup,legacy=c.flavor&&drink(c.flavor);
      o.ice=false;c.ice=false;c.base=legacy?legacy.base:null;
      // The older dispenser added milk itself, including in cups saved halfway through a pour.
      c.milk=!!legacy&&legacy.ings.includes('milk');
      if(c.stage==='ready')c.stage='sealed';
    }
    s.job=null;delete s.dirty;
    if(s.staff.cleaner.task?.kind==='wipe')s.staff.cleaner.task=null;
    if(s.staff.server.task?.kind==='serveCup')s.staff.server.task=null;
    s.version=5;
    return s;
  }
  function arrive(){
    const drinks=app.drinks.filter(d=>app.state.unlocked.includes(d.id)),tops=availableTops();
    const different=drinks.filter(d=>!orders().some(o=>o.drink===d.id));
    const id=++state.serial;
    const firstRecipes=['bsmilk','jasminetea','jasminemt'];
    const signature=drink(BobaCareer.signature(state));
    const first=!orders().length&&!state.shift.served&&!state.shift.greeted;
    const recipe=first?signature:drinks.find(d=>d.id===firstRecipes[id-1])||
      (!orders().some(o=>o.drink===signature.id)&&Math.random()<.3?signature:pick(different.length?different:drinks));
    const ice=id<=3?id!==2:Math.random()<.6;
    const top=id<=3?['foam',null,'nata'][id-1]:(tops.length&&Math.random()<.68?pick(tops):null);
    const limit=waitLimit();
    const cats=app.coats.filter(c=>!c.rare||(app.state.level>=3&&Math.random()<.15));
    orders().push({id,seat:null,taken:false,name:pick(app.names.filter(n=>!orders().some(o=>o.name===n))),coat:pick(cats).id,
      drink:recipe.id,ice,top:tops.includes(top)?top:null,dessert:null,limit,left:limit,
      side:'none',bake:0,cup:cup(),cupAt:'unused',walk:{x:3.58,z:-9.4}});
    state.arrival=arrivalTime;
  }
  function remove(id){
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
    if(!atRegister(o)||o!==line()[0]||seat<0)return false;
    delete o.orderLeft;delete o.orderDuration;
    o.greetingQuality=o.left/o.limit;o.limit=serviceLimit(o);o.left=o.limit;o.taken=true;o.seat=seat;
    if(!state.shift.greeted)state.shift.greeted=true;
    if(track||!tracked())state.selected=o.id;
    if(state.staff.cashier.task?.id===o.id)state.staff.cashier.task=null;
    return true;
  }
  function give(o){
    if(!o||order(o.id)!==o)return false;
    if(state.shift.levelBonus===undefined){
      state.shift.partialReceipt=state.shift.served>0;
      state.shift.levelBonus=0;
    }
    const quality=Math.min(o.greetingQuality??1,o.left/o.limit);
    remove(o.id);state.shift.served++;state.career.served++;
    if(quality>=.45)state.shift.timely++;
    if(state.shift.served===state.shift.quota){
      state.shift.complete=true;state.career.shifts++;state.job=null;
      if(state.workers){state.workers.tickets++;state.shift.hiringTicket=true;}
      BobaCareer.finishRound(state,app.state);
      for(const worker of Object.values(state.staff))worker.task=null;
    }
    const walletBeforeDrink=app.state.money;
    const pay=app.reward(o,state.workers);
    state.shift.earned+=pay;
    state.shift.levelBonus+=Math.round(app.state.money-walletBeforeDrink-pay);
    say(o.name+(quality<.25?' left a small tip.':quality<.55?' collected their order.':' loved it!')+' +$'+pay);
    return true;
  }
  function resetForRebirth(){
    if(!app?.state.cafeService)return;
    const old=app.state.cafeService,next=fresh();
    if(valid(old)&&old.version>=3){
      next.career=old.career;next.staff=old.staff;
      next.workers=old.workers??crew.create(old.staff);
      for(const w of Object.values(next.staff))w.task=null;
    }
    app.state.cafeService=next;state=next;
  }
  function say(text){notice=text;noticeUntil=performance.now()+3200;}
  const assigned=(role,id,kind)=>{const t=state.staff[role].task;return t?.id===id&&(!kind||t.kind===kind);};
  function nextStation(o){
    const c=o.cup;
    if(c.stage==='empty'||!rightBase(o)||c.milk&&!needsMilk(o)||c.ice&&!o.ice)return 'tea';
    if(c.stage==='sealed'||c.stage==='ready')return mixed(o)?(c.stage==='sealed'?'shake':'pickup'):'tea';
    if(needsMilk(o)&&!c.milk)return 'milk';
    if(o.ice&&!c.ice)return 'ice';
    if(c.top!==o.top)return 'top';
    return 'lid';
  }
  function dock(o,at,recipe,worker=null){
    const duration=timeWithCrew(durationByStation[at],jobForMachine[at]);
    const c=o.cup;
    if(bays.includes(at)){
      const requested=drink(o.drink);
      const blend=requested.base===recipe?requested:app.drinks.find(d=>d.base===recipe);
      Object.assign(c,{flavor:blend.id,base:blend.base,milk:false,ice:false,top:null,rejected:false});
    }
    o.cupAt=at;Object.assign(c,{stage:operation[at],left:duration,duration,auto:!!worker,actor:worker,dose:at==='top'?recipe:null});
    if(state.hand?.id===o.id)state.hand=null;
    if(worker)return {kind:taskByStation[at],id:o.id,seat:o.seat,left:duration};
  }
  function nextTask(role,w){
    const guests=tickets();
    const make=(kind,id,seat,seconds)=>({kind,id,seat,left:seconds});
    if(role==='cashier'){const g=line()[0];return atRegister(g)&&!writingTicket()&&freeSeat()>=0?make('take',g.id,null,timeWithCrew(orderTime,'cashier')):null;}
    if(role==='server'){
      const g=guests.find(o=>o.cup.stage==='ready'&&mixed(o)&&(o.cupAt==='shelf'||o.cupAt==='shake'&&o.cup.auto));
      return g?make('serveCup',g.id,g.seat,2.1):null;
    }
    // A parked cup is an invitation for help. Manually docked cups remain for their player.
    const available=guests.filter(g=>g.cupAt==='unused'||g.cupAt==='shelf'||(g.cup.auto&&equipment.includes(g.cupAt)&&!running(g)));
    for(const g of available.sort((a,b)=>Number(a.cup.stage==='empty')-Number(b.cup.stage==='empty'))){
      const next=nextStation(g);
      if(next==='pickup')continue;
      const assignedSlot=helpersFor[next].find(slot=>state.staff[slot].level && state.staff[slot].onDuty);
      if(role!==assignedSlot)continue;
      const at=next==='tea'?freeBay():next;
      if(at&&!occupant(at))return dock(g,at,next==='tea'?drink(g.drink).base:g.top,role);
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
      if(o.cupAt==='milk')c.milk=true;
      if(o.cupAt==='ice')c.ice=true;
      if(o.cupAt==='top')c.top=c.dose;
      c.dose=null;
      c.stage=finishedStage[o.cupAt];
      if(worker){
        if(worker.task?.id===o.id)worker.task=null;
        if(o.cupAt==='shake'||c.actor==='cook'||c.actor==='cleaner')worker.done++;
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
      if(Object.values(taskByStation).includes(t.kind))continue;
      t.left=Math.max(0,t.left-dt);
      if(t.left)continue;
      const g=order(t.id);w.task=null;changed=true;
      if(t.kind==='take'){if(take(g,false))w.done++;}
      else if(t.kind==='serveCup'&&g){w.done++;give(g);}
    }
    return changed;
  }
  function startNext(){
    if(!state.shift.complete)return;
    state.shift=newShift(state.shift.number+1);state.paused=false;state.arrival=arrivalTime;
    state.selected=null;state.job=null;state.hand=null;state.pose=roomApi.spawn();briefing=true;
    last=performance.now();room.clear();room.frame(0);app.save();render();by('[data-service="begin"]').focus({preventScroll:true});
  }
  function advance(dt){
    let changed=false;
    const writing = writingTicket();
    if (writing && roomApi.direction(state.pose,'line').distance > roomApi.reach) {
      delete writing.orderLeft;
      delete writing.orderDuration;
      say('Order interrupted.');
      changed = true;
    }
    for(const o of [...orders()]){
      // A guest who is already talking to the player or cashier has been greeted.
      if (!o.taken && ((o === writing && o.orderLeft > 0) || assigned('cashier',o.id,'take'))) continue;
      const was=mood(o);
      o.left=Math.max(0,o.left-dt*(o.taken||o===line()[0]?1:.65));
      if(!o.left){remove(o.id);state.shift.missed++;state.career.missed++;app.state.combo=0;say(o.name+' left '+(o.taken?'without their order.':'before ordering.'));changed=true;}
      else if(was!==mood(o))changed=true;
    }
    if (writing?.orderLeft > 0) {
      writing.orderLeft = Math.max(0, writing.orderLeft - dt);
      if (writing.orderLeft === 0) {
        take(writing,true);
        pulse('line','Ticket written');
        changed = true;
      }
    }
    if(advanceMachines(dt))changed=true;
    if(workCrew(dt))changed=true;
    const queueCap=state.shift.greeted?3:2;
    if(!state.shift.complete&&orders().length<state.shift.quota-state.shift.served&&line().length<queueCap){
      state.arrival=Math.max(0,state.arrival-dt/timeWithCrew(1,'host'));
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
  const exists=id=>id==='line'?!!line().length:id==='pickup'?tickets().length>0:true;
  function action(at){
    if(!at||chooser||writingTicket())return '';
    const h=held();
    if(at==='line'){const head=line()[0];return atRegister(head)&&freeSeat()>=0&&!assigned('cashier',head.id,'take')?'Ask '+head.name:'';}
    if(at==='rack'){
      if(h)return 'Park cup';
      const g=atRack();return g?(g.cupAt==='shelf'?'Pick up '+g.name+'’s cup':'Get cup for '+g.name):'';
    }
    if(!h){const g=collectable(at);return g?'Collect '+g.name+'’s cup':'';}
    const c=h.cup;
    if(at==='pickup')return c.stage==='ready'?'Serve '+h.name:'';
    if(at==='tea')return freeBay()?(c.stage==='empty'?'Choose tea base':'Remake drink'):'';
    if(occupant(at))return '';
    if(at==='shake')return c.stage==='sealed'?'Shake drink':'';
    if(c.stage!=='filled')return '';
    if(at==='milk')return c.milk?'':'Dispense milk';
    if(at==='ice')return c.ice?'':'Add ice';
    return {top:'Choose topping',lid:'Press lid'}[at]||'';
  }
  function pulse(at,label){
    contact={at,label,age:0};room.pulse?.(at);
    if(label==='Wrong order')app.sound('meh');
    else if(label==='Ticket written')app.sound('chime');
    else if(at==='rack'||label==='Cup collected')app.sound('place');
    else if(at==='tea'||at==='milk')app.sound('shortPour');
    else if(at==='ice')app.sound('ice');
    else if(at==='top')app.sound('boba');
    else if(at==='lid')app.sound('sealed');
    else if(at==='shake')app.sound('shake',2);
  }
  function optionsFor(station,guest){
    if(station==='tea'){
      const bases=new Map();
      for(const d of app.drinks)if(app.state.unlocked.includes(d.id)||d.id===guest.drink)bases.set(d.base,{id:d.base,name:d.baseName});
      return [...bases.values()];
    }
    return app.tops.filter(id=>availableTops().includes(id)||id===guest.top).map(id=>({id,name:app.ingredients[id].name}));
  }
  function focusChoice(){
    by('.bw-recipe-card h2').focus({preventScroll:true});
  }
  function openChooser(o,station){
    const menu=optionsFor(station,o);if(!menu.length)return;
    chooser={id:o.id,station,page:0};
    room.clear();room.releaseLook();render();focusChoice();
  }
  function closeChooser(capture=true){
    if(!chooser)return;chooser=null;
    if(capture){render();if(active())playLook();}
  }
  function showChoices(){
    const panel=by('.bw-recipe-panel');panel.hidden=!chooser;
    if(!chooser)return;
    const g=order(chooser.id),tea=chooser.station==='tea';
    const menu=optionsFor(chooser.station,g),pages=Math.ceil(menu.length/9),start=chooser.page*9;
    by('.bw-recipe-card h2').textContent=tea?'Tea bases':'Toppings';
    const stamp=[g.id,chooser.station,start,menu.map(d=>d.id)].join('|');
    if(panel.dataset.menu!==stamp){
      panel.dataset.menu=stamp;
      by('.bw-recipe-options').innerHTML=menu.slice(start,start+9).map((d,i)=>'<button type="button" data-service="recipe" data-id="'+d.id+'"><kbd>'+(i+1)+'</kbd><span>'+d.name+'</span></button>').join('');
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
    if(!bay){say('Station busy.');closeChooser();return;}
    dock(h,bay,id==='none'?null:id);pulse(station,station==='tea'?'Cup loaded':'Scooping');
    app.save();closeChooser();
  }
  function interact(){
    if(!canMove()||state.job)return;
    const at=roomApi.nearest(state.pose,exists);if(!action(at))return;
    const h=held();
    if(at==='line'){
      const guest=line()[0];
      guest.orderDuration=timeWithCrew(orderTime,'cashier');
      guest.orderLeft=guest.orderDuration;
      room.pulse(at);
      noticeUntil = 0;
    }else if(at==='pickup'){
      if(mixed(h)){state.hand=null;give(h);pulse(at,'Drink served');}
      else{
        if(!h.cup.rejected){h.left=Math.max(0,h.left-4);h.cup.rejected=true;}
        say(h.name+' declined the drink.');pulse(at,'Wrong order');
      }
    }else if(at==='rack'){
      if(h){h.cupAt='shelf';h.cup.auto=false;state.hand=null;pulse(at,'Cup parked');}
      else{const g=atRack();g.cupAt='hand';g.cup.auto=false;state.hand={kind:'cup',id:g.id};state.selected=g.id;pulse(at,'Cup picked up');}
    }else if(!h){
      const g=collectable(at);
      if(!g)return;g.cupAt='hand';g.cup.auto=false;g.cup.actor=null;state.hand={kind:'cup',id:g.id};state.selected=g.id;pulse(at,'Cup collected');
    }else if(at==='tea'||at==='top'&&optionsFor('top',h).length>1){openChooser(h,at);return;}
    else{dock(h,at,at==='top'?h.top:null);pulse(at,{milk:'Pouring milk',ice:'Dropping ice',top:'Scooping',lid:'Pressing lid',shake:'Shaking drink'}[at]);}
    app.save();render();
  }
  function sprint(metres){
    const guest=held();
    if(!active()||state.job||state.hand?.kind!=='cup'||guest?.cup.stage!=='filled'||!Number.isFinite(metres)||metres<=0)return;
    // An open drink has about a 2% chance of spilling over a five-metre dash, regardless of frame rate.
    if(Math.random()>=-Math.expm1(-.004*metres))return;
    guest.cup=cup();say(guest.name+'’s drink spilled.');app.save();render();
  }
  function color(c){
    const base=drink(c.flavor)?.baseColor||'#c99566';
    if(!c.milk)return base;
    const cream=[255,239,215];
    return '#'+cream.map((v,i)=>Math.round(parseInt(base.slice(1+2*i,3+2*i),16)*.62+v*.38).toString(16).padStart(2,'0')).join('');
  }
  function objects(){
    const actor=o=>({id:o.id,name:o.name,coat:o.coat,mood:mood(o),walk:o.walk});
    function machine(id){
      const o=occupant(id),c=o?.cup;
      return {label:machineNames[id],running:running(o),ready:!!o&&!running(o),jobId:o?.id??null,owner:o?.name||'',flavor:c?.flavor??null,
        base:c?.base??null,baseColor:drink(c?.flavor)?.baseColor||'#c99566',color:c?color(c):'#c99566',stage:c?.stage??null,
        milk:!!c?.milk,ice:!!c?.ice,top:c?.top??null,pendingTop:c?.dose??null,left:c?.left||0,total:c?.duration||0,
        progress:o?(c.duration?1-c.left/c.duration:1):0,detail:o?o.name:''};
    }
    const branch=BobaCareer.branches.find(b=>b.id===state.career.current);
    const items={branch:{id:branch.id,name:branch.name,color:branch.color,signature:drink(branch.signature).name},rack:{label:'Cup shelf'},tea:{label:'Tea brewer',bays:bays.map(id=>occupant(id)?machine(id):null)},
      line:{label:'Register',guests:line().map(actor)},pickup:{label:'Pickup pass',guests:tickets().map(actor)},crew:[]};
    for(const id of ['milk','ice','top','lid','shake'])items[id]=machine(id);
    for(const [role,w] of Object.entries(state.staff))if(w.level&&w.onDuty){
      const t=w.task,anchor={take:'line',brew:'tea',milk:'milk',ice:'ice',top:'top',seal:'lid',shake:'shake',serveCup:'pickup'};
      const card=workerCard(role);
      if(!card)continue;
      items.crew.push({role,name:card.name,coat:card.coat,working:!!t,
        station:t?anchor[t.kind]:{cashier:'line',cleaner:'milk',barista:'tea',cook:'top',server:'pickup'}[role]});
    }
    return items;
  }
  function ticket(o){
    const d=drink(o.drink),liquid=d.baseName+' · '+(needsMilk(o)?'Milk':'No milk');
    const finish=(o.ice?'Ice':'No ice')+' · '+(o.top?app.ingredients[o.top].name:'No topping');
    return '<button type="button" class="bs-ticket" data-service="track" data-id="'+o.id+'" data-mood="'+mood(o)+'" aria-pressed="'+(state.selected===o.id)+'"><span><b>#'+String(o.id).padStart(2,'0')+' · '+o.name+'</b><i data-time="'+o.id+'"></i></span><strong>'+d.name+'</strong><small>'+liquid+'<br>'+finish+'</small><i class="bs-meter"><i data-patience="'+o.id+'"></i></i></button>';
  }
  function taskText(t){
    if(!t)return 'Waiting for work';
    const guest=order(t.id)?.name||'guest';
    return {take:'Taking '+guest+'’s order',brew:'Brewing for '+guest,milk:'Adding milk for '+guest,ice:'Adding ice for '+guest,top:'Adding topping for '+guest,
      seal:'Sealing '+guest+'’s cup',shake:'Shaking '+guest+'’s cup',serveCup:'Taking a drink to '+guest}[t.kind];
  }
  function crewPanel(){
    const list=by('.bw-crew-list'),focused=document.activeElement?.closest('.bw-crew-list [data-id]')?.dataset.id;
    const book=state.workers;
    by('.bw-crew-wallet').textContent=book.tickets+' hiring ticket'+(book.tickets===1?'':'s');
    by('[data-service="draw"]').disabled=book.tickets===0;
    const last=crew.cards.get(book.last);
    by('.bw-draw-result').textContent=drawMessage || (last?'Last draw: '+last.name+' · '+last.tier.name+' '+crew.jobs[last.job].title:'');
    const picture=by('.bw-draw-picture');
    if(picture.dataset.worker!==(book.last||'')){
      picture.dataset.worker=book.last||'';
      picture.innerHTML=last?app.portrait(last.coat):'';
    }
    picture.hidden=!last;
    const expanded=new Set([...list.querySelectorAll('details[open]')].map(row=>row.dataset.job));
    list.innerHTML=crew.tracks.map(job=>{
      const def=crew.jobs[job],active=crew.cards.get(book.equipped[job]);
      const owned=[...crew.cards.values()].filter(card=>card.job===job && book.owned[card.id]);
      const heading=active?active.name+' · Lv '+book.owned[active.id].level:'Unassigned';
      const percent=(active?crew.power(book,active.id)+'% ':'')+def.verb+' '+def.effect;
      const options=owned.map(card=>{
        const entry=book.owned[card.id],equipped=active===card;
        const elsewhere=BobaCareer.branches.find(b=>b.id!==state.career.current&&state.career.branches[b.id]?.crew[job]===card.id);
        const xp=entry.level===5?'Max level':entry.xp+'/'+entry.level+' XP';
        return '<article><div><b>'+card.name+' · '+card.tier.name+'</b><small>Lv '+entry.level+' · '+xp+' · '+crew.power(book,card.id)+'% '+def.verb+' '+def.effect+'</small></div>'+
          '<button type="button" data-service="assign" data-id="'+card.id+'" aria-label="'+(equipped?'Rest ':'Assign ')+card.name+'">'+(equipped?'Rest':elsewhere?'Transfer from '+elsewhere.city:'Assign')+'</button></article>';
      }).join('') || '<small>Draw a '+def.title.toLowerCase()+' to fill this job.</small>';
      return '<details class="bw-staff-job" data-job="'+job+'" '+(expanded.has(job)?'open':'')+'><summary><b>'+def.title+'</b><span>'+heading+'</span>'+
        '<small>'+percent+'</small></summary>'+options+'</details>';
    }).join('');
    if(focused)by('[data-service="assign"][data-id="'+focused+'"]')?.focus({preventScroll:true});
  }
  function toggleCrew(show){
    if(chooser)closeChooser(false);crewOpen=show;room.clear();last=performance.now();render();
    if(show){room.releaseLook();by('[data-service="crewclose"]').focus({preventScroll:true});}
    else if(active())playLook();
    else (briefing?(by('[data-service="begin"]')||by('.ch-tabs [data-home="crew"]')):state.shift.complete?by('[data-service="next"]'):by('.bs-paused [data-service="pause"]'))?.focus({preventScroll:true});
  }
  function syncSlot(job){
    const id=state.workers.equipped[job],worker=state.staff[crew.jobs[job].slot];
    worker.level=id?state.workers.owned[id].level:0;
    worker.onDuty=!!id;
  }
  function drawWorker(){
    if(!crewOpen)return;
    const result=crew.draw(state.workers);
    if(!result)return;
    const {card,record,previousLevel}=result;
    BobaCareer.reconcileCrew(state);syncSlot(card.job);
    app.sound(card.tier.name==='Legendary'?'rare':'gift');
    const gain=!previousLevel?'New worker':record.level>previousLevel?'Level up to '+record.level:record.level===5?'Max level':'Duplicate · +1 XP';
    drawMessage=card.name+' · '+card.tier.name+' '+crew.jobs[card.job].title+' · '+gain;
    app.save();render();
  }
  function assignWorker(id){
    const card=crew.cards.get(id);
    if(!crewOpen || !card || !state.workers.owned[id])return;
    const job=card.job,slot=crew.jobs[job].slot,worker=state.staff[slot];
    if(worker.task){
      const cup=order(worker.task.id)?.cup;
      if(cup?.actor===slot)cup.actor=null;
      worker.task=null;
    }
    state.workers.equipped[job]=state.workers.equipped[job]===id?null:id;
    BobaCareer.reconcileCrew(state,state.workers.equipped[job]);syncSlot(job);app.sound('click');app.save();render();
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
      const c=o.cup,isRunning=running(o),text=isRunning?roomApi.secondsLeft(c.left):'Ready';
      row.dataset.ready=String(!isRunning);
      const label=row.querySelector('small');if(label.textContent!==text)label.textContent=text;
      row.querySelector('meter').value=isRunning&&c.duration?1-c.left/c.duration:1;
    }
    const beat=by('.bw-action-pulse'),writing=writingTicket();beat.hidden=!contact&&!writing;
    if (writing) {
      const countdown='Writing ticket · '+roomApi.secondsLeft(writing.orderLeft);
      if (beat.textContent!==countdown) beat.textContent=countdown;
      beat.style.setProperty('--pulse',String(1-writing.orderLeft/(writing.orderDuration||orderTime)));
    } else if(contact){if(beat.textContent!==contact.label)beat.textContent=contact.label;beat.style.setProperty('--pulse',String(Math.min(1,contact.age/.45)));}
    const working=Object.entries(state.staff).find(([,w])=>w.task);
    const staff=working?workerCard(working[0]).name+' · '+taskText(working[1].task)+' · '+working[1].task.left.toFixed(1)+'s':'';
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
    by('.bw-crewboard').hidden=!crewOpen;by('.bw-receipt').hidden=!f.complete||crewOpen||briefing;
    dialog.dataset.home=String(briefing);
    home.element.hidden=!briefing||crewOpen;
    if(briefing&&!crewOpen)home.render(state);
    showChoices();drawMachineTimers();
    if(crewOpen)crewPanel();
    if(f.complete){
      room.releaseLook();by('.bw-receipt h2').textContent='Round '+f.number+' complete!';
      const income=state.career.lastIncome||0,bonus=f.levelBonus||0;
      const known=f.levelBonus!==undefined&&!f.partialReceipt;
      const lines=[f.served+' guests served','$'+f.earned+' from orders'];
      if(bonus)lines.push('+$'+bonus+(known?' level bonus':' in recorded level bonuses'));
      if(income)lines.push('+$'+income+' from other cafés');
      if(f.hiringTicket)lines.push('+1 hiring ticket');
      const total=by('.bw-receipt-total');
      total.textContent=known?'Round earnings +$'+(f.earned+bonus+income):'Wallet $'+Math.floor(app.state.money);
      by('.bw-receipt p').textContent=lines.join(' · ');
      const ratings=[[true,'Service goal met'],[f.missed===0,'No guests left early'],[f.timely===f.quota,'Every guest greeted and served promptly']];
      const stars=ratings.filter(([earned])=>earned).length,badge=by('.bw-round-stars');badge.textContent='★'.repeat(stars)+'☆'.repeat(3-stars);badge.setAttribute('aria-label',stars+' of 3 stars');
      by('.bw-round-ratings').innerHTML=ratings.map(([earned,label])=>'<li data-earned="'+earned+'" aria-label="'+(earned?'Earned: ':'Missed: ')+label+'">'+label+'</li>').join('');
    }
    const h=held(),hand=by('.bw-hand');
    hand.hidden=!h;
    if(h){
      const c=h.cup,sealed=c.stage==='sealed'||c.stage==='ready';
      hand.className='bw-hand bw-h-cup'+(sealed?' bw-sealed':'')+(c.top?' bw-topped':'');
      const contents=c.base?[drink(c.flavor).baseName,c.milk?'milk':'',c.ice?'ice':'',c.top?app.ingredients[c.top].name:'',c.stage==='ready'?'Shaken':sealed?'Sealed':''].filter(Boolean).join(' · '):'Empty cup';
      hand.style.setProperty('--brew',c.base?color(c):'#e3cbb943');hand.querySelector('b').textContent=h.name+' · '+contents;}
    room.paint(objects());if(!active())room.frame(0);readout='';markers();patienceDisplay();
  }
  function markers(){
    const at=roomApi.nearest(state.pose,exists),cmd=action(at);
    const status=performance.now()<noticeUntil?notice:'';
    const key=[at,cmd,status,!!writingTicket(),state.paused].join('|');
    if(readout!==key){
      readout=key;
      const button=by('.bw-use');
      button.textContent=cmd||(writingTicket()?'Listening…':'Interact');
      button.disabled=!cmd||state.paused;
      button.dataset.near=at||'';
      by('.bs-msg').textContent=status;
    }
    const p=state.pose,dot=by('.bw-player');
    dot.style.left=((p.x+4.65)/9.3*100)+'%';dot.style.top=((p.z+3.35)/6.7*100)+'%';dot.style.transform='translate(-50%,-50%) rotate('+p.yaw+'rad)';
  }
  function heartbeat(now){
    if(!dialog.open)return;
    const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
    if(active()){
      if(contact){contact.age+=dt;if(contact.age>=.45)contact=null;}
      walkGuests(dt);
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
    if(!briefing||crewOpen)return;
    app.audioStart();app.sound('chime');
    if(state.shift.complete){briefing=false;render();by('[data-service="next"]').focus();return;}
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
    state=app.state.cafeService=valid(state)?migrate(state):fresh();crewOpen=false;briefing=true;
    restoreGuestPositions();
    state.workers??=crew.create(state.staff);
    BobaCareer.ensure(state);BobaCareer.reconcileCrew(state);
    drawMessage='';
    const avatar=by('.bw-avatar'),original=document.querySelector('.hud .brand .avatar svg');
    if(original)avatar.replaceChildren(original.cloneNode(true));else avatar.innerHTML=app.portrait(app.state.me?.coat||app.coats[0].id);
    by('.bs-brand h1').textContent=(app.state.me?.name||'Chef')+'’s Café';
    dialog.showModal();home.show();room.clear();room.resize();room.frame(0);notice='';noticeUntil=0;render();app.save();
    (briefing?by('[data-service="begin"]'):by('[data-service="next"]')).focus({preventScroll:true});
    last=performance.now();saveDue=last+1000;cancelAnimationFrame(frameId);frameId=requestAnimationFrame(heartbeat);
  }
  function init(config){
    app=config;dialog=document.getElementById('bobaService');
    dialog.innerHTML='<header class="bs-head"><div class="bs-brand"><button class="bs-exit bw-home" data-service="close" type="button" aria-label="Main menu" title="Main menu"></button><i class="bw-avatar" aria-hidden="true"></i><h1>Chef’s Café</h1></div><div class="bw-shift-label"><b class="bw-shift-count"></b><small class="bw-line-count"></small></div><div class="bs-head-actions"><div class="bw-currency" title="Tips"><b class="bs-money"></b></div><div class="bw-levelchip" title="Café level"><span class="bs-level"></span><i class="bw-xp"><i></i></i></div><button class="bs-exit bw-crew-button" data-service="crew" type="button">Crew</button><button class="bs-pause" data-service="pause" type="button"></button></div></header>'+
    '<main class="bs-work"><div class="bw-view" tabindex="0" aria-label="First-person café. Move the mouse to look, WASD to walk, Shift to sprint, E to interact, and Q to switch tickets. Escape pauses and shows the cursor."></div><section class="bw-rail" aria-label="Order tickets, oldest first"><div class="bs-tickets"></div></section><aside class="bw-process" aria-label="Station status"><div class="bw-machine-timers"></div><small class="bw-on-floor"></small></aside><div class="bw-map" role="img" aria-label="Your position in the café"><i class="bw-player"></i></div><i class="bw-reticle" aria-hidden="true"></i>'+
    '<div class="bw-hand" hidden><div class="bw-held-art"><i></i><i></i></div><b></b></div><div class="bw-controls"><div class="bw-joystick" aria-label="Movement stick"><i></i></div><div class="bw-guide"><small class="bw-action-pulse" hidden></small><small class="bs-msg" role="status"></small></div><button class="bw-use" type="button" data-service="use"></button></div>'+
    '<div class="bw-legend"><span class="bw-turns"><button type="button" class="bw-sprint" aria-pressed="false">Sprint</button><button type="button" data-service="left" aria-label="Turn left">↶</button><button type="button" data-service="right" aria-label="Turn right">↷</button></span></div></main>'+
    '<aside class="bw-recipe-panel" hidden><section class="bw-recipe-card" role="dialog" aria-modal="true" aria-labelledby="bwRecipeHeading"><header><h2 id="bwRecipeHeading" tabindex="-1">Tea bases</h2><button type="button" class="bw-recipe-close" data-service="recipeclose" aria-label="Close recipe menu">Close</button></header><div class="bw-recipe-options"></div><nav class="bw-recipe-pages" aria-label="Recipe pages"><button type="button" data-service="prevtea">Previous</button><span></span><button type="button" data-service="nexttea">More teas</button></nav></section></aside>'+
    '<aside class="bs-paused" hidden><div><span>☾</span><h2>Round paused</h2><p>Your cats and machines will wait.</p><button type="button" data-service="pause">Resume round</button> <button type="button" data-service="close">Café home</button></div></aside>'+
    '<aside class="bw-receipt" hidden><section role="status"><small>Midnight Paws Café</small><h2></h2><div class="bw-round-stars" role="img"></div><strong class="bw-receipt-total"></strong><p></p><ul class="bw-round-ratings"></ul><button type="button" data-service="next">Next round</button></section></aside>'+
    '<aside class="bw-crewboard" hidden><section role="dialog" aria-label="Café crew"><header><div><h2>Café crew</h2><strong class="bw-crew-wallet"></strong></div><button type="button" data-service="crewclose">Back to café</button></header>'+
    '<div class="bw-hiring"><p>Start with one hiring ticket. Earn another each time you finish a round.</p><div class="bw-rarity-odds">'+
    crew.tiers.map(t=>'<span data-tier="'+t.name+'">'+t.name+' <b>'+t.chance+'%</b></span>').join('')+'</div>'+
    '<details class="bw-pool"><summary>Workers and draw odds</summary><p>Each tier has one worker per job. Duplicates earn 1 XP. Each level adds 3 percentage points to the bonus, up to level 5.</p>'+
    crew.tiers.map(t=>'<p><b>'+t.name+' · '+t.base+'% starting bonus · '+(t.chance/5)+'% each</b><br>'+t.names.map((n,i)=>n+' ('+crew.jobs[crew.tracks[i]].title+')').join(', ')+'</p>').join('')+'</details>'+
    '<button type="button" data-service="draw">Draw a worker · 1 ticket</button><div class="bw-draw-notice"><i class="bw-draw-picture" aria-hidden="true" hidden></i><strong class="bw-draw-result" role="status"></strong></div></div><div class="bw-crew-list"></div></section></aside><div class="bs-save-warning" role="alert"></div>';
    home=BobaHome.create(dialog,app,{state:()=>state,crew:()=>toggleCrew(true),updated(){
      for(const job of crew.tracks)syncSlot(job);
      if(!state.shift.started){state.pose=roomApi.spawn();state.arrival=arrivalTime;}
      app.save();render();
    }});
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
      if(id==='begin')begin();else if(id==='pause')pause();else if(id==='close'){
        briefing=true;crewOpen=false;room.releaseLook();room.clear();home.show();app.save();render();
      }
      else if(id==='crew'||id==='crewclose')toggleCrew(id==='crew');
      else if(id==='draw')drawWorker();
      else if(id==='assign')assignWorker(b.dataset.id);
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
