import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';

function processor() {
  let Processor: any;
  vm.runInNewContext(readFileSync('public/audio/meewav-pitch-correction.worklet.js','utf8'),{
    AudioWorkletProcessor: class {port={onmessage:null};},sampleRate:48000,
    registerProcessor: (_name:string,value:unknown)=>{Processor=value;},
  });
  const value=new Processor();
  value.port.onmessage({data:{type:'parameters',value:{tuneEnabled:true,tuneKey:'C',tuneScale:'Majeure',tuneAmount:1,tuneSpeed:1,tuneHumanize:0}}});
  return value;
}
function energy(samples:number[],frequency:number) {
  let real=0,imaginary=0;
  samples.forEach((v,i)=>{real+=v*Math.cos(2*Math.PI*frequency*i/48000);imaginary+=v*Math.sin(2*Math.PI*frequency*i/48000);});
  return real*real+imaginary*imaginary;
}
describe('autotune Meewav — véritable processeur audio',()=>{
  it('corrige 228 Hz vers La 220 Hz en Do majeur, puis retrouve le bypass sec',()=>{
    const dsp=processor(),samples:number[]=[];
    for(let block=0;block<1200;block++){
      const input=Float32Array.from({length:128},(_,i)=>.2*Math.sin(2*Math.PI*228*(block*128+i)/48000));
      const output=new Float32Array(128);dsp.process([[input]],[[output]]);
      expect(output.every(v=>Number.isFinite(v)&&Math.abs(v)<.25)).toBe(true);
      if(block>600)samples.push(...output);
    }
    expect(energy(samples,220)).toBeGreaterThan(energy(samples,228)*4);
    dsp.port.onmessage({data:{type:'parameters',value:{tuneEnabled:false}}});
    const input=new Float32Array(128).fill(.1),output=new Float32Array(128);
    for(let i=0;i<100;i++)dsp.process([[input]],[[output]]);
    expect([...output]).toEqual([...input]);
  },15_000);
  it('reste silencieux sans entrée et isole les valeurs non finies',()=>{
    const dsp=processor(),output=new Float32Array(128);
    dsp.process([],[[output]]);expect(output.every(v=>v===0)).toBe(true);
    dsp.process([[new Float32Array([NaN,Infinity,-Infinity])]],[[output]]);
    expect(output.every(v=>Number.isFinite(v))).toBe(true);
  });
});
