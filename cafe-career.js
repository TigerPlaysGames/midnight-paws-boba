/* Café ownership and staff assignments share the existing local player save. */
window.BobaCareer = (() => {
  'use strict';
  const branches = [
    { id:'taipei', name:'Taipei Boba House', city:'Taipei', country:'Taiwan', cost:0, signature:'bsmilk', color:'#d48961' },
    { id:'kyoto', name:'Kyoto Matcha House', city:'Kyoto', country:'Japan', cost:120, signature:'matchalatte', color:'#709673' },
    { id:'bangkok', name:'Bangkok Tea Terrace', city:'Bangkok', country:'Thailand', cost:350, signature:'thaitea', color:'#d98b39' },
    { id:'seoul', name:'Seoul Berry Café', city:'Seoul', country:'South Korea', cost:900, signature:'strawmilk', color:'#d5879c' }
  ];
  const upgrades = [
    { id:'brewer', name:'Brewers', costs:[35,95,230] },
    { id:'tips', name:'Tip jar', costs:[35,95,230] }
  ];
  const jobs = ['cashier','brewer','finisher','server','host'];
  const branchById = new Map(branches.map(row => [row.id,row]));
  const makeBranch = () => ({rounds:0,crew:{},income:0});
  const ok = message => ({ok:true,message});
  const fail = message => ({ok:false,message});
  function valid(s) {
    const c=s?.career;
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const count = n => Number.isSafeInteger(n) && n>=0;
    if ((s?.version===1 || s?.version===2) && c===undefined) return true;
    if (!record(c) || !['shifts','served','missed','cleaned'].every(key=>count(c[key]))) return false;
    if (!('branches' in c)) return !('current' in c || 'upgrades' in c || 'lastIncome' in c);
    if (s.workers!==undefined && !window.BobaWorkers.valid(s.workers)) return false;
    if (!record(c.branches) || !record(c.upgrades) || !count(c.lastIncome) ||
        !branchById.has(c.current) || !Object.hasOwn(c.branches,c.current) ||
        !Object.hasOwn(c.branches,'taipei') || Object.keys(c.branches).some(id=>!branchById.has(id))) return false;
    if (Object.keys(c.upgrades).length!==upgrades.length ||
        upgrades.some(u=>!count(c.upgrades[u.id]) || c.upgrades[u.id]>u.costs.length)) return false;
    const assigned=new Set();
    for (const [index,definition] of branches.entries()) {
      if (!Object.hasOwn(c.branches,definition.id)) continue;
      const b=c.branches[definition.id];
      if ((index>0 && !Object.hasOwn(c.branches,branches[index-1].id)) ||
          !record(b) || !record(b.crew) || !count(b.income) || !count(b.rounds)) return false;
      for (const [job,id] of Object.entries(b.crew)) {
        if (!jobs.includes(job) || window.BobaWorkers.cards.get(id)?.job!==job ||
            !Object.hasOwn(s.workers?.owned || {},id) || assigned.has(id)) return false;
        assigned.add(id);
      }
    }
    if (!jobs.every(job=>(c.branches[c.current].crew[job]||null)===(s.workers?.equipped[job]||null))) return false;
    return s.shift?.complete===true ? s.shift.branchesPaid===true : s.shift?.branchesPaid===undefined;
  }
  function ensure(s) {
    const c = s.career ??= {shifts:0,served:0,missed:0,cleaned:0};
    if (!c.branches) {
      const first = makeBranch();
      first.rounds = Math.max(0, s.shift.number - (s.shift.complete ? 0 : 1));
      c.branches = {taipei:first};
      c.current = 'taipei';
      c.upgrades = {brewer:0,tips:0};
      c.lastIncome = 0;
      if (s.workers) reconcileCrew(s);
      if (s.shift.complete) s.shift.branchesPaid = true;
    }
    return c;
  }
  const inRound = s => s.shift.started && !s.shift.complete;
  function reconcileCrew(s, explicitId) {
    const c = ensure(s), book = s.workers;
    if (!book) return;
    for (const [branchId, branch] of Object.entries(c.branches)) {
      if (branchId === c.current) continue;
      for (const job of jobs) {
        const id = branch.crew[job];
        if (id && id === book.equipped[job]) {
          if (id === explicitId) delete branch.crew[job];
          else book.equipped[job] = null;
        }
      }
    }
    c.branches[c.current].crew = Object.fromEntries(jobs.filter(job => book.equipped[job]).map(job => [job,book.equipped[job]]));
  }
  function chooseBranch(s, id) {
    const c = ensure(s);
    if (!branchById.has(id) || !Object.hasOwn(c.branches,id)) return fail('Open this café first.');
    if (c.current === id) return ok(branchById.get(id).name);
    if (inRound(s)) return fail('Finish the current round first.');
    reconcileCrew(s);
    c.current = id;
    const branch = c.branches[id];
    if (s.workers) for (const job of jobs) s.workers.equipped[job] = branch.crew[job] || null;
    const number = branch.rounds + 1;
    s.shift = {number,quota:Math.min(8,number+2),served:0,missed:0,earned:0,timely:0,complete:false,greeted:false,started:false};
    s.orders = []; s.selected = null; s.job = null; s.hand = null; s.paused = false;
    for (const worker of Object.values(s.staff || {})) worker.task = null;
    return ok(branchById.get(id).name);
  }
  function buyBranch(s, wallet, id) {
    const c=ensure(s), i=branches.findIndex(row => row.id===id);
    if (i<1 || Object.hasOwn(c.branches,id)) return fail('This café is already open or unavailable.');
    if (inRound(s)) return fail('Finish the current round first.');
    if (!Object.hasOwn(c.branches,branches[i-1].id)) return fail('Open '+branches[i-1].name+' first.');
    const branch=branches[i];
    if (wallet.money < branch.cost) return fail('This café costs $'+branch.cost+'.');
    wallet.money -= branch.cost;
    c.branches[id] = makeBranch();
    if (Array.isArray(wallet.unlocked) && !wallet.unlocked.includes(branch.signature)) wallet.unlocked.push(branch.signature);
    chooseBranch(s,id);
    return ok(branch.name+' opened.');
  }
  function buyUpgrade(s,wallet,id) {
    const c=ensure(s), upgrade=upgrades.find(row => row.id===id);
    if (!upgrade || inRound(s)) return fail('Upgrades are available between rounds.');
    const cost=upgrade.costs[c.upgrades[id]];
    if (cost===undefined) return fail('Fully upgraded.');
    if (wallet.money<cost) return fail('This upgrade costs $'+cost+'.');
    wallet.money-=cost; c.upgrades[id]++;
    return ok(upgrade.name+' · Level '+c.upgrades[id]);
  }
  function finishRound(s,wallet) {
    const c=ensure(s);
    if (!s.shift.complete || s.shift.branchesPaid) return 0;
    s.shift.branchesPaid=true;
    if (c.branches[c.current].rounds>=s.shift.number) return 0;
    reconcileCrew(s);
    c.branches[c.current].rounds=Math.max(c.branches[c.current].rounds,s.shift.number);
    let income=0;
    branches.forEach((definition,index) => {
      const branch=c.branches[definition.id];
      if (!branch || definition.id===c.current) return;
      let sales=0;
      for (const id of Object.values(branch.crew)) {
        const level=s.workers?.owned[id]?.level;
        if (level) sales+=(2+level)*(index+1);
      }
      branch.income+=sales; income+=sales;
    });
    wallet.money+=income;
    if (Number.isFinite(wallet.earned)) wallet.earned+=income;
    c.lastIncome=income;
    return income;
  }
  const timeFactor = (s,job) => job==='brewer' ? 1-ensure(s).upgrades.brewer*.06 : 1;
  const extraTip = s => ensure(s).upgrades.tips;
  const signature = s => branchById.get(ensure(s).current).signature;
  return {branches,upgrades,valid,ensure,reconcileCrew,chooseBranch,buyBranch,buyUpgrade,finishRound,timeFactor,extraTip,signature};
})();
