/** Guest persistence is explicit; a private organization payload must remain memory-only. */
export function persistGuest(storage:Pick<Storage,'setItem'>,value:unknown,privateOwnerId:string|null){if(privateOwnerId!==null)return false;storage.setItem('automation-current',JSON.stringify(value));return true;}
