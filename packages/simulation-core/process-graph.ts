import type {SimulationScenarioV2} from './contracts';

export type ProcessNode=SimulationScenarioV2['process']['nodes'][number];
export type ProcessEdge=SimulationScenarioV2['process']['edges'][number];

export type CompiledProcessGraph={
 source:ProcessNode;
 sinks:ProcessNode[];
 nodesById:Map<string,ProcessNode>;
 outgoing:Map<string,ProcessEdge[]>;
 incoming:Map<string,ProcessEdge[]>;
 chooseEdge:(node:ProcessNode,random:()=>number)=>ProcessEdge;
};

const EPS=1e-9;

export function compileProcessGraph(scenario:SimulationScenarioV2):CompiledProcessGraph{
 const nodesById=new Map(scenario.process.nodes.map(node=>[node.id,node] as const));
 const sources=scenario.process.nodes.filter(node=>node.kind==='source');
 const sinks=scenario.process.nodes.filter(node=>node.kind==='sink');
 if(sources.length!==1)throw new Error('Process graph requires exactly one source.');
 if(!sinks.length)throw new Error('Process graph requires at least one sink.');
 const outgoing=new Map<string,ProcessEdge[]>(),incoming=new Map<string,ProcessEdge[]>();
 for(const node of scenario.process.nodes){outgoing.set(node.id,[]);incoming.set(node.id,[]);}
 for(const edge of scenario.process.edges){
  outgoing.get(edge.from)!.push(edge);
  incoming.get(edge.to)!.push(edge);
 }
 for(const node of scenario.process.nodes){
  const out=outgoing.get(node.id)!,inc=incoming.get(node.id)!;
  if(node.kind==='source'){
   if(inc.length!==0||out.length!==1)throw new Error('Process source must have zero incoming and exactly one outgoing edge.');
  }else if(node.kind==='sink'){
   if(out.length!==0||inc.length<1)throw new Error('Process sink must be terminal and reachable through at least one incoming edge.');
  }else if(node.kind==='decision'){
   if(inc.length<1||out.length<2)throw new Error('Decision node requires at least two outgoing branches.');
   if(out.some(edge=>edge.probability===undefined))throw new Error('Every decision branch requires probability.');
   const sum=out.reduce((total,edge)=>total+(edge.probability??0),0);
   if(Math.abs(sum-1)>EPS)throw new Error('Decision branch probabilities must sum to one.');
   if(out.some(edge=>(edge.probability??0)<=0))throw new Error('Decision branch probabilities must be greater than zero.');
  }else{
   if(inc.length<1||out.length!==1)throw new Error('Non-decision process nodes require at least one incoming and exactly one outgoing edge.');
   if(out[0].probability!==undefined)throw new Error('Probability is only valid on decision branches.');
  }
 }
 const reachable=new Set<string>(),queue=[sources[0].id];
 for(let head=0;head<queue.length;head++){
  const id=queue[head];if(reachable.has(id))continue;reachable.add(id);
  for(const edge of outgoing.get(id)??[])queue.push(edge.to);
 }
 if(reachable.size!==scenario.process.nodes.length)throw new Error('Process graph contains nodes unreachable from the source.');
 const canReachSink=new Set(sinks.map(sink=>sink.id)),reverseQueue=[...canReachSink];
 for(let head=0;head<reverseQueue.length;head++){
  const id=reverseQueue[head];
  for(const edge of incoming.get(id)??[])if(!canReachSink.has(edge.from)){
   canReachSink.add(edge.from);reverseQueue.push(edge.from);
  }
 }
 for(const id of reachable)if(!canReachSink.has(id))
  throw new Error('Process graph contains a cycle or branch that cannot reach any sink.');
 const chooseEdge=(node:ProcessNode,random:()=>number)=>{
  const edges=outgoing.get(node.id)??[];
  if(node.kind!=='decision')return edges[0];
  const value=random();let cumulative=0;
  for(const edge of edges){cumulative+=edge.probability!;if(value<cumulative)return edge;}
  return edges.at(-1)!;
 };
 return {source:sources[0],sinks,nodesById,outgoing,incoming,chooseEdge};
}
