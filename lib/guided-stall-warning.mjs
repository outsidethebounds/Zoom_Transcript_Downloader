export const GUIDED_STALL_WARNING_DELAY_MS = 3 * 60 * 1000;

// A read-only watchdog: it only reports prolonged absence of count progress.
export function createGuidedStallWatch({setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout,onStall,delayMs=GUIDED_STALL_WARNING_DELAY_MS}){
 let timer=null,active=false,lastProgress=null,warned=false;
 function arm(){if(timer!==null)clearTimeoutFn(timer);timer=setTimeoutFn(()=>{timer=null;if(active&&!warned){warned=true;onStall?.()}},delayMs)}
 return {
  start(progress){active=true;warned=false;lastProgress=progressKey(progress);arm()},
  progress(progress){if(!active)return false;const key=progressKey(progress);if(key===lastProgress)return false;lastProgress=key;warned=false;arm();return true},
  terminal(){active=false;lastProgress=null;warned=false;if(timer!==null)clearTimeoutFn(timer);timer=null},
  isActive(){return active}
 };
}
function progressKey(progress){if(!progress||typeof progress!=='object')return null;return ['saved','skipped','duplicatesAvoided','failed','pending','total'].map(key=>Number.isFinite(Number(progress[key]))?Number(progress[key]):'').join(':')}
