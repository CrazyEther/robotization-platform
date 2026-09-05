import Papa from 'papaparse';
/** Mapping 1: source/product records remain complete JSON, never infer unknown columns. */
export function parseTableRows(rows:unknown[][]){
 if(!rows.length||rows.length>1501)throw new Error('Таблица должна содержать заголовок и не более 1500 записей');
 if(rows[0].length!==2||rows[0][0]!=='recordType'||rows[0][1]!=='payload')throw new Error('Mapping 1 ожидает ровно два столбца: recordType, payload');
 const sources:unknown[]=[],products:unknown[]=[];
 for(let i=1;i<rows.length;i++){const row=rows[i];if(row.every(v=>v===null||v===''))continue;if(row.length!==2||typeof row[1]!=='string')throw new Error(`Строка ${i+1}: требуется JSON в payload`);let value:unknown;try{value=JSON.parse(row[1]);}catch{throw new Error(`Строка ${i+1}: некорректный JSON`);}if(row[0]==='source')sources.push(value);else if(row[0]==='product')products.push(value);else throw new Error(`Строка ${i+1}: recordType должен быть source или product`);}
 return {mappingVersion:'1',sources,products};
}
export function parseCsv(text:string){const parsed=Papa.parse<string[]>(text,{skipEmptyLines:true});if(parsed.errors.length)throw new Error(parsed.errors.map(e=>e.message).join('; '));return parseTableRows(parsed.data);}
/** Preflight the ZIP central directory before a browser XLSX parser allocates inflated XML. */
export function checkXlsxSize(buffer:ArrayBuffer){const data=new DataView(buffer);let found=0,total=0;for(let offset=0;offset+46<=data.byteLength;offset++){if(data.getUint32(offset,true)!==0x02014b50)continue;found++;const size=data.getUint32(offset+24,true);if(size===0xffffffff)throw new Error('ZIP64 не поддерживается');total+=size;if(total>20_000_000||found>200)throw new Error('Распакованная таблица превышает лимит 20 МБ / 200 файлов');offset+=45+data.getUint16(offset+28,true)+data.getUint16(offset+30,true)+data.getUint16(offset+32,true);}if(!found)throw new Error('Файл не является поддерживаемым XLSX');}
