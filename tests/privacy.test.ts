import {expect,it,vi} from 'vitest';
import {persistGuest} from '../packages/catalog/privacy';
it('never writes an authenticated private empty payload to guest storage',()=>{const storage={setItem:vi.fn()};expect(persistGuest(storage,{},'authenticated-owner')).toBe(false);expect(storage.setItem).not.toHaveBeenCalled();});
it('retains explicitly local empty-state persistence',()=>{const storage={setItem:vi.fn()};expect(persistGuest(storage,{},null)).toBe(true);expect(storage.setItem).toHaveBeenCalledWith('automation-current','{}');});
