import {it,expect} from 'vitest';
import {createAssessmentReport} from '../apps/web/report';
import {emptyDraft} from '../apps/web/Calculations';
it('exports an incomplete assessment without invented figures and escapes untrusted text',()=>{
 const html=createAssessmentReport({name:'',objectType:'warehouse',goal:'cost',familyId:'transport',description:'<script>alert(1)</script>',draft:emptyDraft},[],[]);
 expect(html).toContain('Не хватает данных');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('Источник исходных измерений: Не указан');
});
