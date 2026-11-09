/* Midnight Market — restaurant data, shift simulation and dining-room controls. */
window.MidnightMarket = (() => {
  'use strict';
  const venues = [
    {id:'udon',country:'Japan',name:'Noren Noodle Bar',specialty:'Udon',price:0,color:'#919ee6',pot:'Noodle boiler',prep:'Portion noodles',heat:'Boil noodles',finish:'Ladle broth',icon:'🍜',menu:['Kitsune udon','Wakame udon','Tempura udon'],finishings:['Sweet tofu','Wakame','Tempura']},
    {id:'seoul',country:'South Korea',name:'Red Tent Kitchen',specialty:'Tteokbokki',price:65,color:'#f18a82',pot:'Sauce pan',prep:'Portion rice cakes',heat:'Simmer rice cakes',finish:'Coat in sauce',icon:'🍢',menu:['Classic tteokbokki','Cheese tteokbokki','Egg tteokbokki'],finishings:['Scallions','Melted cheese','Boiled egg']},
    {id:'saigon',country:'Vietnam',name:'Little Bánh Mì',specialty:'Bánh mì',price:110,color:'#8cd7b6',pot:'Toaster',prep:'Split baguette',heat:'Toast baguette',finish:'Fill baguette',icon:'🥖',menu:['Bánh mì trứng','Bánh mì đậu hũ','Bánh mì gà'],finishings:['Fried egg','Tofu & pickles','Chicken & herbs']},
    {id:'bangkok',country:'Thailand',name:'Lime & Wok',specialty:'Pad thai',price:165,color:'#f4b760',pot:'Wok',prep:'Soak rice noodles',heat:'Stir-fry noodles',finish:'Toss with lime',icon:'🍋‍🟩',menu:['Shrimp pad thai','Tofu pad thai','Chicken pad thai'],finishings:['Shrimp','Crispy tofu','Chicken']},
    {id:'chennai',country:'India',name:'Moonrise Tiffin',specialty:'Dosa',price:220,color:'#efad74',pot:'Tawa griddle',prep:'Ladle batter',heat:'Spread on the tawa',finish:'Fold the dosa',icon:'🫓',menu:['Plain dosa','Masala dosa','Podi dosa'],finishings:['Coconut chutney','Potato masala','Spiced podi']},
    {id:'malaya',country:'Malaysia',name:'Pandan Corner',specialty:'Nasi lemak',price:285,color:'#93c985',pot:'Rice steamer',prep:'Rinse rice',heat:'Steam coconut rice',finish:'Wrap in banana leaf',icon:'🍚',menu:['Nasi lemak telur','Nasi lemak ayam','Nasi lemak tempeh'],finishings:['Egg & sambal','Fried chicken','Tempeh & sambal']}
  ];
  const modes={cozy:'Cozy service',rush:'Dinner rush',catering:'Catering contract'};
  const descriptions={cozy:'One guest at a time. Take as long as you like.',rush:'Three guests, 65 seconds. Serve before each guest leaves to build a tip streak.',catering:'Fill six ordered meals for a $35 contract bonus. No countdown.'};
  const upgrades=[
    {key:'heat',name:'Better cookware',effect:'Cuts cooking time by 0.8 seconds per level.',base:26,max:3},
    {key:'space',name:'Second cooktop',effect:'Cook two tickets at the same time.',base:48,max:1},
    {key:'service',name:'Table service',effect:'Earn $3 more per meal per level.',base:36,max:3}
  ];
  const techniques=['Loosen noodles','Stir the sauce','Turn the baguette','Toss the noodles','Flip the dosa','Fluff the rice'];
  const cats=['Mochi','Sesame','Tofu','Peaches','Miso','Pudding','Clover','Bean'];
  const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
  const integer=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max;
  const bounded=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max;
  const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const lookup=id=>venues.find(v=>v.id===id);
  const validTicket=t=>obj(t)&&integer(t.id,1e9)&&integer(t.recipe,2)&&integer(t.cat,7)&&
    ['new','prepped','cooking','ready','plated'].includes(t.stage)&&bounded(t.cook,10)&&bounded(t.patience,45)&&typeof t.technique==='boolean';
  const validRun=r=>obj(r)&&own(modes,r.mode)&&integer(r.serial,1e9)&&integer(r.selected,1e9)&&
    [r.served,r.tips,r.streak,r.missed].every(n=>integer(n,1e9))&&bounded(r.time,65)&&
    Array.isArray(r.tickets)&&r.tickets.length>=1&&r.tickets.length<=3&&r.tickets.every(validTicket)&&
    r.tickets.some(t=>t.id===r.selected)&&new Set(r.tickets.map(t=>t.id)).size===r.tickets.length;
  function valid(data){
    return obj(data)&&data.version===1&&['fixed','first'].includes(data.view)&&
      obj(data.restaurants)&&own(data.restaurants,'udon')&&Object.entries(data.restaurants).every(([id,r])=>
        lookup(id)&&obj(r)&&integer(r.sold,1e9)&&integer(r.best,1e9)&&integer(r.contracts,1e9)&&integer(r.stamps,7)&&
        upgrades.every(u=>integer(r[u.key],u.max))&&(r.run===null||validRun(r.run)));
  }
  function restaurant(){return {sold:0,best:0,contracts:0,heat:0,space:0,service:0,stamps:0,run:null};}
  function init(api){
    const dlg=document.querySelector('#marketDialog'),body=dlg.querySelector('.mk-body'),wallet=dlg.querySelector('.mk-wallet');
    let chooseFinish=false,webglFailed=false;
    let page='list',venue=venues[0],mode='cozy',last=0,clock=0,timer=0,scene=null,summary=null;
    const data=()=>api.state.market;
    const shop=()=>data().restaurants[venue.id];
    const run=()=>shop().run;
    const ticket=()=>run().tickets.find(t=>t.id===run().selected);
    const sound=id=>api.sound(id,1);
    const notice=msg=>{dlg.querySelector('.mk-message').textContent=msg;};
    const cash=()=>{wallet.textContent='$'+api.state.money;};
    const save=()=>{api.save();cash();if(!document.querySelector('#saveWarning').hidden)notice(document.querySelector('#saveWarning').textContent);};
    const art=v=>"--photo:url('assets/market/"+v.id+".webp');--accent:"+v.color;
    const button=(action,text,extra='')=>`<button type="button" data-mk="${action}" ${extra}>${text}</button>`;
    function stop(){
      clearInterval(timer);timer=0;
      if(scene){scene.dispose();scene=null;}
    }
    function route(next){
      if(page==='kitchen'&&run())save();
      stop();chooseFinish=false;page=next;notice('');cash();body.scrollTop=0;
      dlg.querySelector('.mk-back').textContent=page==='list'?'Back to café':page==='kitchen'?'Pause shift':page==='summary'?'Back to restaurant':'Restaurants';
      if(page==='list')directory();
      if(page==='venue')dashboard();
      if(page==='kitchen')kitchen();
      if(page==='summary')receipt();
    }
    function directory(){
      const shops=data().restaurants,served=Object.values(shops).reduce((a,r)=>a+r.sold,0);
      body.innerHTML=`<div class="mk-heading"><div><p>Restaurant district</p><h1>Midnight Market</h1></div><span>${Object.keys(shops).length} / 6 open · ${served} meals served</span></div>
        <div class="mk-grid">${venues.map(v=>`<button class="mk-card" data-mk="venue" data-id="${v.id}" style="${art(v)}">
          <span class="mk-photo"></span><span class="mk-card-info"><small>${v.country} · ${v.specialty}</small><strong>${v.name}</strong>
          <span>${shops[v.id]?(shops[v.id].run?'Resume shift →':'Enter restaurant →'):'Open for $'+v.price}</span></span></button>`).join('')}</div>`;
    }
    function dashboard(){
      const r=shop();
      const dishes=venue.menu.map((n,i)=>`<li><b>${r&&(r.stamps&(1<<i))?'✓ ':''}${n}</b><small>${venue.finishings[i]}</small></li>`).join('');
      body.innerHTML=`<div class="mk-detail" style="${art(venue)}"><div class="mk-hero mk-photo"><div><small>${venue.country} · ${venue.specialty}</small><h1>${venue.name}</h1></div></div>
        <div class="mk-detail-grid"><section><h2>On the menu</h2><ul class="mk-menu">${dishes}</ul>
        ${r?`<p class="mk-stats">${r.sold} meals served · Rush best ${r.best} · ${r.contracts} contracts</p><p>${r.stamps===7?'Menu mastered · $20 bonus earned':'Serve all three dishes for a $20 menu bonus.'}</p>`:''}</section>
        <section>${!r?`<h2>Open this kitchen</h2><p>Opening includes the ${venue.pot.toLowerCase()} and all three recipes.</p>${button('buy','Open for $'+venue.price,api.state.money<venue.price?'disabled':'')}${api.state.money<venue.price?`<p>Earn $${venue.price-api.state.money} more at an open restaurant.</p>`:''}`:
        r.run?`<h2>${modes[r.run.mode]}</h2><p>Shift paused · ${r.run.served} served · $${r.run.tips} earned</p>${button('resume','Resume shift')}`:
        `<h2>Choose a shift</h2><div class="mk-modes">${Object.entries(modes).map(([id,name])=>button('mode',name,`data-id="${id}" aria-pressed="${mode===id}"`)).join('')}</div><p>${descriptions[mode]}</p>${button('start','Start '+modes[mode].toLowerCase(),'class="mk-primary"')}`}</section></div>
        ${r?`<h2>Kitchen upgrades</h2><div class="mk-upgrades">${upgrades.map(u=>{const level=r[u.key],cost=u.base*(level+1);
          return `<article><small>Level ${level} / ${u.max}</small><h3>${u.name}</h3><p>${u.effect}</p>${button('upgrade',level===u.max?'Fully upgraded':'Upgrade · $'+cost,`data-id="${u.key}" ${level===u.max||api.state.money<cost?'disabled':''}`)}</article>`;}).join('')}</div>`:''}</div>`;
    }
    function newTicket(r){
      return {id:++r.serial,recipe:Math.floor(Math.random()*3),cat:Math.floor(Math.random()*cats.length),stage:'new',cook:0,patience:42,technique:false};
    }
    function start(){
      const r={mode,serial:0,selected:1,served:0,tips:0,streak:0,missed:0,time:65,tickets:[]};
      for(let i=0;i<(mode==='rush'?3:mode==='catering'?2:1);i++)r.tickets.push(newTicket(r));
      shop().run=r;save();route('kitchen');
    }
    function nextStep(t){return {new:0,prepped:1,cooking:1,ready:1,plated:2}[t.stage];}
    function caption(t,st){
      if(st===0)return t.stage==='new'?venue.prep:'Ingredients ready';
      if(st===1)return t.stage==='prepped'?venue.heat:t.stage==='ready'?venue.finish:t.stage==='cooking'?(t.technique?'Cooking…':techniques[venues.indexOf(venue)]):venue.pot;
      return t.stage==='plated'?'Serve '+cats[t.cat]:'Serving pass';
    }
    function kitchen(){
      const st=data().view;
      body.innerHTML=`<div class="mk-kitchen" style="${art(venue)}"><div class="mk-khead"><div><small>${venue.country} · ${modes[run().mode]}</small><h2>${venue.name}</h2></div>
        <div>${button('view',st==='first'?'Switch to fixed counter':'Switch to first person')}${button('finish','End shift')}</div></div>
        <aside class="mk-orders"><h3>Order rail</h3><div class="mk-tickets" aria-label="Customer tickets"></div></aside><div class="mk-stage"><div class="mk-scenery mk-photo"></div><canvas aria-label="Interactive kitchen. Use the station buttons below or click the equipment."></canvas><div class="mk-hotspots"></div><div class="mk-camera"></div></div>
        <div class="mk-actions" aria-label="Kitchen stations"></div><div class="mk-garnishes"></div><div class="mk-bottom"><span class="mk-instruction"></span><strong class="mk-score"></strong></div></div>`;
      const canvas=body.querySelector('canvas');
      if(st==='first'&&!webglFailed){
        scene=window.makeMarketScene?.(canvas,venue,venues.indexOf(venue),st,act);
        if(!scene){webglFailed=true;data().view='fixed';save();}
      }
      canvas.hidden=!scene;
      if(!scene){
        body.querySelector('.mk-stage').classList.add('mk-painted');
        body.querySelector('.mk-hotspots').innerHTML=['Prep board',venue.pot,'Serving pass'].map((name,i)=>
          button('station',name,`data-id="${i}" class="mk-pin"`)).join('');
      }
      if(webglFailed){const toggle=body.querySelector('[data-mk="view"]');toggle.disabled=true;toggle.textContent='Fixed counter';}
      body.querySelector('.mk-camera').textContent=scene?'Drag to look · A / D to move along the counter':'';
      drawOrders();last=performance.now();clock=0;timer=setInterval(tick,120);
    }
    function drawOrders(){
      const r=run(),t=ticket();
      body.querySelector('.mk-tickets').innerHTML=r.tickets.map(o=>button('ticket',
        `<span class="mk-guest">${api.portrait(o.cat)}</span><small>${cats[o.cat]} · Ticket ${o.id}</small><strong>${venue.menu[o.recipe]}</strong><span>${venue.finishings[o.recipe]}</span>${r.mode==='rush'?`<progress data-pat="${o.id}" max="42" value="${o.patience}" aria-label="Guest patience"></progress>`:''}`,
        `data-id="${o.id}" aria-pressed="${t.id===o.id}"`)).join('');
      body.querySelector('.mk-actions').innerHTML=['Prep board',venue.pot,'Serving pass'].map((name,i)=>button('station',
        `<small>${name}</small><strong>${caption(t,i)}</strong>${i===1&&t.stage==='cooking'?'<progress class="mk-cooking" aria-label="Cooking progress"></progress>':''}`,
        `data-id="${i}" ${nextStep(t)===i&&t.stage!=='cooking'?'class="mk-next"':''}`)).join('');
      const step={new:'Prep ingredients for '+venue.menu[t.recipe]+'.',prepped:'Move the ingredients to the '+venue.pot.toLowerCase()+'.',cooking:t.technique?'Technique tip secured. Finish when ready.':'Tap the cooktop halfway for a $2 technique tip, or prep another ticket.',ready:venue.finish+' with '+venue.finishings[t.recipe].toLowerCase()+'.',plated:'Hand the finished meal to '+cats[t.cat]+'.'};
      body.querySelector('.mk-instruction').textContent=step[t.stage];
      body.querySelectorAll('.mk-pin').forEach((pin,i)=>pin.classList.toggle('mk-active',i===nextStep(t)));
      body.querySelector('.mk-garnishes').innerHTML=chooseFinish&&t.stage==='ready'?
        `<strong>Finish ${cats[t.cat]}'s dish</strong>${venue.finishings.map((name,i)=>button('garnish',name,`data-id="${i}"`)).join('')}`:'';
      scene?.update(t,r.tickets);meters();
    }
    function meters(){
      const r=run();for(const el of body.querySelectorAll('[data-pat]'))el.value=r.tickets.find(o=>o.id===+el.dataset.pat).patience;
      const meter=body.querySelector('.mk-cooking');if(meter){meter.max=duration();meter.value=meter.max-ticket().cook;}
      body.querySelector('.mk-score').textContent=(r.mode==='rush'?Math.ceil(r.time)+'s · ':r.mode==='catering'?r.served+'/6 · ':'')+'$'+r.tips+' earned';
    }
    function duration(){return 4.8-shop().heat*.8;}
    function tick(){
      const now=performance.now(),dt=Math.min(1,(now-last)/1000);last=now;
      if(document.hidden||!dlg.open||page!=='kitchen')return;
      const r=run();let dirty=false;
      if(r.mode==='rush'&&(r.time=Math.max(0,r.time-dt))===0){end();return;}
      for(let i=0;i<r.tickets.length;i++){
        const t=r.tickets[i];
        if(t.stage==='cooking'&&(t.cook=Math.max(0,t.cook-dt))===0){t.stage='ready';dirty=true;sound('full');}
        if(r.mode==='rush'&&(t.patience=Math.max(0,t.patience-dt))===0){
          const next=newTicket(r);if(r.selected===t.id)r.selected=next.id;
          r.tickets[i]=next;r.missed++;r.streak=0;dirty=true;notice(cats[t.cat]+' left. A new guest is waiting.');
        }
      }
      if(dirty)drawOrders();else meters();
      clock+=dt;if(dirty||clock>=1){save();clock=0;}
    }
    function act(st){
      if(page!=='kitchen')return;
      const r=run(),t=ticket();scene?.focus(st);
      if(st===1&&t.stage==='cooking'&&!t.technique){
        if(t.cook>duration()*.64){notice('Give it a moment. Tap the cooktop when the timer is halfway for a $2 technique tip.');return;}
        t.technique=true;t.cook=Math.max(.05,t.cook-.6);sound('full');notice('Good timing. +$2 when served.');save();drawOrders();return;
      }
      if(st!==nextStep(t)||t.stage==='cooking'){notice(t.stage==='cooking'?'Let this dish finish cooking.':'Next: '+caption(t,nextStep(t)));return;}
      if(t.stage==='new'){t.stage='prepped';sound('place');}
      else if(t.stage==='prepped'){
        if(r.tickets.filter(o=>['cooking','ready'].includes(o.stage)).length>=1+shop().space){notice('Cooktop full. Finish the other ticket first.');return;}
        t.stage='cooking';t.cook=duration();sound('place');
      }else if(t.stage==='ready'){chooseFinish=true;notice('Choose the finishing ingredient on the ticket.');drawOrders();return;}
      else{
        r.streak++;r.served++;shop().sold++;
        const pay=10+(t.technique?2:0)+venues.indexOf(venue)*2+t.recipe+shop().service*3+(r.mode==='rush'?Math.min(r.streak,5)*2:0);
        const old=shop().stamps;shop().stamps|=(1<<t.recipe);
        const bonus=shop().stamps===7&&old!==7?20:0;
        api.state.money+=pay+bonus;r.tips+=pay+bonus;sound('coin');
        notice(cats[t.cat]+' paid $'+pay+' for '+venue.menu[t.recipe]+'.'+(bonus?' Menu mastered! +$20.':''));
        if(r.mode==='catering'&&r.served===6){shop().contracts++;api.state.money+=35;r.tips+=35;end(true);return;}
        const i=r.tickets.indexOf(t);
        if(r.mode==='catering'&&r.served+r.tickets.length>6)r.tickets.splice(i,1);
        else r.tickets[i]=newTicket(r);
        r.selected=(r.tickets.find(o=>o.stage!=='new')||r.tickets[0]).id;
        save();drawOrders();return;
      }
      notice('');save();drawOrders();
    }
    function end(bonus=false){
      const r=run();if(r.mode==='rush')shop().best=Math.max(shop().best,r.served);
      summary={mode:r.mode,served:r.served,tips:r.tips,missed:r.missed,bonus};
      shop().run=null;save();route('summary');sound('goal');
    }
    function receipt(){
      body.innerHTML=`<section class="mk-receipt"><small>${venue.name} · ${modes[summary.mode]}</small><h1>Shift receipt</h1>
        <dl><dt>Meals served</dt><dd>${summary.served}</dd>${summary.mode==='rush'?`<dt>Guests who left</dt><dd>${summary.missed}</dd>`:''}${summary.bonus?'<dt>Contract bonus included</dt><dd>$35</dd>':''}<dt>Total earned</dt><dd>$${summary.tips}</dd></dl>
        ${button('dashboard','Back to restaurant','class="mk-primary"')}</section>`;
    }
    function leave(){
      if(page==='list'){stop();dlg.close();api.exit();return;}
      route(page==='kitchen'||page==='summary'?'venue':'list');
    }
    dlg.addEventListener('cancel',e=>{e.preventDefault();leave();});
    dlg.querySelector('.mk-back').onclick=leave;
    dlg.addEventListener('click',e=>{
      const el=e.target.closest('[data-mk]');if(!el||el.disabled)return;
      const id=el.dataset.id;
      switch(el.dataset.mk){
        case 'venue':venue=lookup(id);mode='cozy';route('venue');break;
        case 'buy':if(!shop()&&api.state.money>=venue.price){api.state.money-=venue.price;data().restaurants[venue.id]=restaurant();sound('buy');save();dashboard();}break;
        case 'upgrade':{const u=upgrades.find(x=>x.key===id),r=shop(),cost=u.base*(r[id]+1);
          if(r[id]<u.max&&api.state.money>=cost){api.state.money-=cost;r[id]++;save();sound('buy');dashboard();}break;}
        case 'mode':mode=id;dashboard();break;
        case 'start':if(!run())start();break;
        case 'resume':route('kitchen');break;
        case 'view':data().view=data().view==='first'?'fixed':'first';save();route('kitchen');break;
        case 'ticket':chooseFinish=false;run().selected=+id;save();drawOrders();break;
        case 'station':act(+id);break;
        case 'garnish':{
          const t=ticket();if(!chooseFinish||t.stage!=='ready')break;
          if(+id!==t.recipe){notice(cats[t.cat]+' asked for '+venue.finishings[t.recipe]+'.');if(run().mode==='rush'){t.patience=Math.max(0,t.patience-3);save();}break;}
          t.stage='plated';chooseFinish=false;sound('sealed');notice('Ready for the serving pass.');save();drawOrders();break;
        }
        case 'finish':if(run().mode!=='cozy'&&!confirm('End this shift now? Your earnings so far are saved.'))return;end();break;
        case 'dashboard':route('venue');break;
      }
    });
    document.addEventListener('visibilitychange',()=>{last=performance.now();if(dlg.open&&document.hidden)save();});
    document.querySelector('#marketBtn').onclick=()=>{
      if(!data())api.state.market={version:1,view:'fixed',restaurants:{udon:restaurant()}};
      api.enter();dlg.showModal();route('list');save();
    };
  }
  return {init,valid};
})();
