/* The café clock advances only while the counter is open and visible. */
window.BobaService = (() => {
  'use strict';
  const pourTime = 3.5, lidTime = 0.9, ovenTime = 2.8, arrivalTime = 3;
  const desserts = {mochi:'Strawberry mochi', taiyaki:'Custard taiyaki', roll:'Matcha roll'};
  const stages = ['empty','pouring','filled','sealing','ready'];
  let app, dialog, state, stamp, nextSave, interval, newestId, message = '';
  const by = selector => dialog.querySelector(selector);
  const pick = array => array[Math.floor(Math.random() * array.length)];
  const menu = () => app.drinks.filter(d => app.state.unlocked.includes(d.id));
  const drink = id => app.drinks.find(d => d.id === id);
  const selected = () => state.orders.find(o => o.id === state.selected);
  const cup = () => ({stage:'empty',flavor:null,top:null,left:0});
  const newState = () => ({version:1,paused:false,serial:0,arrival:arrivalTime,selected:null,orders:[]});
  const seconds = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
  function valid(s) {
    if (!app || !s || s.version !== 1 || typeof s.paused !== 'boolean' || !Number.isSafeInteger(s.serial) ||
        s.serial < 0 || !seconds(s.arrival,arrivalTime) || !Array.isArray(s.orders) || s.orders.length > 3) return false;
    const ids = new Set();
    for (const o of s.orders) {
      if (!o || !Number.isSafeInteger(o.id) || o.id < 1 || o.id > s.serial || ids.has(o.id) ||
          !app.names.includes(o.name) || !app.coats.some(c => c.id === o.coat) || !drink(o.drink) ||
          (o.top !== null && !app.tops.includes(o.top)) || (o.dessert !== null && !Object.hasOwn(desserts,o.dessert)) ||
          !seconds(o.limit,120) || o.limit < 1 || !seconds(o.left,o.limit) ||
          !['none','waiting','baking','done'].includes(o.side) || !seconds(o.bake,ovenTime)) return false;
      const c = o.cup;
      if (!c || !stages.includes(c.stage) || (c.flavor !== null && !drink(c.flavor)) ||
          (c.top !== null && !app.tops.includes(c.top)) || !seconds(c.left,pourTime) ||
          (c.stage !== 'empty' && !c.flavor)) return false;
      ids.add(o.id);
    }
    return s.selected === null ? ids.size === 0 : ids.has(s.selected);
  }
  function arrive() {
    const available = menu(), tops = app.tops.filter(id => app.state.unlocked.includes(id));
    const used = new Set(state.orders.map(o => o.drink));
    const choices = available.filter(d => !used.has(d.id));
    const recipe = state.serial === 0 ? available[0] : pick(choices.length ? choices : available);
    const id = ++state.serial;
    const dessert = app.state.level >= 3 && (id % 2 === 0 || !state.orders.length)
      ? pick(Object.keys(desserts)) : null;
    const limit = (app.state.level === 1 ? 48 : 40) + (dessert ? 6 : 0);
    const cats = app.coats.filter(c => !c.rare || (app.state.level >= 3 && Math.random() < .15));
    const usedNames = new Set(state.orders.map(o => o.name));
    const o = {id, name:pick(app.names.filter(n => !usedNames.has(n))), coat:pick(cats).id, drink:recipe.id,
      top:tops.length && id % 3 !== 0 ? pick(tops) : null, dessert, limit, left:limit,
      side:dessert ? 'waiting' : 'none', bake:0, cup:cup()};
    state.orders.push(o);
    newestId=id;
    if (state.selected === null) state.selected = id;
    state.arrival = arrivalTime;
  }
  function remove(id) {
    state.orders = state.orders.filter(o => o.id !== id);
    if (state.selected === id) state.selected = state.orders[0]?.id ?? null;
    state.arrival = Math.min(state.arrival,state.orders.length ? 1.8 : 1.1);
  }
  function advance(dt) {
    let changed = false;
    for (const o of [...state.orders]) {
      o.left = Math.max(0,o.left-dt);
      if (o.left === 0) {
        remove(o.id);
        app.state.combo = 0;
        message = o.name + ' headed home.';
        changed = true;
        continue;
      }
      if (o.cup.stage === 'pouring' || o.cup.stage === 'sealing') {
        o.cup.left = Math.max(0,o.cup.left-dt);
        if (o.cup.left === 0) {
          o.cup.stage = o.cup.stage === 'pouring' ? 'filled' : 'ready';
          changed = true;
        }
      }
      if (o.side === 'baking') {
        o.bake = Math.max(0,o.bake-dt);
        if (o.bake === 0) { o.side = 'done'; changed = true; }
      }
    }
    if (state.orders.length < 3) {
      state.arrival = Math.max(0,state.arrival-dt);
      if (!state.arrival) { arrive(); changed = true; }
    }
    return changed;
  }
  function tick() {
    const now = performance.now(), dt = (now-stamp)/1000;
    stamp = now;
    if (!dialog.open || document.hidden || state.paused) return;
    if (advance(dt)) { render(); app.save(); }
    meters();
    if (now >= nextSave) { app.save(); nextSave = now+1000; }
  }
  function hint(o) {
    if (!o) return 'A guest is on the way.';
    const c = o.cup;
    if (c.stage === 'empty') return 'Tap the ' + drink(o.drink).name + ' dispenser.';
    if (c.stage === 'pouring') return 'Pouring automatically. You can start another ticket.';
    if (c.stage === 'filled' && c.top !== o.top) return 'Tap ' + app.ingredients[o.top].name + ' to add a scoop.';
    if (c.stage === 'filled') return 'Tap the lid press to seal this cup.';
    if (c.stage === 'sealing') return 'The lid press is sealing this cup.';
    if (o.dessert && o.side !== 'done') return o.side === 'baking' ? 'Dessert is cooking. Your drink is ready.' : 'Tap the dessert tray to prepare ' + desserts[o.dessert] + '.';
    return 'Hand the finished order to ' + o.name + '.';
  }
  function stageName(o) {
    return {empty:'Empty cup',pouring:'Pouring',filled:o.cup.top ? 'Boba added' : 'Filled cup',sealing:'Sealing',ready:'Sealed cup'}[o.cup.stage];
  }
  function color(id) {
    if (id === 'classic') return '#c88a60';
    if (id === 'jasminemt') return '#9cb773';
    if (id === 'bsmilk') return '#b37256';
    return app.ingredients[drink(id).ings[0]].c;
  }
  function attrs(action,id) {
    return ' type="button" data-service="'+ action +'"' + (id == null ? '' : ' data-id="'+ id +'"');
  }
  function art(o) {
    const c = o.cup, hasTea = !!c.flavor;
    return '<span aria-hidden="true" class="bs-cup-art '+ (c.top?'has-pearls ':'') + (c.stage==='ready'||c.stage==='sealing'?'has-lid':'')+
      '" style="--tea:'+ color(c.flavor || o.drink) +'"><i class="bs-straw"></i><i class="bs-lid"></i><i class="bs-glass"><i class="bs-liquid" data-liquid="'+o.id+
      '" style="height:'+(hasTea && c.stage!=='pouring'?88:0)+'%"></i><i class="bs-face">•ᴗ•</i><i class="bs-pearls"></i></i></span>';
  }
  function ticket(o) {
    return '<button'+attrs('ticket',o.id)+' class="bs-ticket" aria-pressed="'+(state.selected===o.id)+'"><span class="bs-ticket-head"><b>#'+
      String(o.id).padStart(2,'0')+' · '+o.name+'</b><span data-time="'+o.id+'"></span></span><strong>'+drink(o.drink).name+
      '</strong><span class="bs-extras">'+(o.top ? app.ingredients[o.top].name : 'No topping')+(o.dessert?' + '+desserts[o.dessert]:'')+
      '</span><i class="bs-meter"><i data-patience="'+o.id+'"></i></i></button>';
  }
  function counterCat(o) {
    return '<button'+attrs('ticket',o.id)+' class="bs-cat'+(o.id===newestId?' bs-arriving':'')+'" aria-label="Select '+o.name+'"><span class="bs-cat-art">'+
      app.portrait(o.coat)+'</span><b>'+o.name+'</b></button>';
  }
  function tray(o) {
    return '<button'+attrs('ticket',o.id)+' class="bs-tray" aria-pressed="'+(state.selected===o.id)+'">'+art(o)+
      '<span><b>#'+String(o.id).padStart(2,'0')+' · '+o.name+'</b><small>'+stageName(o)+'</small></span></button>';
  }
  function spout(d,o) {
    const busy = state.orders.find(order => order.cup.stage==='pouring' && order.cup.flavor===d.id);
    const disabled = !o || o.cup.stage !== 'empty' || !!busy;
    return '<button'+attrs('pour',d.id)+' class="bs-spout" style="--tea:'+color(d.id)+'" '+(o?.drink===d.id && !disabled?'data-requested ':'')+(disabled?'disabled':'')+
      '><i aria-hidden="true" class="bs-dispenser"><i></i></i><strong>'+d.name+'</strong><small>'+
      (busy?'Pouring <span data-machine="'+busy.id+'"></span>':disabled?'Select an empty cup':'Tap to pour · 3.5s')+'</small></button>';
  }
  function machine(action,id,title,detail,icon,enabled) {
    return '<button'+attrs(action,id)+' class="bs-tool" '+(enabled?'':'disabled')+'><i aria-hidden="true" class="bs-tool-icon bs-'+icon+
      '"></i><span><strong>'+title+'</strong><small>'+detail+'</small></span></button>';
  }
  function render() {
    const previous = document.activeElement?.closest('[data-service]');
    const lastAction = previous?.dataset.service, lastId = previous?.dataset.id;
    const o = selected();
    const wanted = new Set(state.orders.map(order => order.drink));
    const available=menu();
    for (const d of available) { if (wanted.size>=3) break; wanted.add(d.id); }
    const show=available.filter(d=>wanted.has(d.id));
    const top = o?.top || app.tops.find(id => app.state.unlocked.includes(id));
    const ready = o?.cup.stage === 'ready' && (!o.dessert || o.side==='done');
    by('.bs-tickets').innerHTML = state.orders.map(ticket).join('') || '<span class="bs-empty">Next guest arriving…</span>';
    by('.bs-cats').innerHTML = state.orders.map(counterCat).join('');
    newestId=null;
    by('.bs-trays').innerHTML = state.orders.map(tray).join('') || '<span class="bs-empty">Clean counter</span>';
    by('.bs-spouts').innerHTML = show.map(d=>spout(d,o)).join('');
    const press = state.orders.find(a=>a.cup.stage==='sealing');
    const oven = state.orders.find(a=>a.side==='baking');
    let tools = machine('top',top,top?app.ingredients[top].name:'Boba scoop',o?.cup.top ? 'Added to cup' : 'Tap to scoop','bowl',
      !!top && o?.cup.stage==='filled' && !!o.top && !o.cup.top);
    tools += machine('lid',null,'Lid press',press?'Sealing…':'Tap to seal','press',
      o?.cup.stage==='filled' && o.cup.top===o.top && !press);
    if (app.state.level >= 3) tools += machine('dessert',null,o?.dessert?desserts[o.dessert]:'Dessert tray',
      oven?'Cooking…':o?.side==='done'?'Ready on tray':'Tap to prepare','sweet',o?.side==='waiting' && !oven);
    by('.bs-tools').innerHTML = tools;
    by('.bs-hint').textContent = hint(o);
    by('.bs-hand').textContent = o?'Serve '+o.name:'Serve guest';
    by('.bs-hand').disabled = !ready;
    by('.bs-money').textContent = '$'+Math.floor(app.state.money);
    by('.bs-level').textContent = 'Level '+app.state.level;
    by('.bs-cups-title').textContent = o ? 'Cup #'+String(o.id).padStart(2,'0')+' · '+o.name : 'Cup counter';
    by('.bs-pause').textContent = state.paused ? '▶ Resume' : 'Ⅱ Pause';
    by('.bs-pause').setAttribute('aria-pressed',String(state.paused));
    by('.bs-work').inert = state.paused;
    by('.bs-paused').hidden = !state.paused;
    by('.bs-msg').textContent = message;
    meters();
    if (lastAction && (!previous || !dialog.contains(previous))) {
      const id = lastId==null?'':'[data-id="'+lastId+'"]';
      const target = by('[data-service="'+lastAction+'"]'+id+':not(:disabled)') || by('.bs-ticket[aria-pressed="true"]');
      target?.focus({preventScroll:true});
    }
  }
  function meters() {
    for (const o of state.orders) {
      const fill = by('[data-patience="'+o.id+'"]'), time = by('[data-time="'+o.id+'"]');
      if (fill) fill.style.setProperty('--left',String(o.left/o.limit));
      if (time) time.textContent = Math.ceil(o.left)+'s';
      const liquid=by('[data-liquid="'+o.id+'"]'), machine=by('[data-machine="'+o.id+'"]');
      if (o.cup.stage==='pouring' && liquid) liquid.style.height = (88*(1-o.cup.left/pourTime))+'%';
      if (machine) machine.textContent=Math.ceil(o.cup.left)+'s';
    }
    const warning=document.getElementById('saveWarning');
    by('.bs-save-warning').textContent = warning.hidden?'':warning.textContent;
  }
  function tap(action,id) {
    tick();
    if (action === 'close') { dialog.close(); return; }
    if (action === 'pause') {
      state.paused=!state.paused; stamp=performance.now(); app.save(); render(); return;
    }
    if (state.paused) return;
    if (action==='ticket') {
      if (state.orders.some(o=>o.id===Number(id))) state.selected=Number(id);
      message=''; app.save(); render(); return;
    }
    const o=selected();
    if (!o) return;
    const c=o.cup;
    if (action==='pour' && c.stage==='empty' && !state.orders.some(a=>a.cup.stage==='pouring' && a.cup.flavor===id)) {
      if (o.drink!==id) { message=o.name+' asked for '+drink(o.drink).name+'.'; render(); return; }
      Object.assign(c,{stage:'pouring',flavor:id,left:pourTime});
    } else if (action==='top' && c.stage==='filled' && id===o.top && !c.top) {
      c.top=id;
    } else if (action==='lid' && c.stage==='filled' && c.top===o.top && !state.orders.some(a=>a.cup.stage==='sealing')) {
      c.stage='sealing'; c.left=lidTime;
    } else if (action==='dessert' && o.side==='waiting' && !state.orders.some(a=>a.side==='baking')) {
      o.side='baking'; o.bake=ovenTime;
    } else if (action==='serve' && c.stage==='ready' && (!o.dessert || o.side==='done')) {
      remove(o.id);
      const reward=app.reward(o);
      message=o.name+' loved it! +$'+reward;
      app.save(); render(); return;
    } else return;
    message=''; app.save(); render();
  }
  function open() {
    if (dialog.open) return;
    app.enter();
    state=app.state.cafeService;
    if (!valid(state)) state=app.state.cafeService=newState();
    if (!state.orders.length && !state.paused) arrive();
    dialog.showModal(); stamp=performance.now(); nextSave=stamp+1000;
    message=''; render(); app.save();
    (state.paused ? by('.bs-pause') : by('.bs-ticket[aria-pressed="true"]') || by('.bs-pause')).focus({preventScroll:true});
    clearInterval(interval); interval=setInterval(tick,100);
  }
  function init(config) {
    app=config; dialog=document.getElementById('bobaService');
    dialog.innerHTML='<header class="bs-head"><div class="bs-brand"><span aria-hidden="true">☾</span><div><small>Midnight Paws</small><h1>Boba café</h1></div></div><div class="bs-head-actions"><div class="bs-stats"><b class="bs-money"></b><span class="bs-level"></span></div><button class="bs-pause" data-service="pause" type="button">Ⅱ Pause</button><button class="bs-exit" data-service="close" type="button" aria-label="Back to main menu">Menu</button></div></header>'+
    '<main class="bs-work"><div class="bs-scene"><section class="bs-board"><h2>Order rail</h2><div class="bs-tickets"></div></section><div class="bs-window"><i class="bs-moon" aria-hidden="true">☾</i><div class="bs-cats"></div></div></div>'+
    '<section class="bs-counter"><div class="bs-section-title"><h2>Prep counter</h2><span class="bs-cups-title"></span></div><div class="bs-trays"></div><div class="bs-kitchen"><section><h3>Tea dispensers</h3><div class="bs-spouts"></div></section><section><h3>Finishing station</h3><div class="bs-tools"></div></section></div>'+
    '<div class="bs-serve"><div><p class="bs-hint"></p><p class="bs-msg" role="status"></p></div><button class="bs-hand" type="button" data-service="serve"></button></div></section></main>'+
    '<aside class="bs-paused" hidden><div><span aria-hidden="true">☾</span><h2>Café paused</h2><p>Your cats and cups will wait.</p><button type="button" data-service="pause">Resume shift</button></div></aside><div class="bs-save-warning" role="alert"></div>';
    dialog.addEventListener('click',e=>{const b=e.target.closest('[data-service]');if(b && !b.disabled)tap(b.dataset.service,b.dataset.id);});
    dialog.addEventListener('cancel',e=>{e.preventDefault();tap('pause');});
    dialog.addEventListener('close',()=>{clearInterval(interval);app.save();app.exit();});
    document.addEventListener('visibilitychange',()=>{if(!dialog.open)return;stamp=performance.now();if(document.hidden)app.save();});
    window.addEventListener('pagehide',()=>{if(dialog.open){tick();app.save();}});
  }
  return {init,open,valid};
})();
