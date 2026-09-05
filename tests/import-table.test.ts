import {expect,it} from 'vitest';
import Papa from 'papaparse';
import catalog from '../data/catalog.json';
import {parseCsv,parseTableRows,checkXlsxSize} from '../packages/importer/table';
import {validateImport} from '../packages/importer';
it('round trips a real source reference without upgrading its license',()=>{const rows=[['recordType','payload'],['source',JSON.stringify(catalog.sources[0])],['product',JSON.stringify(catalog.products[0])]];const result=parseCsv(Papa.unparse(rows));expect(result.sources[0]).toEqual(catalog.sources[0]);expect(result.products[0]).toEqual(catalog.products[0]);expect(validateImport(result).valid).toBe(false);});
it('rejects missing or ambiguous mapping and non-XLSX input',()=>{expect(()=>parseTableRows([])).toThrow();expect(()=>parseCsv('name,price')).toThrow();expect(()=>checkXlsxSize(new ArrayBuffer(0))).toThrow();});
