/* A perspective room in world coordinates, measured in metres. The same geometry drives
   movement, station reach and the floor map. CSS 3D works on devices without WebGL. */
window.BobaRoom = (() => {
  'use strict';
  const unit=120, eye=1.48, reach=1.62;
  const stations=[
    {id:'cat0',x:0,z:-2.75,angle:0},{id:'cat1',x:-2.45,z:-2.75,angle:0},{id:'cat2',x:2.45,z:-2.75,angle:0},
    {id:'rack',x:-3.95,z:-.9,angle:90},{id:'dessert',x:-3.95,z:1.3,angle:90},
    {id:'tea0',x:-2.4,z:2.65,angle:180},{id:'tea1',x:0,z:2.65,angle:180},{id:'tea2',x:2.4,z:2.65,angle:180},
    {id:'top',x:3.95,z:1.2,angle:-90},{id:'lid',x:3.95,z:-1.05,angle:-90}
  ];
  const spot=id=>stations.find(s=>s.id===id);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const wrap=r=>Math.atan2(Math.sin(r),Math.cos(r));
  const spawn=()=>({x:0,z:.05,yaw:0,pitch:-.04});
  const bounded=p=>p && Number.isFinite(p.x)&&Math.abs(p.x)<=3.38 && Number.isFinite(p.z)&&Math.abs(p.z)<=2.04 &&
    Number.isFinite(p.yaw)&&Math.abs(p.yaw)<=Math.PI+.0001 && Number.isFinite(p.pitch)&&Math.abs(p.pitch)<=.4201;
  function direction(p,id) {
    const s=spot(id);if(!s)return null;
    const dx=s.x-p.x,dz=s.z-p.z;
    return {id:s.id,distance:Math.hypot(dx,dz),angle:wrap(Math.atan2(dx,-dz)-p.yaw)};
  }
  function nearest(p,active) {
    return stations.filter(s=>active(s.id)).map(s=>direction(p,s.id))
      .filter(n=>n.distance<=reach && Math.abs(n.angle)<.71)
      .sort((a,b)=>(a.distance+a.angle*a.angle)-(b.distance+b.angle*b.angle))[0]?.id || null;
  }
  function create(view,config) {
    const world=document.createElement('div');world.className='bw-camera';view.append(world);
    const points=new Map(), keys=new Set();let stickX=0,stickY=0,drag=null,stickPointer=null;
    const sign=(y,txt)=>'<div style="bottom:'+y+'%" class="bw-sign">'+txt+'</div>';
    function plane(x,y,z,w,h,angle,cl,html='',tilt=0) {
      const el=document.createElement('div');el.className='bw-plane '+cl;el.setAttribute('aria-hidden','true');
      el.style.width=w*unit+'px';el.style.height=h*unit+'px';
      el.style.transform='translate3d('+(x*unit-w*unit/2)+'px,'+(-y*unit-h*unit/2)+'px,'+(z*unit)+'px) rotateY('+angle+'deg) rotateX('+tilt+'deg)';
      el.innerHTML=html;world.append(el);return el;
    }
    function box(x,y,z,w,h,d,cl) {
      plane(x,y,z+d/2,w,h,0,cl+' bw-box-front');
      plane(x,y,z-d/2,w,h,180,cl+' bw-box-front');
      plane(x-w/2,y,z,d,h,-90,cl+' bw-box-side');
      plane(x+w/2,y,z,d,h,90,cl+' bw-box-side');
      plane(x,y+h/2,z,w,d,0,cl+' bw-box-top','',90);
    }
    plane(0,0,0,9.8,7.7,0,'bw-floor','',90);
    plane(0,3.62,0,9.8,7.7,0,'bw-ceiling','',-90);
    plane(0,1.81,-3.78,9.8,3.62,0,'bw-wall bw-frontwall','<div class="bw-window"><i class="bw-moon"></i><i class="bw-skyline"></i><i class="bw-panes"></i></div><div class="bw-frontscript">Midnight Paws</div>');
    plane(0,1.81,3.78,9.8,3.62,180,'bw-wall bw-backwall',sign(76,'THE TEA BAR'));
    plane(-4.89,1.81,0,7.56,3.62,90,'bw-wall bw-westwall',sign(76,'CUPS &amp; BAKERY'));
    plane(4.89,1.81,0,7.56,3.62,-90,'bw-wall bw-eastwall',sign(76,'FINISHING BAR'));
    box(0,.45,-3.17,9.72,.9,.98,'bw-counter');
    box(0,.45,3.28,9.72,.9,1.03,'bw-counter');
    box(-4.40,.45,0,1.02,.9,5.48,'bw-counter');
    box(4.40,.45,0,1.02,.9,5.48,'bw-counter');
    for(const z of [-2.9,.28,2.9])for(const x of [-3.35,3.35]){
      plane(x,2.96,z,.46,1.24,0,'bw-lantern','<i></i>');
    }
    for(const x of [-3.88,3.88]){
      plane(x,1.3,-3.43,.76,1.06,0,'bw-plant','<i></i><b></b>');
    }
    for(const s of stations){
      const isCat=s.id.startsWith('cat');
      const el=plane(s.x,isCat?1.52:1.48,s.z,isCat?1.05:1.26,isCat?1.1:1.05,s.angle,'bw-prop');
      points.set(s.id,el);
    }
    let previous='';
    function paint(items) {
      const snapshot=JSON.stringify(items);
      if(snapshot===previous)return;previous=snapshot;
      for(const s of stations){
        const i=items[s.id],el=points.get(s.id);
        if(!i){el.hidden=true;continue;}
        el.hidden=false;el.classList.toggle('bw-running',!!i.running);
        if(s.id.startsWith('cat')){
          el.innerHTML='<div class="bw-cat-face">'+config.portrait(i.coat)+'</div><div class="bw-bubble">'+(i.taken?'♡':'…')+'</div><span class="bw-name">'+i.label+'</span>';
        }else{
          const type=s.id.startsWith('tea')?'tea':s.id;
          el.style.setProperty('--brew',i.color||'#c79673');
          el.innerHTML='<div class="bw-equipment bw-eq-'+type+'"><i class="bw-eq-a"></i><i class="bw-eq-b"></i><i class="bw-eq-c"></i><i class="bw-eq-d"></i></div><span class="bw-name">'+i.label+'</span>';
        }
      }
    }
    const joystick=config.joystick;
    function clear() {
      keys.clear();stickX=stickY=0;drag=null;stickPointer=null;
      joystick.style.setProperty('--jx','0px');joystick.style.setProperty('--jy','0px');
    }
    function thumb(e) {
      const r=joystick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.34),y=(e.clientY-r.top-r.height/2)/(r.height*.34);
      const m=Math.max(1,Math.hypot(x,y));stickX=x/m;stickY=-y/m;
      joystick.style.setProperty('--jx',(stickX*r.width*.24)+'px');joystick.style.setProperty('--jy',(-stickY*r.height*.24)+'px');
    }
    joystick.addEventListener('pointerdown',e=>{
      if(stickPointer!==null || !config.running())return;
      e.preventDefault();stickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);thumb(e);
    });
    joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)thumb(e);});
    joystick.addEventListener('lostpointercapture',e=>{if(stickPointer!==e.pointerId)return;stickPointer=null;stickX=stickY=0;
      joystick.style.setProperty('--jx','0px');joystick.style.setProperty('--jy','0px');});
    view.addEventListener('pointerdown',e=>{
      if(drag || !config.running() || e.button!==0)return;e.preventDefault();view.setPointerCapture(e.pointerId);
      drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    });
    view.addEventListener('pointermove',e=>{
      if(!drag || drag.id!==e.pointerId || !config.running())return;
      const p=config.state().pose,dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      p.yaw=wrap(p.yaw+dx*.006);p.pitch=clamp(p.pitch-dy*.003,-.42,.42);drag.x=e.clientX;drag.y=e.clientY;
    });
    view.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)drag=null;});
    const codes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
    window.addEventListener('keydown',e=>{
      if(!config.running()||e.altKey||e.ctrlKey||e.metaKey||!codes.includes(e.code))return;
      e.preventDefault();keys.add(e.code);
    });
    window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clear);
    let focal=400;
    const resize=()=>{const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;focal=Math.max(160,Math.min(w*.83,h*.97));view.style.perspective=focal+'px';};
    const observer=new ResizeObserver(resize);observer.observe(view);
    function frame(dt) {
      const p=config.state().pose;
      if(config.running()){
        const turn=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
        p.yaw=wrap(p.yaw+turn*2.05*dt);
        if(!config.state().job){
          const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))+stickY;
          const side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+stickX;
          const speed=3.1*dt/Math.max(1,Math.hypot(forward,side)),sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
          p.x=clamp(p.x+(sin*forward+cos*side)*speed,-3.38,3.38);
          p.z=clamp(p.z+(-cos*forward+sin*side)*speed,-2.04,2.04);
        }
      }
      world.style.transform='translateZ('+focal+'px) rotateX('+p.pitch+'rad) rotateY('+p.yaw+'rad) translate3d('+(-p.x*unit)+'px,'+(eye*unit)+'px,'+(-p.z*unit)+'px)';
    }
    return {frame,paint,clear,resize,turn(amount){const p=config.state().pose;p.yaw=wrap(p.yaw+amount);}};
  }
  return {stations,spot,nearest,direction,spawn,bounded,create};
})();
