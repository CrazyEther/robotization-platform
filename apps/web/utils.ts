export function download(name:string,content:string,type='application/json'){
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function api(path:string,method='GET',body?:unknown,token?:string){
 const response=await fetch('/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message??data.error??data.message??'Запрос не выполнен');return data;
}
export const number=(value:number|null|undefined)=>value==null?'Нет данных':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value);
