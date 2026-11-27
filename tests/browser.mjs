import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl']});
const url=pathToFileURL(resolve('index.html')).href;
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1366,height:850},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#renderStatus').textContent.includes('جاهز'),{},{timeout:30000});
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#modules button').count(),6);
  assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  // Verify a real framebuffer contains rendered geometry, not only the background.
  const pixels=await page.evaluate(()=>{
    const canvas=document.getElementById('gl'),gl=canvas.getContext('webgl');
    return new Promise(resolve=>requestAnimationFrame(()=>{
      const w=canvas.width,h=canvas.height,b=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
      let lit=0,bright=0;for(let i=0;i<b.length;i+=4){if(b[i]+b[i+1]+b[i+2]>65)lit++;if(b[i]+b[i+1]+b[i+2]>300)bright++}
      resolve({lit,bright,total:w*h,error:gl.getError()});
    }));
  });
  console.log('Framebuffer:',pixels);
  assert.equal(pixels.error,0);
  assert.ok(pixels.lit>pixels.total*.015,'Expected visible 3D objects');
  assert.ok(pixels.bright>100,'Expected lit geometry');
  await page.screenshot({path:'artifacts/desktop.png'});
  await page.locator('#modules button').nth(0).click();
  await page.locator('#detail button').click();
  await page.locator('#modules button').nth(1).click();
  await page.locator('#detail button').click();
  await page.waitForFunction(()=>document.querySelector('#progress').textContent==='3 / 4');
  await page.locator('#explode').click();
  await page.waitForFunction(()=>document.querySelector('#progress').textContent==='4 / 4');
  await page.locator('#paths').click();
  assert.equal(await page.locator('#paths').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'artifacts/exploded.png'});
  await page.locator('#light').evaluate(e=>{e.value=0;e.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelector('#generation').textContent==='36 kW');
  assert.match(await page.locator('#warning').textContent(),/عجز/);
  await page.locator('#play').click();
  const battery=await page.locator('#battery').textContent();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#battery').textContent(),battery);
  await page.locator('#restart').click();
  assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(url);
  await mobile.waitForFunction(()=>document.querySelector('#renderStatus').textContent.includes('جاهز'));
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
  await mobile.screenshot({path:'artifacts/mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: actual WebGL framebuffer, interaction, mission, energy, pause, reset, responsive mobile');
} finally { await browser.close() }
