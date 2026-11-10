/* The café landing page and the player's branch, equipment and sound controls. */
window.BobaHome = (() => {
  'use strict';
  const stamps={taipei:'茶',kyoto:'抹',bangkok:'ชา',seoul:'차'};
  const upgradeNames={brewer:'Brewer',tips:'Tip jar'};
  const upgradeEffects={brewer:'Shorter brewing times',tips:'More tips per correct order'};
  const sounds={all:'All sound',music:'Café music',rain:'Rain ambience',sfx:'Kitchen sounds'};
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=value=>'$'+Math.floor(value||0).toLocaleString('en-US');
  function create(dialog,app,actions) {
    const home=document.createElement('aside');
    home.className='bw-briefing ch-home';
    home.setAttribute('aria-label','Midnight Paws café home');home.hidden=true;
    home.innerHTML='<div class="ch-shell"><header class="ch-head"><button class="ch-brand" type="button" data-home="show" data-id="home" aria-label="Midnight Paws Boba home"><span class="ch-logo"></span><span>Midnight Paws<small>BOBA CAFÉ</small></span></button><div class="ch-head-tools"><span class="ch-wallet" aria-label="Café money"><i aria-hidden="true">✦</i><b></b></span><button type="button" class="ch-settings" data-home="show" data-id="settings" aria-label="Settings" title="Settings">♫</button></div></header><nav class="ch-tabs" aria-label="Café management"></nav><main class="ch-body"></main><p class="ch-note" role="status"></p></div>';
    dialog.append(home);
    const body=home.querySelector('.ch-body'),nav=home.querySelector('.ch-tabs'),note=home.querySelector('.ch-note');
    const tabs={home:'Café',branches:'Branches',crew:'Crew',upgrades:'Upgrades'};
    nav.innerHTML=Object.entries(tabs).map(([id,name])=>'<button type="button" data-home="'+(id==='crew'?'crew':'show')+'" data-id="'+id+'">'+name+'</button>').join('');
    home.querySelector('.ch-logo').innerHTML=app.portrait('orange');
    let page='home';
    function current(s){return BobaCareer.branches.find(branch=>branch.id===s.career.current);}
    function people(s,branch){
      const team=s.career.branches[branch.id]?.crew||{};
      return Object.values(team).filter(Boolean).map(id=>BobaWorkers.cards.get(id)).filter(Boolean);
    }
    function portraits(cats){return cats.map(cat=>'<span title="'+cat.name+'">'+app.portrait(cat.coat)+'</span>').join('');}
    function branchCard(s,branch){
      const held=s.career.branches[branch.id],on=branch.id===s.career.current,team=people(s,branch);
      const signature=app.drinks.find(d=>d.id===branch.signature)?.name||'House tea';
      const locked=!held,midRound=s.shift.started&&!s.shift.complete;
      const button=on?'Current café':held?'Work here':'Open & work · '+money(branch.cost);
      const prior=BobaCareer.branches[BobaCareer.branches.indexOf(branch)-1];
      const busy=on || midRound || locked && (app.state.money<branch.cost || prior&&!s.career.branches[prior.id]);
      return '<article class="ch-location" style="--branch:'+branch.color+'"><div class="ch-store"><span class="ch-awning"></span><span class="ch-door"></span><i>'+stamps[branch.id]+'</i></div><div class="ch-place"><small>'+branch.country+'</small><h3>'+branch.name+'</h3><p>'+signature+'</p><span>'+(held?team.length+' on crew · '+money(held.income)+' earned':'New branch')+'</span></div><button class="ch-small" type="button" data-home="'+(held?'visit':'buy')+'" data-id="'+branch.id+'" '+(busy?'disabled':'')+'>'+button+'</button></article>';
    }
    function homePage(s,branch){
      const f=s.shift,team=people(s,branch),book=s.workers;
      const count=Object.keys(book.owned).length,first=team.length?team:[...BobaWorkers.cards.values()].slice(0,3);
      const lead=team.length?team.length+' working at this café':'Recruit your first cat';
      const target=BobaCareer.branches.find(b=>!s.career.branches[b.id]);
      const sig=app.drinks.find(d=>d.id===branch.signature)?.name||'House tea';
      const label=f.complete?'View round receipt':f.started?'Resume round':'Start round';
      return '<section class="ch-hero"><div class="ch-picture" aria-hidden="true"></div><div class="ch-hero-copy"><p class="ch-town"><i></i>'+branch.country+'</p><h1>'+branch.name+'</h1><p class="ch-signature">'+sig+'</p><div class="ch-serve"><button class="ch-primary" type="button" data-service="begin">'+label+' <span aria-hidden="true">→</span></button><small>Round '+f.number+'<br>'+f.served+' / '+f.quota+' guests</small></div></div></section>'+
      '<section class="ch-dashboard"><button type="button" data-home="crew" class="ch-tile ch-crew"><span class="ch-tile-title">Your crew <i>↗</i></span><span class="ch-portraits">'+portraits(first)+'</span><strong>'+lead+'</strong><small>'+count+' collected · '+book.tickets+' hiring ticket'+(book.tickets===1?'':'s')+'</small></button>'+
      '<button type="button" data-home="show" data-id="branches" class="ch-tile ch-branches"><span class="ch-tile-title">Branches <i>↗</i></span><strong>'+Object.keys(s.career.branches).length+' / '+BobaCareer.branches.length+' open</strong><small>'+ (target?'Next · '+target.name+' · '+money(target.cost):'All branches open')+'</small></button>'+
      '<button type="button" data-home="show" data-id="upgrades" class="ch-tile ch-upgrades"><span class="ch-tile-title">Equipment <i>↗</i></span><strong>Brewer · Lv '+(s.career.upgrades.brewer||0)+'</strong><small>Tip jar · Lv '+(s.career.upgrades.tips||0)+'</small></button></section>';
    }
    function upgrades(s){
      return '<h1>Equipment</h1><div class="ch-upgrade-list">'+BobaCareer.upgrades.map(u=>{
        const level=s.career.upgrades[u.id]||0,price=u.costs[level];
        return '<article class="ch-equipment"><span class="ch-level" aria-label="Level '+level+'">'+level+'</span><div><h3>'+escape(u.name||upgradeNames[u.id])+'</h3><p>'+upgradeEffects[u.id]+'</p></div><button type="button" class="ch-small" data-home="upgrade" data-id="'+u.id+'" '+(price===undefined||app.state.money<price||s.shift.started&&!s.shift.complete?'disabled':'')+'>'+(price===undefined?'Max level':money(price)+' · Upgrade')+'</button></article>';
      }).join('')+'</div>';
    }
    function settings(){
      return '<h1>Settings</h1><div class="ch-options">'+Object.entries(sounds).map(([id,name])=>'<button type="button" data-home="sound" data-id="'+id+'" role="switch" aria-checked="'+!!app.state.audio[id]+'"><strong>'+name+'</strong><span>'+ (app.state.audio[id]?'On':'Off')+'</span></button>').join('')+
      '<div class="ch-backup"><h3>Save backups</h3><button class="ch-small" data-home="export" type="button">Export save</button><button class="ch-small" data-home="import" type="button">Import save</button><small class="ch-import-result" role="status"></small></div></div>';
    }
    function render(s){
      const branch=current(s);
      home.style.setProperty('--branch',branch.color);
      home.querySelector('.ch-wallet b').textContent=money(app.state.money);
      for(const btn of nav.children)btn.setAttribute('aria-current',btn.dataset.id===page?'page':'false');
      const previous=document.activeElement,focus=body.contains(previous)?[previous.dataset.home,previous.dataset.id,previous.dataset.service]:null;
      if(page==='home')body.innerHTML=homePage(s,branch);
      else if(page==='branches')body.innerHTML='<h1>Branches</h1>'+(s.shift.started&&!s.shift.complete?'<p class="ch-caption">Round '+s.shift.number+' in progress at '+branch.name+'</p>':'')+'<div class="ch-atlas">'+BobaCareer.branches.map(b=>branchCard(s,b)).join('')+'</div>';
      else if(page==='upgrades')body.innerHTML=upgrades(s);
      else body.innerHTML=settings();
      if(focus){
        const fixed=[...body.querySelectorAll('button')].find(b=>b.dataset.home===focus[0]&&b.dataset.id===focus[1]&&b.dataset.service===focus[2]);
        if(fixed&&!fixed.disabled)fixed.focus({preventScroll:true});
      }
    }
    function show(id='home'){
      page=id;note.textContent='';render(actions.state());home.scrollTop=0;
    }
    home.addEventListener('click',event=>{
      const btn=event.target.closest('[data-home]');if(!btn||btn.disabled)return;
      const kind=btn.dataset.home,id=btn.dataset.id,s=actions.state();
      app.audioStart();
      if(kind==='show'){app.sound('click');show(id);}
      else if(kind==='crew'){app.sound('click');actions.crew();}
      else if(kind==='sound'){app.toggleSound(id);render(s);}
      else if(kind==='export'||kind==='import'){app.backup(kind);}
      else{
        const result=kind==='upgrade'?BobaCareer.buyUpgrade(s,app.state,id):kind==='buy'?BobaCareer.buyBranch(s,app.state,id):BobaCareer.chooseBranch(s,id);
        if(result.ok){if(kind==='buy')BobaCareer.chooseBranch(s,id);app.sound(kind==='visit'?'chime':'buy');actions.updated();}
        else app.sound('meh');
        note.textContent=result.message||'';
        render(s);
      }
    });
    return {element:home,render,show};
  }
  return {create};
})();
