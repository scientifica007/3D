import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('artifacts', { recursive: true });
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl']});
const url=pathToFileURL(resolve('index.html')).href;
const errors=[];
async function setup(viewport,mobile=false){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#renderStatus').textContent.includes('جاهز'),{},{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#earthStatus').textContent.includes('3/3'),{},{timeout:30000});
  return page;
}
async function fullCanvas(page){
  const b=await page.evaluate(()=>{
    const r=document.querySelector('#gl').getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,iw:innerWidth,ih:innerHeight,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,touch:getComputedStyle(document.querySelector('#gl')).touchAction};
  });
  assert.ok(Math.abs(b.x)<=1&&Math.abs(b.y)<=1,'Canvas origin is viewport origin');
  assert.ok(Math.abs(b.w-b.iw)<=1&&Math.abs(b.h-b.ih)<=1,'Canvas fills viewport');
  assert.ok(b.docW<=b.iw+1&&b.docH<=b.ih+1,'No document scroll');
  assert.equal(b.touch,'none','Canvas receives free 3D touch gestures');
}
async function tab(page,name){
  if(!await page.locator('#commandPanel').isVisible())await page.locator('#menuOpen').click();
  await page.locator('[data-page="'+name+'"]').click();
  assert.equal(await page.locator('[data-page="'+name+'"]').getAttribute('aria-pressed'),'true');
}
async function close(page){
  if(await page.locator('#commandPanel').isVisible())await page.locator('#menuClose').click();
}
async function action(page,id){await tab(page,'scene');await page.locator('#'+id).click();}
async function range(page,id,v){await tab(page,'systems');await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);}
try{
  const page=await setup({width:1366,height:850});
  await fullCanvas(page);
  assert.equal(await page.locator('#commandPanel').isVisible(),false);
  assert.equal(await page.locator('#flightPanel').isVisible(),false);
  assert.equal(await page.locator('#labels').isVisible(),false);
  await page.waitForTimeout(400);
  const pixels=await page.evaluate(()=>{
    const c=document.querySelector('#gl'),g=c.getContext('webgl');
    return new Promise(resolve=>requestAnimationFrame(()=>{
      const w=c.width,h=c.height,b=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,b);let lit=0,bright=0;for(let i=0;i<b.length;i+=4){if(b[i]+b[i+1]+b[i+2]>65)lit++;if(b[i]+b[i+1]+b[i+2]>300)bright++;}resolve({lit,bright,total:w*h,error:g.getError()});
    }));
  });
  console.log('Framebuffer:',pixels);assert.equal(pixels.error,0);assert.ok(pixels.lit>pixels.total*.015);assert.ok(pixels.bright>100);
  await page.screenshot({path:'artifacts/desktop.png'});
  await tab(page,'units');
  assert.equal(await page.locator('#modules button').count(),6);
  assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  await page.locator('#modules button').nth(0).click();await page.locator('#detail button').click();
  await page.locator('#modules button').nth(1).click();await page.locator('#detail button').click();
  assert.equal(await page.locator('#progress').textContent(),'2 / 4');
  await range(page,'light',100);
  await page.waitForFunction(()=>document.querySelector('#progress').textContent==='3 / 4');
  await page.screenshot({path:'artifacts/systems.png'});
  await action(page,'tour');assert.equal(await page.locator('#tour').getAttribute('aria-pressed'),'true');await action(page,'tour');
  await action(page,'explode');await page.waitForFunction(()=>document.querySelector('#progress').textContent==='4 / 4');
  await action(page,'paths');assert.equal(await page.locator('#paths').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'artifacts/exploded.png'});
  await range(page,'light',0);await page.waitForFunction(()=>document.querySelector('#generation').textContent==='36 kW');
  assert.match(await page.locator('#warning').textContent(),/عجز/);
  await action(page,'play');const battery=await page.locator('#battery').textContent();await page.waitForTimeout(500);assert.equal(await page.locator('#battery').textContent(),battery);
  await tab(page,'mission');await page.locator('#restart').click();assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  await tab(page,'settings');await page.locator('#quality').selectOption('cinema');await close(page);await page.waitForTimeout(300);await page.screenshot({path:'artifacts/cinema.png'});
  await tab(page,'settings');await page.locator('#quality').selectOption('low');
  await tab(page,'flight');await page.locator('#pilot').click();assert.equal(await page.locator('#pilot').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#commandPanel').isVisible(),false);
  await fullCanvas(page);
  await page.locator('#flightCollapse').click();assert.equal(await page.locator('#flightPanel').isVisible(),false);await page.locator('#pilotQuick').click();assert.equal(await page.locator('#flightPanel').isVisible(),true);
  await page.locator('#autodock').click();await page.waitForFunction(()=>document.querySelector('#flightMessage').textContent.includes('التحام ناجح'),{},{timeout:60000});
  await page.screenshot({path:'artifacts/docking.png'});
  for(const view of ['top','planet','sun']){
    await tab(page,'settings');await page.locator('#camera').selectOption(view);await page.waitForTimeout(1000);
    assert.equal(await page.locator('#pilot').getAttribute('aria-pressed'),'false');
    await page.screenshot({path:'artifacts/'+view+'.png'});
  }
  await page.close();
  for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:760,height:360}]]){
    const mobile=await setup(viewport,true);
    await fullCanvas(mobile);
    await mobile.screenshot({path:'artifacts/'+name+'.png'});
    await tab(mobile,'systems');await fullCanvas(mobile);
    assert.equal(await mobile.locator('[data-screen="systems"]').isVisible(),true);
    assert.equal(await mobile.locator('[data-screen="settings"]').first().isVisible(),false);
    await mobile.screenshot({path:'artifacts/'+name+'-menu.png'});
    await close(mobile);
    await tab(mobile,'flight');await mobile.locator('#pilot').click();
    await fullCanvas(mobile);
    assert.equal(await mobile.locator('#flightPanel').isVisible(),true);
    await mobile.screenshot({path:'artifacts/'+name+'-pilot.png'});
    await mobile.locator('#flightCollapse').click();assert.equal(await mobile.locator('#flightPanel').isVisible(),false);
    await mobile.locator('#pilotQuick').click();assert.equal(await mobile.locator('#flightPanel').isVisible(),true);
    await mobile.locator('#cleanView').click();
    assert.equal(await mobile.locator('#menuOpen').isVisible(),false);
    assert.equal(await mobile.locator('#flightPanel').isVisible(),false);
    assert.equal(await mobile.locator('#sceneHud').isVisible(),false);
    await fullCanvas(mobile);
    await mobile.screenshot({path:'artifacts/'+name+'-clean.png'});
    await mobile.locator('#cleanView').click();
    assert.equal(await mobile.locator('#menuOpen').isVisible(),true);
    assert.equal(await mobile.locator('#flightPanel').isVisible(),true);
    await tab(mobile,'settings');await mobile.locator('#camera').selectOption('orbit');await close(mobile);
    const session=await mobile.context().newCDPSession(mobile);
    const x=Math.round(viewport.width*.35),y=Math.round(viewport.height*.65);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*12}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await mobile.evaluate(()=>scrollY),0,'Touch does not scroll document');
    await tab(mobile,'mission');assert.equal(await mobile.locator('#restart').isVisible(),true);
    await close(mobile);await mobile.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: real WebGL, Earth maps, simulation, docking, full viewport, contextual menus, portrait and landscape clean modes');
}finally{await browser.close();}
