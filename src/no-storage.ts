import { Member } from "member";
import { IStorage } from "./storage";

export class NoStorage implements IStorage {
  private _count = 0;

  get storageTypeName(): string {
    return 'None';
  }

  get memberTypeName(): string {
    return '(none)';
  }

  initialize(): Promise<void> {
    return new Promise(resolve => { resolve();});
  }

  terminate(): Promise<void> {
    return new Promise(resolve => { resolve();});
  }

  count(): Promise<number> {
    return new Promise(resolve => resolve(this._count));
  }

  lastIds(_: number): Promise<string[]> {
    return new Promise(resolve => resolve([]));
  }

  member(_: string): Promise<Member | undefined> {
    return new Promise(resolve => resolve(undefined));
  }

  exists(_: string): Promise<boolean> {
    return new Promise(resolve => resolve(false));
  }

  insertOrUpdate(id: string, _: Member): Promise<string> {
    return new Promise(resolve => {
      this._count += 1;
      resolve(id);
    });
  }

  deleteAll(): Promise<number> {
    return new Promise(resolve => {
      const count = this._count;
      this._count = 0;
      resolve(count);
    });
  }

}
