/* Each kitchen has three hittable work surfaces. Both cameras use the same equipment and tickets. */
window.makeMarketScene = function(canvas, venue, index, view, act) {
  const T=window.THREE;
  if(!T)return null;
  let renderer;
  try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false});}catch{return null;}
  const world=new T.Scene(),cam=new T.PerspectiveCamera(46,1,.1,70);
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.outputEncoding=T.sRGBEncoding;
  world.background=new T.Color('#201c31');
  world.add(new T.HemisphereLight(0xffe5bb,0xb8a7c4,1.2));
  const key=new T.DirectionalLight(0xffe3b0,1.05);key.position.set(-3,8,5);world.add(key);
  const amber=new T.PointLight(0xffab61,.8,10);amber.position.set(1,3.5,.1);world.add(amber);
  const mats=new Map(),geos=[],textures=[];
  const mat=color=>{if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness:.68}));return mats.get(color);};
  function mesh(parent,geo,color,x,y,z){
    geos.push(geo);const m=new T.Mesh(geo,typeof color==='string'?mat(color):color);m.position.set(x,y,z);parent.add(m);return m;
  }
  const box=(p,c,x,y,z,w,h,d)=>mesh(p,new T.BoxGeometry(w,h,d),c,x,y,z);
  const cyl=(p,c,x,y,z,a,b,h)=>mesh(p,new T.CylinderGeometry(a,b,h,28),c,x,y,z);
  function oval(p,c,x,y,z,w,h,d){const m=mesh(p,new T.SphereGeometry(1,16,12),c,x,y,z);m.scale.set(w,h,d);return m;}
  const wood=['#966343','#9d523c','#aa7c4b','#885434','#a46946','#876346'][index],accent=venue.color;
  box(world,'#554341',0,-.09,0,21,.16,16);
  box(world,'#594345',0,2.2,-2.6,20,5,.3);
  for(let j=-11;j<12;j++)box(world,wood,j*.61,.62,-2.38,.57,1.28,.16);
  let disposed=false;
  const art=new T.TextureLoader().load('assets/market/'+venue.id+'.webp',tex=>{tex.encoding=T.sRGBEncoding;if(disposed)tex.dispose();});
  textures.push(art);
  const picture=new T.MeshBasicMaterial({map:art});mats.set('picture',picture);
  box(world,'#d9b57c',0,2.53,-2.35,3.12,3.12,.14);
  mesh(world,new T.PlaneGeometry(2.98,2.98),picture,0,2.53,-2.26);
  for(let i=-4;i<=4;i++){
    if(Math.abs(i)<2)continue;
    const x=i*1.1;
    box(world,wood,x,2.0,-2.28,.93,.09,.5);
    for(let j=0;j<3;j++){const cx=x+(j-1)*.23;
      cyl(world,j===1?accent:'#ded6a5',cx,2.22,-2.18,.075,.105,.34);
      cyl(world,'#483733',cx,2.41,-2.18,.074,.074,.045);}
  }
  for(const x of [-5.9,5.9]){
    box(world,wood,x,2.1,.55,.22,4.4,6.5);
    box(world,'#63433f',x*.72,2.40,-2.19,.18,4.75,.20);
  }
  for(let i=-6;i<=6;i++){
    box(world,i%2?'#f7dfb3':accent,i*.72,4.30,-.93,.72,.63,.14);
    cyl(world,'#d9a259',i*.7,4.70,-.93,.035,.035,.50);
  }
  const xs=[-2.7,0,2.7],groups=xs.map((x,i)=>{
    const g=new T.Group();g.position.x=x;g.userData.station=i;world.add(g);
    box(g,wood,0,.67,0,2.68,1.25,1.64);
    box(g,'#dfb686',0,1.34,0,2.69,.14,1.84);
    box(g,'#6e443a',0,.84,.835,2.35,.72,.05);
    for(let j=-2;j<3;j++)box(g,wood,j*.44,.84,.87,.36,.64,.036);
    return g;
  });
  const [prep,stove,pass]=groups;
  box(prep,'#aa784a',-.13,1.45,.12,1.55,.095,1);
  for(let j=0;j<3;j++){
    cyl(prep,['#c9b7b0','#c89b67','#9cb1a2'][j],-.83+j*.74,1.56,-.49,.23,.15,.28);
    oval(prep,['#e89763','#7fa647','#f8d89a'][j],-.83+j*.74,1.70,-.49,.20,.065,.20);
  }
  box(prep,'#8b674c',.7,1.52,.28,.13,.08,.42);
  box(prep,'#c2c9c8',.68,1.51,-.06,.24,.06,.38);
  const provision=new T.Group();provision.position.set(-.28,1.52,.15);prep.add(provision);
  function food(p,x,y,z){
    if(index===2||index===4){
      const roll=oval(p,index===2?'#e8ad66':'#e6b364',x,y+.08,z,.52,.12,.20);
      roll.rotation.y=-.18;
      for(let i=-1;i<=1;i++)oval(p,index===2?'#efd5a1':'#a8784c',x+i*.22,y+.17,z,.05,.02,.07);
    }else if(index===5){
      const leaf=box(p,'#548350',x,y,z,.92,.035,.63);leaf.rotation.y=.15;
      oval(p,'#faf0cd',x-.1,y+.10,z,.24,.15,.24);
      oval(p,'#fff2c7',x+.23,y+.06,z,.15,.065,.12);
      oval(p,'#edac4b',x+.24,y+.12,z,.069,.022,.06);
    }else{
      cyl(p,'#efd7b1',x,y+.055,z,.39,.23,.14);
      cyl(p,index===1?'#c55339':'#c39750',x,y+.135,z,.35,.34,.02);
      for(let i=0;i<8;i++){
        const a=i*2.4,r=.25*Math.sqrt(i/8);
        if(index===1){const cake=oval(p,'#edaf7b',x+Math.cos(a)*r,y+.16,z+Math.sin(a)*r,.11,.045,.045);cake.rotation.y=a;}
        else{const noodle=mesh(p,new T.TorusGeometry(.1,.017,5,12,4.8),'#f5d694',x+Math.cos(a)*r,y+.16,z+Math.sin(a)*r);noodle.rotation.set(-Math.PI/2,0,a);}
      }
    }
  }
  food(provision,0,0,0);
  box(stove,'#42404a',0,1.50,0,1.63,.18,1.22);
  const hot=cyl(stove,'#ee9361',0,1.615,0,.6,.6,.06);
  if(index===2){
    box(stove,'#c68d64',0,1.96,-.02,1.50,.72,1.05);
    box(stove,'#332e35',0,1.97,.53,1.14,.43,.04);
    box(stove,'#ca9d71',0,1.84,.57,.85,.06,.08);
  }else{
    const depths=[.52,.25,0,.25,.08,.54],h=depths[index],panColor=index===5?'#c99661':'#696773';
    cyl(stove,panColor,0,1.66+h/2,0,.66,.46,h);
    cyl(stove,['#d2ad64','#c9533b','#d29864','#d4934e','#e8c076','#efe5bd'][index],0,1.67+h,0,.60,.58,.025);
    for(const sign of [-1,1])box(stove,'#55413d',sign*.74,1.64+h,0,.25,.09,.13);
  }
  for(let j=0;j<4;j++)cyl(pass,'#ecdabe',.65,1.45+j*.045,-.37,.32,.24,.064);
  const platter=cyl(pass,'#cab78e',-.15,1.46,.14,.66,.55,.07);platter.scale.z=.83;
  const plated=new T.Group();pass.add(plated);food(plated,-.15,1.51,.14);
  const cat=new T.Group();cat.position.set(2.7,1.08,-1.1);world.add(cat);
  const fur='#cea57e';oval(cat,accent,0,.25,0,.32,.45,.25);oval(cat,fur,0,.82,0,.37,.30,.28);
  for(const dir of [-1,1]){
    const ear=mesh(cat,new T.ConeGeometry(.145,.29,3),fur,dir*.23,1.10,-.015);ear.rotation.z=-dir*.24;
    oval(cat,'#422e35',dir*.135,.84,.255,.03,.049,.018);
  }
  oval(cat,'#bd807d',0,.78,.282,.043,.031,.02);
  const steam=Array.from({length:5},(_,i)=>oval(stove,'#e8dac3',Math.sin(i)*.24,2.25,Math.cos(i)*.19,.046,.075,.046));
  const ray=new T.Raycaster(),keys=new Set(),first=view==='first';
  let px=0,pitch=-.20,yaw=0,frame,prev=performance.now(),cooking=false,goalX=null;
  const clamp=(x,a,b)=>Math.max(a,Math.min(x,b));
  function keydown(e){if(!first||!['a','d','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();keys.add(e.key);}
  function keyup(e){keys.delete(e.key);}
  function resetKeys(){keys.clear();}
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',resetKeys);
  let drag=null;
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{
    if(!drag)return;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;
    if(first&&drag.moved){goalX=null;yaw=clamp(yaw-(e.clientX-drag.x)*.006,-1.05,1.05);pitch=clamp(pitch-(e.clientY-drag.y)*.005,-.8,.35);}
    drag.x=e.clientX;drag.y=e.clientY;
  };
  canvas.onpointercancel=()=>{drag=null;};
  canvas.onpointerup=e=>{
    if(!drag)return;const click=!drag.moved;drag=null;if(!click)return;
    const rect=canvas.getBoundingClientRect();ray.setFromCamera({x:(e.clientX-rect.left)/rect.width*2-1,y:1-(e.clientY-rect.top)/rect.height*2},cam);
    const hit=ray.intersectObjects(groups,true)[0];if(!hit)return;
    let item=hit.object;while(item&&!Number.isInteger(item.userData.station))item=item.parent;
    if(item)act(item.userData.station);
  };
  let width=0,height=0;
  function loop(now){
    frame=requestAnimationFrame(loop);const dt=Math.min(.08,(now-prev)/1000);prev=now;
    if(document.hidden)return;
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    if(w!==width||h!==height){width=w;height=h;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
    if(first){
      const dx=Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft'));
      if(dx){goalX=null;px=clamp(px+dx*dt*3,-3.6,3.6);}
      else if(goalX!==null)px+=(goalX-px)*Math.min(dt*8,1);
      cam.position.set(px,2.40,2.75);cam.rotation.order='YXZ';cam.rotation.set(pitch,yaw,0,'YXZ');
    }else{
      const dist=Math.max(5.8,5.10/(Math.tan(cam.fov*Math.PI/360)*cam.aspect));
      cam.position.set(0,1.55+dist*.44,dist*.90);cam.lookAt(0,1.65,-.22);
    }
    for(let i=0;i<steam.length;i++){const phase=(now*.00064+i/steam.length)%1;
      steam[i].visible=cooking;steam[i].position.y=2.17+phase*.67;steam[i].scale.setScalar(.035+.055*(1-phase));}
    cat.rotation.z=Math.sin(now*.0019)*.025;renderer.render(world,cam);
  }
  frame=requestAnimationFrame(loop);
  return {
    focus(i){if(first){goalX=xs[i];yaw=0;pitch=-.28;}},
    update(t,tickets){plated.visible=t.stage==='plated';provision.visible=t.stage==='new'||t.stage==='prepped';cooking=tickets.some(o=>o.stage==='cooking');hot.visible=cooking||t.stage==='ready';},
    dispose(){disposed=true;cancelAnimationFrame(frame);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',resetKeys);
      canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=null;
      for(const geo of geos)geo.dispose();for(const m of mats.values())m.dispose();for(const tex of textures)tex.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
};
