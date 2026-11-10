/* First-person service in metres. Both renderers use the same camera, actors and stations. */
window.BobaRoom = (() => {
  'use strict';
  const unit=120, eye=1.67, reach=1.62;
  const counterZ=-2.75, aisleWidth=4.15;
  const stations=[['line',-3.23],['rack',-2.39],['tea',-1.29],['milk',-.21],['ice',.54],['top',1.30],['lid',2.07],['shake',2.84],['pickup',3.65]]
    .map(([id,x])=>({id,x,z:counterZ,angle:0}));
  const spot=id=>stations.find(s=>s.id===id);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const wrap=r=>Math.atan2(Math.sin(r),Math.cos(r));
  const spawn=()=>({x:-4.02,z:-1.39,yaw:.64,pitch:-.16});
  const bounded=p=>p && Number.isFinite(p.x)&&Math.abs(p.x)<=aisleWidth && Number.isFinite(p.z)&&Math.abs(p.z)<=2.04 &&
    Number.isFinite(p.yaw)&&Math.abs(p.yaw)<=Math.PI+.0001 && Number.isFinite(p.pitch)&&p.pitch>=-.6301&&p.pitch<=.5701;
  function direction(p,id) {
    const s=spot(id);if(!s)return null;
    const dx=s.x-p.x,dz=s.z-p.z;
    return {id:s.id,distance:Math.hypot(dx,dz),angle:wrap(Math.atan2(dx,-dz)-p.yaw)};
  }
  function nearest(p,active) {
    return stations.filter(s=>active(s.id)).map(s=>direction(p,s.id))
      .filter(n=>n.distance<=reach && Math.abs(n.angle)<.71)
      .sort((a,b)=>(Math.abs(a.angle)+a.distance*.12)-(Math.abs(b.angle)+b.distance*.12))[0]?.id || null;
  }
  const radians=degrees=>degrees*Math.PI/180;
  const secondsLeft=seconds=>(Math.ceil(seconds*10)/10).toFixed(1)+'s';
  function workClock(job,state){
    if(!job)return null;
    const cup=state?.orders?.find(order=>order.id===job.jobId)?.cup;
    const duration=cup?.duration||job.total||1;
    const left=job.ready?0:Math.max(0,cup?.left??job.left??0);
    return {left,progress:job.ready?1:clamp(1-left/duration,0,1)};
  }
  function machineReadout(job,clock){
    if(!job||!clock)return '';
    return (job.caption?job.caption+' ':job.jobId?'#'+job.jobId+' ':'')+(job.ready?'Ready':secondsLeft(clock.left));
  }
  function counterTask(id,state){
    if (id==='line') {
      const guest=state?.orders?.find(order=>!order.taken);
      if (guest?.orderLeft > 0) return {caption:'Order',left:guest.orderLeft};
    }
    const task=state?.staff?.[id==='line'?'cashier':'server']?.task;
    const caption=task&&{take:'Order',serveCup:'Serve'}[task.kind];
    return caption?{caption,left:task.left}:null;
  }
  function guestSpot(pickup,index) {
    return {x:spot(pickup?'pickup':'line').x+index*(pickup?.54:.94),z:-4.08-index*(pickup?.82:1.05)};
  }
  function actors(items) {
    const people=[];
    for(const id of ['line','pickup']){
      const pickup=id==='pickup';
      for(const [index,guest] of (items[id]?.guests||[]).entries()){
        people.push({key:'guest:'+guest.id,coat:guest.coat,name:guest.name,mood:guest.mood,
          ...guestSpot(pickup,index),y:index?.01:.48,
          yaw:index?(pickup?-.45:-.72):0,walk:guest.walk});
      }
    }
    for(const worker of items.crew||[]){
      const s=spot(worker.station)||spot('line');
      people.push({key:'staff:'+worker.role,name:worker.name,coat:worker.coat,apron:'#91d9bb',working:worker.working,
        x:s.x+(s.id==='pickup'?-.56:.48),z:counterZ-.84,y:.1,yaw:.08});
    }
    return people;
  }
  function originalScene(view,config) {
    const T=window.THREE,art=window.BobaOriginalArt;
    if(!T||!art)return null;
    const canvas=document.createElement('canvas');
    canvas.className='bw-original-canvas';canvas.setAttribute('aria-hidden','true');
    let renderer;
    try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});}catch{return null;}
    const scene=new T.Scene(),cam=new T.PerspectiveCamera(63,1,.045,75);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
    // Match the original Three r128 scene and its legacy hex/material colour pipeline.
    renderer.outputEncoding=T.LinearEncoding;
    const material=(color,other={})=>new T.MeshStandardMaterial({color,roughness:.72,...other});
    const wood=material('#a8754f'),walnut=material('#76503e'),dark=material('#37303b'),steel=material('#d3d8e2',{metalness:.42,roughness:.3});
    const cream=material('#f2ece2'),mint=material('#9de6c6'),rose=material('#f3a9bc'),gold=material('#f5bc7c'),wall=material(art.wall());
    const pure=c=>new T.MeshBasicMaterial({color:c});
    function mesh(parent,geo,mat,x,y,z){
      const o=new T.Mesh(geo,mat);o.position.set(x,y,z);parent.add(o);return o;
    }
    const box=(parent,mat,x,y,z,w,h,d)=>mesh(parent,new T.BoxGeometry(w,h,d),mat,x,y,z);
    const cyl=(parent,mat,x,y,z,top,bottom,h,n=18)=>mesh(parent,new T.CylinderGeometry(top,bottom,h,n),mat,x,y,z);
    function ball(parent,mat,x,y,z,rx,ry=rx,rz=rx){
      const o=mesh(parent,new T.SphereGeometry(1,14,10),mat,x,y,z);o.scale.set(rx,ry,rz);return o;
    }
    function group(parent,x,y,z,angle=0){const o=new T.Group();o.position.set(x,y,z);o.rotation.y=angle;parent.add(o);return o;}
    function label(parent,text,w,h,x,y,z,opts={}){
      const c=document.createElement('canvas');c.width=640;c.height=Math.round(640*h/w);
      const g=c.getContext('2d'),fg=opts.fg||'#46333e';
      g.fillStyle=opts.bg||'#f8ead2';g.fillRect(0,0,c.width,c.height);
      g.strokeStyle=opts.border||'#cfae88';g.lineWidth=6;g.strokeRect(4,4,c.width-8,c.height-8);
      g.textAlign='center';g.textBaseline='middle';let size=Math.min(c.height*.61,116);
      const font=opts.script?'italic bold ':'700 ';
      do{g.font=font+size+'px '+(opts.script?'Georgia,serif':'system-ui,sans-serif');if(g.measureText(text).width<=c.width-52)break;size-=2;}while(size>16);
      g.fillStyle=fg;g.fillText(text,c.width/2,c.height/2);
      const tex=new T.CanvasTexture(c);
      const plane=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex}),x,y,z);
      plane.userData.ownsTexture=true;return plane;
    }
    function release(node){
      if(!node)return;
      node.removeFromParent?node.removeFromParent():node.parent?.remove(node);
      node.traverse(o=>{
        o.geometry?.dispose();const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
        for(const mat of mats){if(o.userData?.ownsTexture)mat.map?.dispose();mat.dispose();}
      });
    }
    scene.background=new T.Color('#171633');scene.fog=new T.Fog('#24213e',24,60);
    scene.add(new T.HemisphereLight('#c9bcff','#4a3428',.34));
    const sun=new T.DirectionalLight('#fff1d6',.055);sun.position.set(-4,8,2);scene.add(sun);
    scene.add(new T.AmbientLight('#ffffff',.12));
    for(const [x,y,z,intensity,range] of [[-2.05,2.55,-3.45,.74,8],[2.20,2.55,-3.45,.74,8],[-1.1,3,-8.1,.42,12],[0,2.8,2.4,.68,5]]){
      const light=new T.PointLight('#ffc27a',intensity,range,1.5);light.position.set(x,y,z);scene.add(light);
    }
    // The original café has oak planks, plaster window bays, an oak/marble counter,
    // a sleeping cat on its sill and amber cone pendants. Extend its staff aisle for service.
    const tex=art.floor();tex.repeat.set(4,6);
    const floor=mesh(scene,new T.PlaneGeometry(12,15),material('#ffffff',{map:tex}),0,0,-3.5);floor.rotation.x=-Math.PI/2;
    const sc=document.createElement('canvas');sc.width=sc.height=64;
    const sg=sc.getContext('2d'),shadowGradient=sg.createRadialGradient(32,32,2,32,32,31);
    shadowGradient.addColorStop(0,'rgba(42,27,38,.43)');shadowGradient.addColorStop(.48,'rgba(42,27,38,.24)');shadowGradient.addColorStop(1,'rgba(42,27,38,0)');
    sg.fillStyle=shadowGradient;sg.fillRect(0,0,64,64);
    const shadowTex=new T.CanvasTexture(sc);
    function shadow(parent,x,y,z,w,d){
      const m=new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
      const o=mesh(parent,new T.PlaneGeometry(w,d),m,x,y,z);o.rotation.x=-Math.PI/2;return o;
    }
    const wallBox=(x,z,w,d)=>box(scene,wall,x,1.92,z,w,3.84,d);
    wallBox(-5.97,-3.5,.16,15);wallBox(5.97,-3.5,.16,15);wallBox(0,4.02,12,.18);
    const zBack=-10.95;
    for(const [left,right] of [[-6,-4.65],[-1.4,-.65],[2.4,3.0],[4.48,6]])wallBox((left+right)/2,zBack,right-left,.18);
    const windowFrame=material('#654737');
    for(const [l,r] of [[-4.65,-1.4],[-.65,2.4]]){
      const x=(l+r)/2,w=r-l;
      box(scene,wall,x,.43,zBack,w,.86,.18);box(scene,wall,x,3.45,zBack,w,.89,.18);
      box(scene,wood,x,.91,zBack+.13,w+.19,.10,.39);
      box(scene,windowFrame,x,2.98,zBack+.01,w,.1,.13);
      box(scene,windowFrame,x,1.98,zBack+.02,.065,2.02,.13);
      box(scene,windowFrame,x,1.9,zBack+.02,w,.065,.13);
    }
    box(scene,wall,3.74,3.14,zBack,1.48,1.49,.16);
    box(scene,walnut,3.74,1.18,zBack,1.42,2.36,.19);
    box(scene,pure('#ffcf9a'),3.74,1.69,zBack+.12,.75,.76,.025);
    const ceiling=material('#b79881');box(scene,ceiling,0,3.96,-3.5,12.1,.18,15.1);
    for(const z of [-9.5,-6.4,-2.6,1.45])box(scene,walnut,0,3.83,z,12,.13,.17);
    for(const x of [-5.85,5.85]){
      box(scene,walnut,x,.46,-3.5,.04,.89,14.9);
      for(let z=-10.4;z<3.8;z+=.9)box(scene,wood,x-Math.sign(x)*.035,.49,z,.035,.76,.055);
      box(scene,wood,x-Math.sign(x)*.04,.93,-3.5,.08,.055,14.9);box(scene,dark,x,.075,-3.5,.08,.15,14.9);
    }
    let seed=4096;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    box(scene,pure('#191936'),0,6,-26,55,22,.12);
    const buildingMats=['#272642','#201e39','#30283e'].map(pure),windowMats=['#f9d59e','#a9d6c4'].map(pure);
    for(let i=0;i<17;i++){
      const x=-19+i*2.45,z=-16-rand()*5,w=1.55+rand()*1.3,h=2+rand()*4.5;
      box(scene,buildingMats[i%3],x,h/2,z,w,h,1);
      for(let j=0;j<6;j++)box(scene,windowMats[j%4?0:1],x+(rand()-.5)*w*.75,.55+rand()*(h-.8),z+.51,.15,.24,.016);
    }
    ball(scene,pure('#ffeacc'),2.2,6,-23,.78);
    function counter(x,z,w,d){
      box(scene,walnut,x,.48,z,w,.96,d);box(scene,cream,x,.99,z,w+.10,.085,d+.11);
      box(scene,wood,x,.47,z,w+.045,.82,d+.045);
    }
    counter(.14,-3.07,8.10,.85);
    for(let x=-3.64;x<4.12;x+=.68)box(scene,walnut,x,.48,-2.615,.025,.79,.012);
    box(scene,mint,.14,.76,-2.607,8,.035,.018);
    for(const x of [-2.4,.05,2.55]){
      const lamp=group(scene,x,0,-3.38);
      cyl(lamp,dark,0,3.50,0,.012,.012,.73,6);
      cyl(lamp,material('#e7ab69',{emissive:'#93582e',emissiveIntensity:.15}),0,3.01,0,.13,.30,.28,22);
      ball(lamp,pure('#fff2c4'),0,2.87,0,.10,.062,.10);
    }
    const wirePoints=[],fairyMat=pure('#ffe7ba');
    for(let i=0;i<=32;i++){
      const x=-5.8+i*11.6/32,y=3.25-.30*Math.abs(Math.sin(i*Math.PI/8));
      wirePoints.push(new T.Vector3(x,y,-6.08));
      if(i%2===0)ball(scene,fairyMat,x,y-.045,-6.08,.035,.050,.035);
    }
    scene.add(new T.Line(new T.BufferGeometry().setFromPoints(wirePoints),new T.LineBasicMaterial({color:'#594536'})));
    const decorate=group(scene,0,0,-4.88);
    for(const it of art.furnishings()){
      const object=art.item(it.t,it.c);
      if(object.userData.wall){
        const side=Math.abs(it.x)>5.7;
        object.position.set(side?Math.sign(it.x)*5.84:it.x,object.userData.wall,side?it.z:-5.88);
        object.rotation.y=side?Math.sign(-it.x)*Math.PI/2:0;
      }else{object.position.set(it.x,0,Math.min(.7,it.z));object.rotation.y=(it.r||0)*Math.PI/2;}
      decorate.add(object);
      if(!object.userData.wall&& !it.t.startsWith('rug'))shadow(decorate,it.x,.013,Math.min(.7,it.z),1.25,.95);
    }
    const sleeper=art.sleeper();sleeper.position.set(-3.7,.98,zBack+.28);scene.add(sleeper);
    const menu=group(scene,3.8,1.76,-7.46,-.38);
    box(menu,walnut,0,-1.25,-.025,.095,1.1,.10);
    cyl(menu,dark,0,-1.73,-.025,.24,.27,.045);
    box(menu,walnut,0,0,0,1.69,1.94,.10);
    box(menu,material('#323a39'),0,0,.062,1.60,1.85,.040);
    label(menu,'MENU',1.14,.32,0,.60,.085,{bg:'#353c3a',fg:'#c9e5ce',border:'#353c3a'});
    ['Classic Milk Tea','Jasmine Tea'].forEach((name,i)=>label(menu,name,1.46,.20,0,-.11-i*.31,.086,{bg:'#353c3a',fg:'#f5e6d0',border:'#353c3a'}));
    const brand=group(scene,0,3.43,-10.81);
    let brandLabel,houseDrink,branchName;
    const ornaments={};
    for(const id of ['taipei','kyoto','bangkok','seoul']){
      const trim=group(scene,-1.1,2.99,-6.55);
      ornaments[id]=trim;trim.visible=false;
      for(let i=0;i<3;i++){
        const x=(i-1)*.63;
        if(id==='kyoto'){
          if(i===1)box(trim,walnut,0,.12,0,2.06,.04,.05);
          box(trim,material(i===1?'#456955':'#668369'),x,-.09,0,.57,.43,.037);
          box(trim,cream,x,-.21,.024,.43,.018,.012);
        }else{
          const cord=.08+(i%2)*.13;
          cyl(trim,walnut,x,-cord/2,0,.011,.011,cord,7);
          const y=-cord-.14;
          if(id==='seoul'){
            for(let petal=0;petal<5;petal++){
              const a=petal*Math.PI*2/5;
              ball(trim,rose,x+Math.sin(a)*.083,y+Math.cos(a)*.083,0,.086,.085,.055);
            }
            ball(trim,gold,x,y,.052,.06,.06,.03);
          }else if(id==='taipei'){
            ball(trim,material('#ce6859'),x,y,0,.17,.14,.14);
            cyl(trim,gold,x,y+.13,0,.086,.11,.03,12);
            cyl(trim,gold,x,y-.14,0,.086,.066,.035,12);
          }else{
            mesh(trim,new T.OctahedronGeometry(.19),material(i===1?'#eda8ad':'#e9bd72'),x,y,0);
            box(trim,gold,x,y-.24,0,.024,.14,.02);
          }
        }
      }
    }
    for(const [coat,x,z,yaw] of [['orange',-4.07,-7.44,.98],['brown',2.14,-8.27,-1.2]]){
      const guest=art.cat(coat,null);guest.g.position.set(x,.44,z);guest.g.rotation.y=yaw;guest.g.scale.setScalar(1.05);scene.add(guest.g);
    }
    const register=spot('line'),pass=spot('pickup');
    for(const s of [register,pass]){
      const stool=art.item('stool');stool.position.set(s.x,0,-4.08);scene.add(stool);
      box(scene,s.id==='line'?mint:gold,s.x,1.038,-3.07,.97,.016,.62);
      const plaque=group(scene,s.x,.87,-2.604);
      label(plaque,s.id==='line'?'ORDERS':'PICKUP',.92,.17,0,0,0,{
        bg:s.id==='line'?'#314e49':'#70513f',fg:'#fff0cc',border:s.id==='line'?'#96be9c':'#d0a777'});
    }

    const fixtures=new Map(),actorsById=new Map(),motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Small physical displays stay on the machines. Reuse each canvas as its timer changes.
    function statusDisplay(parent,x,y,z,w,h,idle){
      const face=document.createElement('canvas');face.width=256;face.height=80;
      const g=face.getContext('2d'),texture=new T.CanvasTexture(face);texture.minFilter=T.LinearFilter;
      const screen=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture}),x,y,z);
      let previous='';
      return (job,clock)=>{
        screen.visible=!!(job||idle);
        if(!screen.visible)return;
        const text=machineReadout(job,clock)||idle,progress=clock?Math.round(clock.progress*32):0;
        const key=text+'/'+progress;if(key===previous)return;previous=key;
        const ready=!!job?.ready;
        g.fillStyle=ready?'#174e43':job?'#4e3529':'#333537';g.fillRect(0,0,256,80);
        g.strokeStyle=ready?'#a3e5bc':job?'#f0c487':'#9a9180';g.lineWidth=4;g.strokeRect(2,2,252,76);
        g.font='bold 36px system-ui,sans-serif';g.fillStyle=ready?'#d4ffdc':'#fff0cc';g.textAlign='center';g.textBaseline='middle';
        g.fillText(text,128,job?33:40,232);
        if(job){g.fillStyle='#817163';g.fillRect(12,62,232,7);g.fillStyle=ready?'#98e9c1':'#ffc57c';g.fillRect(12,62,progress*7.25,7);}
        texture.needsUpdate=true;
      };
    }
    function buildTap(parent,x,index){
      const tap=group(parent,x,0,0);tap.scale.setScalar(.84);
      const brew=material(index===0?'#bf825b':'#b7bd91');
      box(tap,steel,0,.024,0,.71,.048,.54);
      for(const side of [-.18,.18])for(const z of [-.14,.14])cyl(tap,steel,side,.22,z,.014,.019,.39,8);
      box(tap,steel,0,.43,0,.49,.04,.42);
      cyl(tap,material('#fff',{transparent:true,opacity:.22,depthWrite:false}),0,.74,0,.208,.208,.59,24);
      cyl(tap,brew,0,.71,0,.191,.191,.49,24);
      cyl(tap,index===0?gold:mint,0,.455,0,.215,.215,.055,24);
      cyl(tap,steel,0,1.055,0,.224,.224,.065,24);ball(tap,dark,0,1.10,0,.035);
      const spout=cyl(tap,steel,0,.49,.225,.023,.023,.205,12);spout.rotation.x=Math.PI/2;
      cyl(tap,steel,0,.456,.316,.023,.018,.069,12);
      const lever=group(tap,0,.50,.28);box(lever,rose,0,.064,0,.036,.128,.036);ball(lever,rose,0,.14,0,.034);
      const stream=cyl(tap,brew,0,.345,.315,.012,.014,.16,9);stream.visible=false;
      const cup=art.cup(null);cup.position.set(0,.052,.315);tap.add(cup);cup.visible=false;
      const fill=cyl(cup,brew,0,.010,0,.074,.058,.16,18);
      const display=statusDisplay(tap,0,.81,.217,.49,.155,index===0?'TAP A':'TAP B');
      return {brew,lever,stream,cup,fill,display};
    }
    const frost=material('#c1edf5',{roughness:.14,transparent:true,opacity:.76,emissive:'#72cedc',emissiveIntensity:.52});
    const iceEdge=new T.LineBasicMaterial({color:'#c2e8ed',transparent:true,opacity:.65});
    const jelly=material('#fff1cb',{roughness:.24,transparent:true,opacity:.88,emissive:'#c2a075',emissiveIntensity:.18});
    const foam=material('#fffae9',{emissive:'#fbeccd',emissiveIntensity:.19}),pearl=material('#463038',{roughness:.28});
    const teal=material('#529b90'),plum=material('#806479');
    function toppingPiece(parent,kind,x,y,z,r){
      if(kind==='nata'){
        const cube=box(parent,jelly,x,y,z,r*1.70,r*1.15,r*1.42);cube.rotation.y=.35;return cube;
      }
      return ball(parent,kind==='foam'?foam:pearl,x,y,z,r,kind==='foam'?r*.66:r,r);
    }
    function cupMount(f,parent,x,y,z,scale=1){
      f.mount=group(parent,x,y,z);f.mount.scale.setScalar(scale);
    }
    function updateCup(f,item,id){
      if(!f.mount)return;
      const present=!!(item?.running||item?.ready);
      f.mount.visible=present;
      if(!present)return;
      const stage=id==='shake'?(item.ready?'ready':'sealed'):id==='lid'&&item.ready?'sealed':'filled';
      const key=[item.base,item.milk,item.ice,item.top,stage].join('/');
      if(key===f.cupKey)return;
      f.cupKey=key;release(f.cup);
      f.cup=art.cup({...item,stage});f.mount.add(f.cup);
    }
    for(const s of stations){
      const root=group(scene,s.x,1.037,s.z,radians(s.angle));const tag=group(root,0,0,.11);
      const equipment=group(root,0,0,-.16);
      const f={root,tag,equipment,label:'',pulse:0};fixtures.set(s.id,f);
      shadow(root,0,.015,-.13,s.id==='tea'?1.35:.84,.58);
      if(s.id==='line'){
        equipment.scale.setScalar(.8);
        box(equipment,walnut,-.24,.038,0,.92,.056,.44);
        cyl(equipment,gold,.29,.085,.19,.065,.078,.047);f.bell=ball(equipment,gold,.29,.136,.19,.064,.052,.064);
        const till=group(equipment,-.38,.11,.12);box(till,dark,0,0,0,.27,.22,.08);till.rotation.x=-.16;
        label(till,'ORDER',.22,.12,0,0,.05,{bg:'#ace2cd',border:'#82bda5',fg:'#344a42'});
        f.receipt=group(equipment,.05,.076,.045);
        box(f.receipt,cream,0,0,0,.23,.028,.28);
        for(let j=0;j<3;j++)box(f.receipt,steel,0,.016,-.05+j*.048,.13,.004,.007);
        f.counterDisplay=statusDisplay(equipment,.03,.25,.11,.53,.16,'');
      }else if(s.id==='pickup'){
        equipment.scale.setScalar(.81);
        const tray=material('#b4d5c9');
        box(equipment,walnut,0,.046,.05,1.07,.064,.49);
        f.tray=box(equipment,tray,0,.087,.05,.99,.018,.42);
        cyl(equipment,steel,.59,.046,-.10,.10,.12,.045);
        cyl(equipment,steel,.59,.27,-.10,.017,.023,.43,10);
        for(let j=0;j<3;j++)box(equipment,cream,.59,.12+j*.023,-.10,.17,.018,.18).rotation.y=.17*j;
        f.counterDisplay=statusDisplay(equipment,-.08,.29,.15,.53,.16,'');
      }else if(s.id==='tea'){
        box(equipment,wood,0,.01,-.02,1.47,.035,.55);
        f.taps=[buildTap(equipment,-.37,0),buildTap(equipment,.37,1)];
      }else if(s.id==='rack'){
        equipment.scale.setScalar(.81);
        box(equipment,wood,0,.025,0,1.05,.05,.48);
        f.stack=group(equipment,0,0,0);
        for(const x of [-.28,-.02])for(let i=0;i<5;i++)cyl(f.stack,cream,x,.13+i*.053,0,.095,.073,.19,18);
        cyl(equipment,steel,.33,.13,0,.075,.075,.24);
        for(let i=0;i<7;i++)cyl(equipment,[mint,rose,gold][i%3],.33+Math.cos(i)*.033,.33,Math.sin(i)*.033,.011,.011,.37,7).rotation.z=Math.sin(i)*.15;
      }else if(s.id==='milk'){
        box(equipment,teal,0,.035,.015,.54,.07,.46);
        box(equipment,teal,0,.21,-.13,.19,.35,.11);
        cyl(equipment,material('#fff3dc',{emissive:'#d0c1a6',emissiveIntensity:.22}),0,.54,-.025,.234,.197,.44,28);
        cyl(equipment,mint,0,.345,-.025,.206,.199,.058,28);
        cyl(equipment,teal,0,.775,-.025,.232,.244,.050,28);
        cyl(equipment,mint,0,.808,-.025,.063,.067,.037);
        const handle=mesh(equipment,new T.TorusGeometry(.115,.024,8,20),teal,.211,.54,-.02);handle.scale.x=.75;
        box(equipment,steel,0,.385,.16,.058,.048,.16);
        cyl(equipment,teal,0,.36,.222,.037,.030,.065);
        f.milkStream=cyl(equipment,foam,0,.279,.222,.014,.010,.11,10);f.milkStream.visible=false;
        cupMount(f,equipment,0,.072,.222,.70);
        f.display=statusDisplay(equipment,0,.575,.205,.35,.13,'MILK');
      }else if(s.id==='ice'){
        const navy=material('#647d96'),bin=material('#e2f8fa',{transparent:true,opacity:.32,depthWrite:false});
        box(equipment,navy,0,.034,.02,.56,.068,.47);
        box(equipment,navy,0,.21,-.155,.41,.35,.105);
        box(equipment,bin,0,.56,-.015,.49,.36,.35);
        box(equipment,steel,0,.754,-.015,.53,.044,.39);
        for(let i=0;i<13;i++){
          const block=box(equipment,frost,(i%4-1.5)*.101,.44+Math.floor(i/4)*.070,(Math.floor(i/2)%2-.5)*.121,.091,.071,.087);
          block.rotation.set(Math.sin(i*1.6)*.46,i*.39,Math.cos(i)*.40);
          block.add(new T.LineSegments(new T.EdgesGeometry(block.geometry),iceEdge));
        }
        box(equipment,navy,0,.385,0,.51,.12,.38);
        box(equipment,steel,0,.323,.155,.14,.09,.16).rotation.x=.36;
        cupMount(f,equipment,0,.07,.19,.76);
        f.fallingIce=group(equipment,0,.31,.19);
        box(f.fallingIce,frost,0,0,0,.050,.047,.055);
        f.display=statusDisplay(equipment,0,.395,.203,.36,.095,'ICE');
      }else if(s.id==='top'){
        equipment.scale.setScalar(.84);
        box(equipment,steel,0,.12,0,.86,.24,.44);
        f.drops={};
        for(const [i,kind] of ['pearls','nata','foam'].entries()){
          const x=(i-1)*.28;box(equipment,dark,x,.245,0,.25,.023,.39);
          for(let j=0;j<14;j++)toppingPiece(equipment,kind,x+((j%3)-1)*.071,.265+rand()*.018,(Math.floor(j/3)-2)*.063,kind==='foam'?.059:.040);
          label(equipment,['PEARLS','COCONUT','FOAM'][i],.26,.08,x,.19,.227,{bg:'#394a49',fg:'#fff3d6',border:'#85aaa1'});
          const drops=group(equipment,.20,.41,.305);f.drops[kind]=drops;
          for(let j=0;j<3;j++)toppingPiece(drops,kind,(j-1)*.012,j*.02,(j%2)*.014,.021);
        }
        f.scoop=group(equipment,.19,.37,0);ball(f.scoop,gold,0,0,0,.094,.043,.082);
        box(f.scoop,walnut,.11,.05,-.01,.23,.032,.039).rotation.z=.4;
        cupMount(f,equipment,.2,.020,.305,.90);
        f.display=statusDisplay(equipment,-.16,.078,.227,.44,.12,'SCOOP');
      }else if(s.id==='lid'){
        equipment.scale.setScalar(.86);
        box(equipment,cream,0,.31,0,.56,.62,.49);box(equipment,dark,0,.23,.26,.38,.29,.035);
        box(equipment,steel,0,.072,.35,.34,.024,.25);box(equipment,mint,0,.49,.256,.36,.095,.025);
        f.handle=group(equipment,.29,.53,0);cyl(f.handle,steel,.074,.1,0,.019,.019,.25,10).rotation.z=-.62;ball(f.handle,rose,.15,.19,0,.051);
        cupMount(f,equipment,0,.082,.34,.82);
        f.press=cyl(equipment,steel,0,.345,.34,.132,.13,.039,24);
        f.seal=cyl(equipment,mint,0,.295,.34,.076,.076,.012,24);f.seal.visible=false;
        f.display=statusDisplay(equipment,0,.495,.277,.46,.147,'SEAL');
      }else if(s.id==='shake'){
        box(equipment,plum,0,.075,.015,.61,.15,.43);
        box(equipment,teal,0,.163,0,.57,.035,.39);
        for(const side of [-1,1]){
          box(equipment,plum,side*.198,.40,-.04,.075,.49,.13).rotation.z=-side*.075;
          ball(equipment,gold,side*.219,.59,-.025,.055);
        }
        f.cradle=group(equipment,0,.585,.016);
        box(f.cradle,steel,0,0,0,.41,.041,.073);
        for(const side of [-1,1])box(f.cradle,teal,side*.122,-.10,.035,.026,.40,.066);
        cyl(f.cradle,teal,0,-.297,.035,.152,.12,.049,24);
        cyl(f.cradle,rose,0,.078,.035,.145,.136,.046,24);
        cupMount(f,f.cradle,0,-.269,.035,1.24);
        f.display=statusDisplay(equipment,0,.080,.237,.48,.114,'SHAKE');
      }
    }
    scene.add(cam);const user=art.player(),pawMat=material(user.fur),cuff=material(user.apron),sock=material('#fff8ef'),pads=material('#f3a9bc');
    const paws=[-1,1].map(side=>{
      const paw=group(cam,side*.26,-.385,-.65);
      cyl(paw,pawMat,0,-.09,.20,.056,.072,.42,16).rotation.x=1.2;
      mesh(paw,new T.TorusGeometry(.066,.024,10,22),cuff,0,-.05,.10).rotation.x=1.2-Math.PI/2;
      ball(paw,sock,0,0,0,.089,.057,.090);
      for(const x of [-.046,-.016,.016,.046]){ball(paw,sock,x,.020,-.064,.025,.021,.025);ball(paw,pads,x,-.007,-.082,.011);}
      paw.rotation.z=-side*.12;return paw;
    });
    const hand=paws[1];
    let carried=null,carriedKey='',lastItems={},time=0,lastW=0,lastH=0,stride=0,handSway=0;
    function resize(){
      const w=view.clientWidth,h=view.clientHeight;if(!w||!h||w===lastW&&h===lastH)return;
      lastW=w;lastH=h;renderer.setSize(w,h,false);cam.aspect=w/h;cam.fov=cam.aspect<.8?77:66;cam.updateProjectionMatrix();
    }
    function paint(items){
      lastItems=items;
      const branch=items.branch;
      if(branch&&branch.name!==branchName){
        branchName=branch.name;release(brandLabel);release(houseDrink);
        brandLabel=label(brand,branch.name,3.22,.44,0,0,.052,{script:true,bg:'#3a333c',fg:'#fff1d8',border:branch.color});
        houseDrink=label(menu,branch.signature,1.46,.20,0,.20,.086,{bg:'#353c3a',fg:'#f5e6d0',border:branch.color});
        mint.color.set(branch.color);wall.color.set(art.wall()).lerp(new T.Color(branch.color),.27);
        for(const [id,ornament] of Object.entries(ornaments))ornament.visible=id===branch.id;
      }
      for(const s of stations){
        const f=fixtures.get(s.id),v=items[s.id];
        f.root.visible=!!v;
        const text=s.id==='line'||s.id==='pickup'?'':v?.label||'';
        if(text!==f.label){
          f.label=text;release(f.tagMesh);f.tagMesh=text?label(f.tag,text,s.id==='tea'?1.05:.68,.15,0,-.15,.055,{bg:'#3c3837',fg:'#f4e8cf',border:'#756552'}):null;
        }
        f.taps?.forEach((tap,n)=>tap.brew.color.set(v?.bays?.[n]?.color||['#bf825b','#b7bd91'][n]));
        updateCup(f,v,s.id);
      }
      const keep=new Set();
      for(const a of actors(items)){
        keep.add(a.key);let cached=actorsById.get(a.key);
        if(!cached||cached.coat!==a.coat){
          if(cached){release(cached.model.g);release(cached.shadow);}
          const model=art.cat(a.coat,a.apron);model.g.scale.setScalar(a.apron?1.35:1.23);
          model.g.position.set(a.walk?.x??a.x,a.y,a.walk?.z??a.z);scene.add(model.g);
          cached={model,shadow:shadow(scene,a.x,.015,a.z,1.03,.85),coat:a.coat,phase:rand()*6.28};actorsById.set(a.key,cached);
        }
        cached.target=a;
      }
      for(const [key,a] of actorsById)if(!keep.has(key)){release(a.model.g);release(a.shadow);actorsById.delete(key);}
    }
    function frame(dt,pose,distance=0,sprinting=false){
      resize();time+=dt;
      cam.position.set(pose.x,eye,pose.z);
      cam.rotation.order='YXZ';cam.rotation.y=-pose.yaw;cam.rotation.x=pose.pitch;
      const blend=motion?1-Math.exp(-dt*9):1;
      for(const a of actorsById.values()){
        const t=a.target,m=a.model;
        const dx=t.x-(t.walk?.x??m.g.position.x),dz=t.z-(t.walk?.z??m.g.position.z),dist=Math.hypot(dx,dz);
        if(t.walk){m.g.position.x=t.walk.x;m.g.position.z=t.walk.z;}
        else if(dist>.001){const step=motion?Math.min(dist,dt*2.35):dist;m.g.position.x+=dx/dist*step;m.g.position.z+=dz/dist*step;}
        a.shadow.position.set(m.g.position.x,.015,m.g.position.z);
        const height=motion && !t.apron && dist>.02 ? .01+(t.y-.01)*Math.max(0,1-dist/.45) : t.y;
        m.g.position.y=height+(motion?Math.sin(time*(dist>.06?12:t.working?4:2)+a.phase)*(dist>.06?.035:.015):0);
        const toward=dist>.09?Math.atan2(dx,dz):t.yaw;m.g.rotation.y+=wrap(toward-m.g.rotation.y)*blend;
        if(motion){const sway=t.mood==='angry'?5:t.mood==='restless'?3:1.3;
          m.head.rotation.z=Math.sin(time*sway+a.phase)*(t.mood==='angry'?.095:.035);m.tail.rotation.z=Math.sin(time*(sway+.7)+a.phase)*.15;
          m.eyes.scale.y=Math.cos(time*1.7+a.phase)>.998?.20:1;}
      }
      const st=config.state();
      for(const [id,f] of fixtures){
        const item=lastItems[id],job=item&&(item.running||item.ready)?item:null,clock=workClock(job,st);
        f.pulse=Math.max(0,f.pulse-dt);
        const pop=motion&&f.pulse?Math.sin(Math.PI*f.pulse/.34):0;
        if(f.bell)f.bell.position.y=.136-pop*.022;
        if(f.receipt)f.receipt.position.z=.045+pop*.10;
        if(f.stack)f.stack.position.y=pop*.075;
        if(f.tray)f.tray.rotation.z=pop*.04;
        if(f.milkStream){
          f.milkStream.visible=!!job?.running;
          f.milkStream.scale.x=motion?1+.08*Math.sin(time*19):1;
        }
        if(f.fallingIce){
          f.fallingIce.visible=!!job?.running;
          if(job?.running){
            const fall=motion?(clock.progress*4)%1:.5;
            f.fallingIce.position.y=.314-.113*fall*fall;
            f.fallingIce.rotation.set(fall*1.1,fall*2.4,fall*.8);
          }
        }
        if(f.cradle){
          const cycle=job?.running&&motion?Math.sin(time*20):0;
          f.cradle.rotation.z=cycle*.29;
          f.cradle.position.y=.585+Math.abs(cycle)*.021;
        }
        if(f.counterDisplay){
          const counterJob=counterTask(id,st);
          if(counterJob){
            if(f.previousTask!==counterJob.caption||counterJob.left>f.previousLeft)f.taskLength=counterJob.left;
            f.counterDisplay(counterJob,{left:counterJob.left,progress:1-counterJob.left/Math.max(f.taskLength,.01)});
          }else f.counterDisplay(null,null);
          f.previousTask=counterJob?.caption;f.previousLeft=counterJob?.left;
        }
        if(f.scoop){
          const kind=job?.pendingTop||job?.top;
          const binX=kind==='nata'?0:kind==='foam'?.28:-.28;
          const travel=job?.running?Math.min(clock.progress/.63,1):0;
          f.scoop.position.set(job?.running?binX+(.20-binX)*travel:.19,.37+(motion?Math.sin(travel*Math.PI)*.12:0),travel*.30);
          f.scoop.rotation.z=(job?.running&&motion&&travel===1)?-.8:0;
          for(const [flavor,drops] of Object.entries(f.drops)){
            drops.visible=!!job?.running&&flavor===(kind==='foam'||kind==='nata'?kind:'pearls')&&clock.progress>.60&&clock.progress<.94;
            if(drops.visible)drops.position.y=.35-.14*(motion?(clock.progress-.60)/.34:.5);
          }
        }
        f.display?.(job,clock);
        if(f.press){
          const stamp=job?.running?Math.sin(Math.PI*clock.progress):0;
          f.press.position.y=.36-(motion ? .052*stamp : 0);f.handle.rotation.x=-.46*stamp;
          f.seal.visible=!!(job?.running&&clock.progress>.56);
        }
        f.taps?.forEach((tap,n)=>{
          const bay=item?.bays?.[n],batch=bay&&(bay.running||bay.ready)?bay:null,brew=workClock(batch,st);
          tap.display(batch,brew);
          tap.cup.visible=!!batch;tap.stream.visible=!!batch?.running;
          tap.lever.rotation.x=batch?.running?-.42:0;
          const fill=brew?.progress||0;
          tap.fill.scale.y=Math.max(.02,fill);tap.fill.position.y=.006+fill*.08;
          if(batch?.running&&motion)tap.stream.scale.x=.9+Math.sin(time*23)*.12;
        });
      }
      const held=st?.hand,o=held&&st.orders.find(g=>g.id===held.id);
      const key=o?[held.kind,o.cup.stage,o.cup.flavor,o.cup.base,o.cup.milk,o.cup.ice,o.cup.top].join(':'):'';
      if(key!==carriedKey){
        carriedKey=key;release(carried);carried=null;
        if(o&&held.kind==='cup'){
          carried=art.cup(o.cup);carried.scale.setScalar(1.34);
          carried.position.set(-.045,-.054,-.073);hand.add(carried);
        }
      }
      const spread=Math.min(.26,cam.aspect*.28);
      if(motion){
        stride+=distance*4.5;
        const amplitude=distance>0?(sprinting?.020:.009):0;
        handSway+=(amplitude-handSway)*blend;
      }
      const bob=Math.sin(stride)*handSway;
      paws[0].position.x=-spread;paws[0].position.y=-.385-bob;
      hand.position.x=spread;hand.position.y=(o?-.33:-.385)+bob;
      hand.rotation.z=-.12+Math.cos(stride)*handSway*1.6;
      renderer.render(scene,cam);
    }
    view.prepend(canvas);
    return {paint,resize,frame,canvas,renderer,pulse(id){const f=fixtures.get(id);if(f)f.pulse=.34;}};
  }
  function create(view,config) {
    const world=document.createElement('div');world.className='bw-camera';view.append(world);
    const points=new Map(), keys=new Set(),guestPlanes=new Map();let stickX=0,stickY=0,drag=null,stickPointer=null;
    let scene=null,tried=false,latest={},lastPaint='';
    function useFallback(){
      scene=null;world.hidden=false;view.dataset.renderer='css';view.closest('.bs-work')?.classList.remove('bw-meshes');paintFallback(latest);
    }
    function ensureScene(){
      if(tried||!view.clientWidth)return;tried=true;
      try{scene=originalScene(view,config);}catch(error){console.warn('Original café renderer unavailable',error);}
      if(!scene){useFallback();return;}
      view.dataset.renderer='webgl';view.closest('.bs-work')?.classList.add('bw-meshes');world.hidden=true;
      const canvas=scene.canvas;canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();canvas.hidden=true;useFallback();});
      scene.paint(latest);
    }
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
    plane(0,0,-3.5,12,15,0,'bw-floor','',90);
    plane(0,3.82,-3.5,12,15,0,'bw-ceiling','',-90);
    plane(0,1.92,-10.96,12,3.84,0,'bw-wall bw-frontwall','<div class="bw-window"><i class="bw-moon"></i><i class="bw-skyline"></i><i class="bw-panes"></i></div><div class="bw-door"><b></b></div>');
    const shopSign=plane(0,3.43,-10.81,3.28,.46,0,'bw-hanging-sign','Midnight Paws Boba');
    const ornaments=plane(-1.1,2.82,-6.55,2.05,.57,0,'bw-shop-ornaments','<i></i><i></i><i></i>');
    const menuBoard=plane(4.50,2.03,-6.28,1.67,1.94,-22,'bw-slate','<b>MENU</b><span></span><span>Classic Milk Tea</span><span>Jasmine Tea</span>');
    plane(0,1.81,3.78,12,3.62,180,'bw-wall bw-backwall');
    plane(-5.93,1.92,-3.5,15,3.84,90,'bw-wall bw-westwall');
    plane(5.93,1.92,-3.5,15,3.84,-90,'bw-wall bw-eastwall');
    box(.14,.49,-3.07,8.10,.98,.85,'bw-counter');
    for(const z of [-2.9,.28,2.9])for(const x of [-3.35,3.35]){
      plane(x,2.96,z,.46,1.24,0,'bw-lantern','<i></i>');
    }
    for(const x of [-4.52,4.72]){
      plane(x,1.3,-3.43,.76,1.06,0,'bw-plant','<i></i><b></b>');
    }
    for(const [x,z] of [[-3,-7],[1.5,-8.5]]){
      box(x,.77,z,1.26,.10,.92,'bw-oak');for(const dx of [-.47,.47])for(const dz of [-.32,.32])box(x+dx,.37,z+dz,.07,.74,.07,'bw-oak');
      for(const side of [-1,1]){box(x+side*.82,.43,z,.47,.09,.46,'bw-oak');box(x+side*1.03,.79,z,.08,.67,.44,'bw-oak');}
    }
    for(const s of stations){
      const el=plane(s.x,1.37,s.z+.13,s.id==='tea'?1.45:.75,.87,s.angle,'bw-prop');
      points.set(s.id,el);
    }
    const fallbackMeters=new Map(),fallbackGuests=new Map();
    const parts='<i class="bw-eq-a"></i><i class="bw-eq-b"></i><i class="bw-eq-c"></i><i class="bw-eq-d"></i>';
    const idleSign={milk:'Milk',ice:'Ice',top:'Scoop',lid:'Seal',shake:'Shake'};
    function paintFallback(items) {
      fallbackMeters.clear();
      if(items.branch){
        shopSign.textContent=items.branch.name;
        shopSign.style.borderColor=items.branch.color;
        menuBoard.querySelector('span').textContent=items.branch.signature;
        view.style.setProperty('--shop-trim',items.branch.color);
        ornaments.dataset.branch=items.branch.id;
      }
      for(const s of stations){
        const i=items[s.id],el=points.get(s.id);
        if(!i){el.hidden=true;continue;}
        el.hidden=false;el.classList.toggle('bw-running',!!i.running);
        if(s.id==='pickup'){
          el.innerHTML='<div class="bw-pass-tray"></div><b class="bw-led" hidden></b><span class="bw-name bw-pass-name">PICKUP</span>';
        }else if(s.id==='line'){
          el.innerHTML='<div class="bw-till"><b>ORDER</b><i></i></div><b class="bw-led" hidden></b><span class="bw-name bw-line-name">ORDERS</span>';
        }else if(s.id==='tea'){
          el.innerHTML=[0,1].map(n=>'<div class="bw-dual-tap"><div class="bw-equipment bw-eq-tea">'+parts+'</div><i class="bw-tap-glass"></i><b class="bw-led"></b></div>').join('')+'<span class="bw-name"></span>';
          [...el.querySelectorAll('.bw-dual-tap')].forEach((tap,n)=>{
            const value=i.bays?.[n],batch=value&&(value.running||value.ready)?value:null;
            tap.classList.toggle('bw-running',!!batch?.running);tap.classList.toggle('bw-has-cup',!!batch);
            tap.style.setProperty('--brew',batch?.color||['#bf825b','#b7bd91'][n]);
            fallbackMeters.set('tea'+n,{face:tap.querySelector('.bw-led'),parent:tap,job:batch,idle:n?'Tap B':'Tap A'});
          });
          el.lastElementChild.textContent=i.label;
        }else{
          const type=s.id;
          el.style.setProperty('--brew',i.color||'#c79673');
          const withTimer=Boolean(idleSign[type]);
          el.dataset.topping=i.pendingTop||i.top||'';
          el.classList.toggle('bw-has-cup',!!(i.running||i.ready));el.classList.toggle('bw-finished',!!i.ready);
          const glass=withTimer?'<i class="bw-fixture-cup"></i>':'';
          const bins=type==='top'?'<div class="bw-topping-bins"><i></i><i></i><i></i></div>':'';
          const body=type==='shake'?'<div class="bw-shake-cradle">'+glass+'</div>':parts+bins+glass;
          el.innerHTML='<div class="bw-equipment bw-eq-'+type+'">'+body+'</div>'+(withTimer?'<b class="bw-led"></b>':'')+'<span class="bw-name"></span>';
          el.lastElementChild.textContent=i.label;
          if(withTimer)fallbackMeters.set(type,{face:el.querySelector('.bw-led'),parent:el,job:i.running||i.ready?i:null,idle:idleSign[type]});
        }
        if(s.id==='line'||s.id==='pickup')fallbackMeters.set(s.id,{face:el.querySelector('.bw-led'),parent:el,counter:s.id});
      }
      const keep=new Set();
      for(const a of actors(items)){
        keep.add(a.key);let el=guestPlanes.get(a.key);
        if(!el){el=plane(a.x,a.y+.69,a.z,1.12,1.20,0,'bw-person','<div class="bw-cat-face">'+config.portrait(a.coat)+'</div>');guestPlanes.set(a.key,el);}
        fallbackGuests.set(a.key,a);
        el.dataset.mood=a.mood||'calm';
        el.dataset.actor=a.key;
        if(a.apron)el.classList.add('bw-staff');
      }
      for(const [key,el] of guestPlanes)if(!keep.has(key)){el.remove();guestPlanes.delete(key);fallbackGuests.delete(key);}
      positionFallbackGuests();
    }
    function positionFallbackGuests(){
      for(const [key,a] of fallbackGuests){
        const p=a.walk||a,distance=Math.hypot(a.x-p.x,a.z-p.z);
        const height=a.walk ? .01+(a.y-.01)*Math.max(0,1-distance/.45) : a.y;
        const transform='translate3d('+((p.x-.56)*unit)+'px,'+(-(height+.69+.60)*unit)+'px,'+(p.z*unit)+'px) rotateY('+a.yaw+'rad)';
        const el=guestPlanes.get(key);if(el.style.transform!==transform)el.style.transform=transform;
      }
    }
    function tickFallback(){
      const st=config.state();
      positionFallbackGuests();
      for(const {face,parent,job,idle,counter} of fallbackMeters.values()){
        if(counter){
          const task=counterTask(counter,st);face.hidden=!task;
          if(task){const text=machineReadout(task,{left:task.left});if(face.textContent!==text)face.textContent=text;}
          continue;
        }
        const clock=workClock(job,st),text=machineReadout(job,clock)||idle;
        if(face.textContent!==text)face.textContent=text;
        parent.style.setProperty('--fill',(100*(clock?.progress||0)).toFixed(1)+'%');
        face.classList.toggle('bw-ready',!!job?.ready);
      }
    }
    function paint(items){
      latest=items;const stamp=JSON.stringify(items);
      if(stamp===lastPaint)return;lastPaint=stamp;
      if(scene)scene.paint(items);else paintFallback(items);
      if(scene && config.state()?.paused)scene.frame(0,config.state().pose);
    }
    const joystick=config.joystick, sprintButton=config.sprintButton;
    const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
    let sprintToggle=false, wasLocked=false, wantsLock=false, lockAttempt=0;
    function toggleSprint(on){
      sprintToggle=on;
      if(sprintButton)sprintButton.setAttribute('aria-pressed',String(on));
    }
    function clear() {
      keys.clear();stickX=stickY=0;drag=null;stickPointer=null;toggleSprint(false);
      joystick.style.setProperty('--jx','0px');joystick.style.setProperty('--jy','0px');
    }
    function releaseLook(){
      wantsLock=false;wasLocked=false;lockAttempt++;view.dataset.look='idle';
      if(document.pointerLockElement===view)document.exitPointerLock();
    }
    function captureLook(){
      if(!config.running()||!finePointer.matches)return;
      view.focus({preventScroll:true});
      wantsLock=true;
      if(document.pointerLockElement===view)return;
      view.dataset.look='drag';
      if(!view.requestPointerLock)return;
      const attempt=++lockAttempt;
      try{
        const request=view.requestPointerLock();
        request?.then(()=>{
          if(attempt===lockAttempt&&wantsLock&&document.pointerLockElement===view){
            wasLocked=true;view.dataset.look='locked';
          }
        },()=>{if(wantsLock&&attempt===lockAttempt)view.dataset.look='drag';});
      }catch{view.dataset.look='drag';}
    }
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===view,previous=wasLocked;
      wasLocked=locked;
      if(locked){
        if(!wantsLock||!config.running()){releaseLook();return;}
        view.dataset.look='locked';drag=null;
      }else if(previous&&wantsLock){
        wantsLock=false;view.dataset.look='idle';clear();
        if(config.running())config.onUnlock?.();
      }
    });
    function look(dx,dy,sensitivity){
      const p=config.state().pose;
      p.yaw=wrap(p.yaw+dx*sensitivity);
      p.pitch=clamp(p.pitch-dy*sensitivity,-.63,.57);
    }
    document.addEventListener('mousemove',e=>{
      if(document.pointerLockElement===view&&config.running())look(e.movementX,e.movementY,.0023);
    });
    sprintButton?.addEventListener('click',e=>{
      e.preventDefault();if(config.running())toggleSprint(!sprintToggle);
    });
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
      if(document.pointerLockElement===view){
        if(e.button===0&&config.running()){e.preventDefault();config.use?.();}return;
      }
      if(drag || !config.running() || e.button!==0)return;e.preventDefault();view.setPointerCapture(e.pointerId);
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0};
    });
    view.addEventListener('pointermove',e=>{
      if(!drag || drag.id!==e.pointerId || !config.running())return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      look(dx,dy,e.pointerType==='touch'?.0039:.004);
      drag.travel+=Math.abs(dx)+Math.abs(dy);drag.x=e.clientX;drag.y=e.clientY;
    });
    view.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId && drag.travel<5 && config.running())config.use?.();});
    view.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)drag=null;});
    const codes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'];
    window.addEventListener('keydown',e=>{
      if(!config.running()||e.altKey||e.ctrlKey||e.metaKey||!codes.includes(e.code))return;
      e.preventDefault();keys.add(e.code);
    });
    window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clear);
    let focal=400;
    const resize=()=>{const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;ensureScene();scene?.resize();focal=Math.max(160,Math.min(w*.83,h*.97));view.style.perspective=focal+'px';};
    const observer=new ResizeObserver(resize);observer.observe(view);
    function frame(dt) {
      const p=config.state().pose;
      let distance=0,sprint=false;
      if(config.running()){
        const turn=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
        p.yaw=wrap(p.yaw+turn*2.05*dt);
        if(!config.state().job){
          const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))+stickY;
          const side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+stickX;
          sprint=sprintToggle||keys.has('ShiftLeft')||keys.has('ShiftRight');
          const speed=(sprint?5.3:3.1)*dt/Math.max(1,Math.hypot(forward,side)),sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
          const oldX=p.x,oldZ=p.z;
          p.x=clamp(p.x+(sin*forward+cos*side)*speed,-aisleWidth,aisleWidth);
          p.z=clamp(p.z+(-cos*forward+sin*side)*speed,-2.04,2.04);
          distance=Math.hypot(p.x-oldX,p.z-oldZ);
          if(sprint&&distance>0)config.onSprint?.(distance);
        }
      }
      world.style.transform='translateZ('+focal+'px) rotateX('+p.pitch+'rad) rotateY('+p.yaw+'rad) translate3d('+(-p.x*unit)+'px,'+(eye*unit)+'px,'+(-p.z*unit)+'px)';
      ensureScene();if(scene)scene.frame(dt,p,distance,sprint);else tickFallback();
    }
    function pulse(id){
      if(id==='tea0'||id==='tea1')id='tea';
      if(scene){scene.pulse(id);return;}
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const item=points.get(id)?.firstElementChild;
      item?.animate([{transform:'translateY(0)'},{transform:'translateY(-5px)'},{transform:'translateY(0)'}],{duration:250});
    }
    return {frame,paint,pulse,clear,resize,captureLook,releaseLook,turn(amount){const p=config.state().pose;p.yaw=wrap(p.yaw+amount);}};
  }
  return {stations,spot,guestSpot,nearest,direction,spawn,bounded,create,reach,secondsLeft};
})();
