/* Ticket-local cooking tasks. Only the station the player is tending advances. */
window.MarketCooking = (() => {
  const recipes={
    udon:{title:'Lift & drain',hint:'Hold the noodle basket, then release in the mint band.'},
    seoul:{title:'Stir the rice cakes',hint:'Trace a clockwise circle around the pan, or tap its four numbered points in order.'},
    saigon:{title:'Build the bánh mì',hint:'Layer the toasted baguette in order. The ticket decides the filling.'},
    bangkok:{title:'Toss the wok',hint:'Flick up, then catch the noodles as they fall. Land two tosses.'},
    chennai:{title:'Work the tawa',hint:'Swipe across the dosa or tap Flip when its edge turns gold. Brown the second side and lift it.'},
    malaya:{title:'Steam coconut rice',hint:'Measure two scoops of water, seal the lid, then vent in the mint band.'}
  };
  const fresh=()=>({step:0,elapsed:0,water:0});
  const valid=s=>s&&Number.isInteger(s.step)&&s.step>=0&&s.step<=8&&
    Number.isFinite(s.elapsed)&&s.elapsed>=0&&s.elapsed<=10&&Number.isInteger(s.water)&&s.water>=0&&s.water<=4;
  const control=(id,label)=>`<button type="button" data-cook="${id}">${label}</button>`;
  function mount(el,v,t,notify,save,complete){
    const id=v.id,s=t.craft||(t.craft=fresh()),config=recipes[id];
    let held=id==='udon'&&s.step===1,drag=null,lastAngle=null,travel=0,destroyed=false;
    const layers=['Spread',v.finishings[t.recipe],'Pickles','Herbs'];
    const actions=()=>{
      switch(id){
        case 'udon':return control('basket','Lift / release basket');
        case 'seoul':return [0,1,2,3].map(i=>control(String(i),['1 · Top','2 · Right','3 · Bottom','4 · Left'][i])).join('');
        case 'saigon':return [2,0,3,1].map(i=>control(String(i),layers[i])).join('');
        case 'bangkok':return control('wok',s.step%2?'Catch noodles':'Toss noodles');
        case 'chennai':return control('flip',s.step?'Lift from tawa':'Flip dosa');
        case 'malaya':return s.step===0?control('less','− Water')+control('more','+ Water')+control('seal','Seal lid'):control('vent','Vent steam');
      }
    };
    el.hidden=false;
    el.innerHTML=`<div class="mc-art"><canvas width="560" height="230" aria-label="${config.title} gesture surface"></canvas></div>
      <div class="mc-tools"><small>${v.pot}</small><h3>${config.title}</h3><p>${config.hint}</p><strong class="mc-state"></strong>
      <div class="mc-meter" aria-hidden="true"><i></i><b></b></div><div class="mc-controls">${actions()}</div></div>`;
    const surface=el.querySelector('canvas'),ctx=surface.getContext('2d'),meter=el.querySelector('.mc-meter');
    const within=(a,b)=>s.elapsed>=a&&s.elapsed<=b;
    const message=el.querySelector('.mc-state');
    const tell=txt=>{notify(txt);};
    function commit(){save();refresh();}
    function finish(){if(!destroyed){complete();}}
    function reset(txt){s.elapsed=0;s.step=0;held=false;tell(txt);commit();}
    function startLift(){if(!held){held=true;s.step=1;s.elapsed=0;commit();}}
    function release(){if(!held)return;held=false;if(within(.8,2.15))finish();else reset('Dip the basket and try the mint band again.');}
    function quadrant(n){
      if(n!==s.step){tell('Stir clockwise from the highlighted point.');return;}
      if(++s.step===4){finish();return;}commit();
    }
    function action(a){
      if(destroyed)return;
      switch(id){
        case 'udon':if(held)release();else startLift();return;
        case 'seoul':quadrant(Number(a));return;
        case 'saigon':
          if(Number(a)!==s.step){tell('Next layer: '+layers[s.step]+'.');return;}
          if(++s.step===4)finish();else commit();return;
        case 'bangkok':
          if(s.step%2===0){s.step++;s.elapsed=0;commit();return;}
          if(!within(.45,1.45)){tell('Catch as the noodles fall into the pan.');return;}
          s.step++;s.elapsed=0;if(s.step===4)finish();else commit();return;
        case 'chennai':
          if(!within(.95,2.70)){tell('Wait for a golden edge and the mint band.');return;}
          if(s.step===1){finish();return;}
          s.step=1;s.elapsed=0;tell('Flipped! Brown the second side.');commit();return;
        case 'malaya':
          if(s.step===0){
            if(a==='more')s.water=Math.min(4,s.water+1);
            else if(a==='less')s.water=Math.max(0,s.water-1);
            else if(s.water===2){s.step=1;s.elapsed=0;}
            else tell('Use two scoops of water before sealing.');
            commit();return;
          }
          if(within(1.1,2.8))finish();else tell('Vent when the pressure reaches the mint band.');
      }
    }
    function point(e){
      const r=surface.getBoundingClientRect();
      return {x:(e.clientX-r.left)*560/r.width,y:(e.clientY-r.top)*230/r.height};
    }
    function down(e){
      if(drag)return;
      const p=point(e);drag={...p,pointer:e.pointerId};surface.setPointerCapture(e.pointerId);
      if(id==='udon')startLift();
      if(id==='seoul'){lastAngle=Math.atan2(p.y-120,(p.x-280)*.55);travel=0;}
    }
    function move(e){
      if(drag?.pointer!==e.pointerId||id!=='seoul')return;
      const p=point(e),dx=(p.x-280)*.55,dy=p.y-120;
      if(Math.hypot(dx,dy)<24){lastAngle=null;return;}
      const angle=Math.atan2(dy,dx);
      if(lastAngle!==null){
        const delta=Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle));
        if(Math.abs(delta)<1.2)travel=Math.max(0,travel+delta);
        if(travel>=Math.PI/2-.08){travel=0;quadrant(s.step);}
      }
      lastAngle=angle;
    }
    function up(e){
      if(!drag||drag.pointer!==e.pointerId)return;
      const p=point(e),dx=p.x-drag.x,dy=p.y-drag.y;drag=null;
      if(id==='udon')release();
      if(id==='bangkok'&&(s.step%2===1||dy< -24))action('wok');
      if(id==='chennai'&&Math.abs(dx)>40)action('flip');
    }
    surface.onpointerdown=down;surface.onpointermove=move;surface.onpointerup=up;
    surface.onpointercancel=()=>{drag=null;if(id==='udon'){held=false;s.step=0;s.elapsed=0;commit();}};
    const controls=el.querySelector('.mc-controls');
    controls.onclick=e=>{const b=e.target.closest('[data-cook]');if(b)action(b.dataset.cook);};
    let previousStep=-1;
    function refresh(){
      if(destroyed)return;
      let status='',band=null;
      if(id==='udon'){status=held?'Draining · release in the mint band':'Basket in broth · lift to drain';band=[.8,2.15,3];}
      if(id==='seoul')status='Clockwise turns · '+s.step+' / 4';
      if(id==='saigon')status='Next layer · '+layers[s.step];
      if(id==='bangkok'){status='Landed '+Math.floor(s.step/2)+' / 2'+(s.step%2?' · catch on the way down':' · flick up');if(s.step%2)band=[.45,1.45,1.65];}
      if(id==='chennai'){status=(s.step?'Second side':'First side')+(within(.95,2.70)?' · golden edge':' · browning');band=[.95,2.70,3.4];}
      if(id==='malaya'){status=s.step?'Lid sealed · watch steam pressure':'Water · '+s.water+' / 2 scoops';if(s.step)band=[1.1,2.8,3.5];}
      message.textContent=status;meter.hidden=!band;
      if(band){meter.style.setProperty('--lo',100*band[0]/band[2]+'%');meter.style.setProperty('--hi',100*band[1]/band[2]+'%');meter.lastElementChild.style.left=Math.min(99,100*s.elapsed/band[2])+'%';}
      if(previousStep!==s.step){controls.innerHTML=actions();previousStep=s.step;
        if(id==='seoul')controls.querySelector('[data-cook="'+s.step+'"]')?.classList.add('mc-next');}
      draw();
    }
    function draw(){
      ctx.clearRect(0,0,560,230);
      const egg=(x,y,w,h,color)=>{ctx.beginPath();ctx.ellipse(x,y,w,h,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
      const line=(x,y,xx,yy,color,width)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();};
      egg(283,187,160,17,'#2b1c28');
      if(id==='saigon'){
        egg(280,150,166,43,'#a76532');egg(280,140,164,40,'#eab673');egg(280,136,146,31,'#f9d99d');
        for(let l=0;l<s.step;l++)for(let i=0;i<7;i++)egg(185+i*31,130-l*7+Math.sin(i)*6,23,8,['#f7e0ac','#c58859','#efbd81','#79a064'][l]);
        return;
      }
      const rim=id==='malaya'?'#c28c5d':'#808089';
      line(391,115,490,75,'#4c3430',19);egg(280,136,139,49,'#45404a');egg(280,120,146,54,rim);
      egg(280,119,137,46,id==='seoul'?'#ae4232':id==='udon'?'#976540':'#38343c');
      if(id==='chennai'){
        const y=119-(s.step===1&&s.elapsed<.55?38*Math.sin(s.elapsed/.55*Math.PI):0);
        egg(280,y,114,37,within(.95,2.7)?'#ca7537':'#e7b46d');egg(280,y-2,104,31,s.step?'#d59554':'#f5ce8e');
        for(let i=0;i<22;i++)egg(280+Math.cos(i*2.4)*Math.sqrt(i)*18,y+Math.sin(i*2.4)*Math.sqrt(i)*5.2,3,1.5,'#be894e');
      }else if(id==='seoul'){
        for(let i=0;i<16;i++){const a=i*2.4+s.step*.45;egg(280+Math.cos(a)*Math.sqrt(i)*26,119+Math.sin(a)*Math.sqrt(i)*8,17,7,'#f6ae77');}
        for(let j=0;j<4;j++){
          const a=j*Math.PI/2-Math.PI/2,x=280+152*Math.cos(a),y=120+61*Math.sin(a);
          egg(x,y,11,11,j===s.step?'#b6eacf':'#ecd7b4');ctx.fillStyle='#342735';
          ctx.font='bold 15px system-ui';ctx.textAlign='center';ctx.fillText(String(j+1),x,y+5);
        }
        const ang=-Math.PI/2+s.step*Math.PI/2;line(280+95*Math.cos(ang),120+32*Math.sin(ang),397,37,'#d5a570',9);
      }else if(id==='malaya'){
        if(s.step){egg(280,110,134,45,'#af7953');egg(280,101,131,38,'#d7a670');egg(280,64,13,7,'#825438');}
        else{egg(280,119,112,32,'#eadab8');if(s.water)egg(280,120,65+9*s.water,19+s.water*2,'#a9d2cb');}
      }else{
        const lift=id==='udon'&&held?44:id==='bangkok'&&s.step%2?65*Math.sin(Math.min(1,s.elapsed/1.5)*Math.PI):0;
        if(id==='udon'){line(323,117-lift,405,49-lift*.45,'#c6a072',6);egg(280,128-lift,85,24,'#b7aaa0');}
        for(let i=0;i<11;i++){
          ctx.beginPath();ctx.moveTo(206+i*3,118-lift+i%4*4);
          ctx.bezierCurveTo(247,78-lift+i*3,306,159-lift-i,350-i*2,110-lift+i);
          ctx.strokeStyle=i%2?'#e8b16b':'#ffda8f';ctx.lineWidth=id==='udon'?5:3;ctx.stroke();
        }
      }
    }
    refresh();
    return {
      tick(dt){
        if(id==='chennai'||id==='udon'&&held||id==='malaya'&&s.step===1||id==='bangkok'&&s.step%2){
          s.elapsed+=dt;
          if(id==='bangkok'&&s.elapsed>1.65){s.step--;s.elapsed=0;tell('The noodles landed. Flick up to try that toss again.');}
          if(id==='chennai'&&s.elapsed>3.4||id==='malaya'&&s.elapsed>3.5)s.elapsed=0;
          if(id==='udon')s.elapsed=Math.min(s.elapsed,3);
          refresh();
        }
      },
      destroy(){destroyed=true;controls.onclick=null;surface.onpointerdown=surface.onpointermove=surface.onpointerup=surface.onpointercancel=null;el.hidden=true;el.replaceChildren();}
    };
  }
  return {fresh,valid,mount};
})();
