interface Wasm {
  memory:WebAssembly.Memory;
  allocate:(size:number)=>number;
  release:(ptr:number,len:number)=>void;
  request:(ptr:number,len:number)=>number;
  output_len:()=>number;
}
export class Rules {
  private wasm!:Wasm;
  private encoder=new TextEncoder();
  private decoder=new TextDecoder();
  async init() {
    const response=await fetch('/engine.wasm',{cache:'no-store'});
    if(!response.ok)throw new Error('Rules engine could not load.');
    const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{env:{random_bytes:(ptr:number,len:number)=>crypto.getRandomValues(new Uint8Array(this.wasm.memory.buffer,ptr,len))}});
    this.wasm=instance.exports as unknown as Wasm;
  }
  call<T>(request:Record<string,unknown>):T {
    const bytes=this.encoder.encode(JSON.stringify(request));
    const ptr=this.wasm.allocate(bytes.length);
    new Uint8Array(this.wasm.memory.buffer,ptr,bytes.length).set(bytes);
    try {
      const output=this.wasm.request(ptr,bytes.length);
      const result=JSON.parse(this.decoder.decode(new Uint8Array(this.wasm.memory.buffer,output,this.wasm.output_len())));
      if(result.error)throw new Error(result.error);
      return result as T;
    }finally{this.wasm.release(ptr,bytes.length);}
  }
}
