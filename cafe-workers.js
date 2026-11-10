/* Workers are earned with round tickets. The same pool and bonuses are used in the Roblox café. */
window.BobaWorkers = (() => {
  'use strict';
  const jobs = {
    cashier:  {slot:'cashier',title:'Cashier', effect:'order time', verb:'shorter'},
    brewer:   {slot:'barista',title:'Brewer',  effect:'tea and milk time', verb:'shorter'},
    finisher: {slot:'cook',   title:'Finisher',effect:'ice, topping, lid and shaker time', verb:'shorter'},
    server:   {slot:'server', title:'Server',  effect:'tips', verb:'higher'},
    host:     {slot:'cleaner',title:'Host',    effect:'time between arrivals', verb:'shorter'}
  };
  const tiers = [
    {name:'Common',chance:55,base:10,names:['Miso','Nori','Bao','Yuzu','Peach'],coats:['orange','black','brown','white','calico']},
    {name:'Rare',chance:30,base:15,names:['Chai','Oolong','Taro','Mochi','Poppy'],coats:['tux','siamese','gray','white','orange']},
    {name:'Epic',chance:12,base:20,names:['Sora','Juniper','Maple','Luna','Clover'],coats:['sakura','mint','calico','galaxy','mint']},
    {name:'Legendary',chance:3,base:25,names:['Sol','Aurora','Lychee','Starling','Comet'],coats:['golden','galaxy','sakura','ghost','golden']}
  ];
  const tracks = Object.keys(jobs);
  const cards = new Map();
  for (const tier of tiers) {
    tier.names.forEach((name,index) => {
      const id = name.toLowerCase();
      cards.set(id,{id,name,job:tracks[index],tier,coat:tier.coats[index]});
    });
  }
  function create(staff) {
    const book = {tickets:1,owned:{},equipped:{},tipHundredths:0,last:null};
    for (const [index,job] of tracks.entries()) {
      const previous = staff[jobs[job].slot];
      const id = tiers[0].names[index].toLowerCase();
      book.equipped[job] = previous?.level && previous.onDuty ? id : null;
      if (previous?.level) book.owned[id] = {level:previous.level,xp:0};
    }
    return book;
  }
  function valid(book) {
    if (!book || !Number.isSafeInteger(book.tickets) || book.tickets<0 ||
        !Number.isInteger(book.tipHundredths) || book.tipHundredths<0 || book.tipHundredths>=100 ||
        !book.owned || !book.equipped || (book.last!==null && !cards.has(book.last))) return false;
    for (const [id,record] of Object.entries(book.owned)) {
      if (!cards.has(id) || !record || !Number.isInteger(record.level) || record.level<1 || record.level>5 ||
          !Number.isInteger(record.xp) || record.xp<0 || record.xp>=record.level || (record.level===5 && record.xp!==0)) return false;
    }
    return tracks.every(job=>{
      const id=book.equipped[job];
      return id===null || (cards.get(id)?.job===job && Object.hasOwn(book.owned,id));
    });
  }
  function power(book,id) {
    const card=cards.get(id),level=book?.owned[id]?.level;
    return card && level ? card.tier.base+3*(level-1) : 0;
  }
  function bonus(book,job) {
    return power(book,book?.equipped[job]);
  }
  function draw(book,random=Math.random) {
    if (book.tickets<=0) return null;
    let roll=random()*100;
    const tier=tiers.find(tier=>{
      if (roll<tier.chance) return true;
      roll-=tier.chance;
      return false;
    });
    const id=tier.names[Math.floor(random()*tracks.length)].toLowerCase();
    const card=cards.get(id);
    let record=book.owned[id];
    const previousLevel=record?.level || 0;
    book.tickets--;
    if (!record) {
      record=book.owned[id]={level:1,xp:0};
    } else if (record.level<5) {
      record.xp++;
      if (record.xp===record.level) { record.level++; record.xp=0; }
    }
    if (!previousLevel && !book.equipped[card.job]) book.equipped[card.job]=id;
    book.last=id;
    return {card,record,previousLevel};
  }
  // Preserve fractions of bonus coins across tips without changing the integer wallet.
  function bonusTip(book,paidTip) {
    if (!book) return 0;
    const total=book.tipHundredths+paidTip*bonus(book,'server');
    book.tipHundredths=total%100;
    return Math.floor(total/100);
  }
  return {jobs,tiers,tracks,cards,create,valid,power,bonus,draw,bonusTip};
})();
