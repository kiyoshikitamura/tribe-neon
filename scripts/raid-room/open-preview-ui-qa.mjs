// PCでの手動QA用。既存のローカル専用QA sessionのみ使用し、認証情報は表示しない。
import {chromium} from '@playwright/test';
import {clients} from '../../outputs/raid-smoke.mjs';
const url='https://tribe-neon-arnbhwc0s-kiyoshi-kitamura.vercel.app';
const {data,error}=await clients.normal.auth.getSession();
if(error||!data.session)throw new Error('ローカルQAセッションを取得できません');
if(data.session.user.id!=='25975265-f042-4dd1-8ffc-a12f8414a035')throw new Error('QAユーザー不一致');
const browser=await chromium.launch({headless:false});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(s=>localStorage.setItem('sb-sufvuqdnqohpfzkwxohq-auth-token',JSON.stringify(s)),data.session);
const page=await context.newPage();await page.goto(url);console.log('Preview専用QA画面を開きました。ウィンドウを閉じると終了します。');
await new Promise(resolve=>browser.on('disconnected',resolve));
